# RocketMQ 延迟消息（定时消息）4.9.3 版本优化 异步投递支持

[TOC]

# 1. 概述

在 RocketMQ 4.9.3 版本中，[@Git-Yang](https://github.com/Git-Yang) 对延迟消息做了很大的优化，大幅度提升了延迟消息的性能。

其中，[PR#3287](https://github.com/apache/rocketmq/pull/3287) 将原先用来启动周期性任务的 `Timer` 改为使用 `ScheduledExecutorService`，将多延迟等级下同时发送延迟消息的性能提升了 3+ 倍。

本文主要讲解的是另一个改动 [PR#3458](https://github.com/apache/rocketmq/pull/3458)：支持延迟消息的异步投递。老版本中，延迟消息到期投递到 CommitLog 的动作是同步的，在 Dledger 模式下性能很差。新的改动将延迟消息的到期投递模式改为可配置，使用 BrokerConfig 的 `enableScheduleAsyncDeliver` 属性进行配置。改成异步投递后，在 Dledger 下的性能提升了 3 倍左右。

本文着重讲解定时消息异步投递的逻辑，老版本的延迟消息流程和源码解析可以看这篇文章：[RocketMQ 延迟消息（定时消息）](https://github.com/HScarb/knowledge/blob/master/rocketmq/RocketMQ%20%E5%BB%B6%E8%BF%9F%E6%B6%88%E6%81%AF%EF%BC%88%E5%AE%9A%E6%97%B6%E6%B6%88%E6%81%AF%EF%BC%89.md)

# 2. 改动解析

## 2.1 将多延迟等级延迟消息扫描和投递的任务从单线程执行改为多线程

这个改动将延迟消息的任务调度器从 `Timer` 改为 `ScheduledExecutorService`。

在老版本中，所有 18 个延迟等级的定时消息扫描和投递任务都是由一个 `Timer` 启动定时任务执行的。`Timer` 中所有定时任务都是由**一个工作线程单线程处理**的，如果某个任务处理慢了，后续有新的任务进来，会导致新的任务需要等待前一个任务执行结束。

改为 `ScheduledExecutorService` 线程池之后多线程处理任务，可以大幅度提高延迟消息处理速度，并且避免多延迟等级消息同时发送时造成的阻塞。

---

改动后的性能变化，出处：https://github.com/apache/rocketmq/issues/3286

* 改动前，同时向 4 个延迟等级发送延迟消息，TPS: 657
  ​ ![改动前，同时向 4 个延迟等级发送延迟消息](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203152329113.png)

* 改动后，同时向4个延迟等级发送延迟消息，TPS: 2453

  ![改动后，同时向4个延迟等级发送延迟消息](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203152330256.png)

## 2.2 支持延迟消息异步投递，提升 Dledger 模式下的投递性能

原本的定时消息投递为单线程同步投递，在 DLedger 模式下存在性能瓶颈。

因为在 DLedger 模式下，主节点的角色会变为 SYNC_MASTER，同步复制。即需要足够多的从节点存储了该消息后，才会向主节点返回写入成功。

本次改动将延迟消息的写入改成可配置同步或异步写入，异步写入在 DLedger 模式下性能提升了 3 倍左右。

### 2.2.1 异步投递的注意点

异步投递的两个主要缺点是

1. 无法保证消息投递的顺序
2. 消息可能重复投递

异步投递的注意点

* 需要做流控，当写入 TPS 过高时，页缓存可能会繁忙；甚至节点内存会被打爆。

* 可能存在消息可能丢失的情况，比如投递时页缓存繁忙或者其他原因导致一次投递失败。这时候的处理是对失败消息进行重新投递，重试 3 次失败后，阻塞当前延迟等级对应的线程，直到重新投递成功。

### 2.2.2 异步投递逻辑

首先回顾一下**同步投递**的逻辑：每个延迟等级都分配一个线程，不断启动任务去扫描该等级对应的消费队列中是否有到期的消息。如果有则将到期的消息一个个同步投递，投递成功后更新该等级对应的 offset，下个任务从该 offset 开始扫描新的消息。

---

**异步投递**的逻辑相比于同步投递有一些不同：

异步投递采用了生产-消费模式，生产和消费的对象是异步投递的任务。生产者线程负责将到期的消息创建投递任务，消费者消费这些任务，根据任务的执行状态来更新 offset 或者重试。
这里引入了一个**阻塞队列**作为异步投递任务的容器，阻塞队列的大小可以配置，表示可以同时投递的消息数。当队列中投递任务满时触发流控。

![](https://raw.githubusercontent.com/HScarb/knowledge/master/assets/delay_msg_new_pattern.drawio.png)

将对应延迟等级的消息异步投递时，需要将异步投递的任务放入处理队列。此时，可能由于流控等原因，投递任务未能放入队列，那么等待一会后再次执行扫描-投递逻辑。

消息并不会直接投递成功，所以需要消费者线程从队列中消费并判断这些异步投递任务的状态。如果投递任务已完成，则更新 offset；如果投递异常，则等待一会后重新同步投递；投递成功则更新 offset，投递失败则继续重试。

# 3. 异步投递详解

延迟消息的投递逻辑全部在 `ScheduleMessageService` 类中。

下面以一个延迟等级的处理为例，用图展示一下消息投递线程和任务更新线程的工作流程。

![](https://raw.githubusercontent.com/HScarb/knowledge/master/assets/delay_msg_new_activity.drawio.png)

左边是定时消息到期投递线程，右边是投递过程状态更新线程。

## 3.1 定时消息投递线程

延迟消息投递服务中维护了一个 offset 表`offsetTable`，表示每个延迟等级当前投递的消息在 ConsumeQuque 中的逻辑 offset。
它用来在关机恢复时标明扫描开始位置，所以这个表会定期持久化到磁盘中，并且从节点会定期从主节点拉去该表的最新值。

延迟消息处理服务启动时会在 `deliverExecutorService` 线程池为每个延迟等级创建并执行一个 `DeliverDelayedMessageTimerTask` 任务，这个任务并不是周期性任务，而是在一个任务的末尾执行下一个任务。这个任务的 `executeOnTimeup()` 方法即消息投递的逻辑。上图展示的就是该方法中的逻辑。

1. 获取该等级的 ConsumeQueue，依次扫描消息是否到期
2. 如果消息到期，从 CommitLog 中查出该消息的完整信息，从属性中恢复它的真实 Topic 和 QueueId，然后投递。（根据配置同步或者异步投递，这里按异步讲解）
3. 异步消息投递后，投递的过程被放入阻塞队列 `deliverPendingTable`
4. 如果放入队列失败，表示此时出现流控或者阻塞，需要等待一会然后重新投递
5. 如果全部投递成功，将 offset 更新为当前投递消息的 offset + 1，表示下一次从下一个 offset 开始扫描

## 3.2 投递过程状态更新线程

每个延迟等级在 `handleExecutorService` 线程池中启动了一个状态更新线程，每个线程执行 `HandlePutResultTask` 任务。同样，这个任务不是周期性任务，而是一个任务末尾启动一个新的任务。

`HandlePutResultTask` 任务不断从阻塞队列头部获取异步投递过程对象，判断其状态

* 如果投递成功，更新 offset 和统计数据，并从队列中移除投递任务
* 如果投递中，无动作
* 如果投递错误，根据是否配置自动重试来执行重试或者直接跳过
* 重试投递时采用同步投递，投递成功则更新 offset 和统计数据，然后移除；否则继续重新投递

全部任务扫描完毕后等待一会，执行新的`HandlePutResultTask` 任务。

# 4. 源码解析

## 4.1 定时消息投递任务

```java
public void executeOnTimeup() {
    // 根据delayLevel查找对应的延迟消息ConsumeQueue
    ConsumeQueue cq =
        ScheduleMessageService.this.defaultMessageStore.findConsumeQueue(TopicValidator.RMQ_SYS_SCHEDULE_TOPIC,
                                                                         delayLevel2QueueId(delayLevel));

    if (cq == null) {
        this.scheduleNextTimerTask(this.offset, DELAY_FOR_A_WHILE);
        return;
    }

    // 根据ConsumeQueue的有效延迟消息逻辑offset，获取所有有效的消息
    SelectMappedBufferResult bufferCQ = cq.getIndexBuffer(this.offset);
    if (bufferCQ == null) {
        long resetOffset;
        if ((resetOffset = cq.getMinOffsetInQueue()) > this.offset) {
            log.error("schedule CQ offset invalid. offset={}, cqMinOffset={}, queueId={}",
                      this.offset, resetOffset, cq.getQueueId());
        } else if ((resetOffset = cq.getMaxOffsetInQueue()) < this.offset) {
            log.error("schedule CQ offset invalid. offset={}, cqMaxOffset={}, queueId={}",
                      this.offset, resetOffset, cq.getQueueId());
        } else {
            resetOffset = this.offset;
        }

        this.scheduleNextTimerTask(resetOffset, DELAY_FOR_A_WHILE);
        return;
    }

    long nextOffset = this.offset;
    try {
        int i = 0;
        ConsumeQueueExt.CqExtUnit cqExtUnit = new ConsumeQueueExt.CqExtUnit();
        // 遍历ConsumeQueue中的所有有效消息
        for (; i < bufferCQ.getSize() && isStarted(); i += ConsumeQueue.CQ_STORE_UNIT_SIZE) {
            // 获取ConsumeQueue索引的三个关键属性
            long offsetPy = bufferCQ.getByteBuffer().getLong();
            int sizePy = bufferCQ.getByteBuffer().getInt();
            long tagsCode = bufferCQ.getByteBuffer().getLong();

            if (cq.isExtAddr(tagsCode)) {
                if (cq.getExt(tagsCode, cqExtUnit)) {
                    tagsCode = cqExtUnit.getTagsCode();
                } else {
                    //can't find ext content.So re compute tags code.
                    log.error("[BUG] can't find consume queue extend file content!addr={}, offsetPy={}, sizePy={}",
                              tagsCode, offsetPy, sizePy);
                    long msgStoreTime = defaultMessageStore.getCommitLog().pickupStoreTimestamp(offsetPy, sizePy);
                    tagsCode = computeDeliverTimestamp(delayLevel, msgStoreTime);
                }
            }
            // ConsumeQueue里面的tagsCode实际是一个时间点（投递时间点）
            long now = System.currentTimeMillis();
            long deliverTimestamp = this.correctDeliverTimestamp(now, tagsCode);
            nextOffset = offset + (i / ConsumeQueue.CQ_STORE_UNIT_SIZE);

            // 如果现在已经到了投递时间点，投递消息
            // 如果现在还没到投递时间点，继续创建一个定时任务，countdown秒之后执行
            long countdown = deliverTimestamp - now;
            if (countdown > 0) {
                this.scheduleNextTimerTask(nextOffset, DELAY_FOR_A_WHILE);
                return;
            }

            MessageExt msgExt = ScheduleMessageService.this.defaultMessageStore.lookMessageByOffset(offsetPy, sizePy);
            if (msgExt == null) {
                continue;
            }

            MessageExtBrokerInner msgInner = ScheduleMessageService.this.messageTimeup(msgExt);
            if (TopicValidator.RMQ_SYS_TRANS_HALF_TOPIC.equals(msgInner.getTopic())) {
                log.error("[BUG] the real topic of schedule msg is {}, discard the msg. msg={}",
                          msgInner.getTopic(), msgInner);
                continue;
            }
            // 重新投递消息到CommitLog
            boolean deliverSuc;
            if (ScheduleMessageService.this.enableAsyncDeliver) {
                // 异步投递
                deliverSuc = this.asyncDeliver(msgInner, msgExt.getMsgId(), offset, offsetPy, sizePy);
            } else {
                // 同步投递
                deliverSuc = this.syncDeliver(msgInner, msgExt.getMsgId(), offset, offsetPy, sizePy);
            }

            // 投递失败（流控、阻塞、投递异常等原因），等待0.1s再次执行投递任务
            if (!deliverSuc) {
                this.scheduleNextTimerTask(nextOffset, DELAY_FOR_A_WHILE);
                return;
            }
        }

        nextOffset = this.offset + (i / ConsumeQueue.CQ_STORE_UNIT_SIZE);
    } catch (Exception e) {
        log.error("ScheduleMessageService, messageTimeup execute error, offset = {}", nextOffset, e);
    } finally {
        bufferCQ.release();
    }

    // 该条ConsumeQueue索引对应的消息如果未到投递时间，那么创建一个定时任务，到投递时间时执行
    // 如果有还未投递的消息，创建定时任务后直接返回
    this.scheduleNextTimerTask(nextOffset, DELAY_FOR_A_WHILE);
}
```

```java
private boolean asyncDeliver(MessageExtBrokerInner msgInner, String msgId, long offset, long offsetPy,
    int sizePy) {
    Queue<PutResultProcess> processesQueue = ScheduleMessageService.this.deliverPendingTable.get(this.delayLevel);

    //Flow Control 流控，如果阻塞队列中元素数量大于阈值则触发流控
    int currentPendingNum = processesQueue.size();
    int maxPendingLimit = ScheduleMessageService.this.defaultMessageStore.getMessageStoreConfig()
        .getScheduleAsyncDeliverMaxPendingLimit();
    if (currentPendingNum > maxPendingLimit) {
        log.warn("Asynchronous deliver triggers flow control, " +
            "currentPendingNum={}, maxPendingLimit={}", currentPendingNum, maxPendingLimit);
        return false;
    }

    //Blocked 阻塞，如果有一个投递任务重试 3 次以上，阻塞该延迟等级的消息投递，直到该任务投递成功
    PutResultProcess firstProcess = processesQueue.peek();
    if (firstProcess != null && firstProcess.need2Blocked()) {
        log.warn("Asynchronous deliver block. info={}", firstProcess.toString());
        return false;
    }

    PutResultProcess resultProcess = deliverMessage(msgInner, msgId, offset, offsetPy, sizePy, true);
    processesQueue.add(resultProcess);
    return true;
}
```

## 4.2 异步投递过程状态更新任务

```java
public void run() {
    LinkedBlockingQueue<PutResultProcess> pendingQueue =
        ScheduleMessageService.this.deliverPendingTable.get(this.delayLevel);

    PutResultProcess putResultProcess;
    // 循环获取队列中第一个投递任务，查看其执行状态并执行对应操作
    while ((putResultProcess = pendingQueue.peek()) != null) {
        try {
            switch (putResultProcess.getStatus()) {
                case SUCCESS:
                    // 消息投递成功，从队列中移除该投递任务
                    ScheduleMessageService.this.updateOffset(this.delayLevel, putResultProcess.getNextOffset());
                    pendingQueue.remove();
                    break;
                case RUNNING:
                    // 正在投递，不做操作
                    break;
                case EXCEPTION:
                    // 投递出错
                    if (!isStarted()) {
                        log.warn("HandlePutResultTask shutdown, info={}", putResultProcess.toString());
                        return;
                    }
                    log.warn("putResultProcess error, info={}", putResultProcess.toString());
                    // onException 方法执行重试
                    putResultProcess.onException();
                    break;
                case SKIP:
                    // 跳过，直接从队列中移除
                    log.warn("putResultProcess skip, info={}", putResultProcess.toString());
                    pendingQueue.remove();
                    break;
            }
        } catch (Exception e) {
            log.error("HandlePutResultTask exception. info={}", putResultProcess.toString(), e);
            putResultProcess.onException();
        }
    }

    // 等待0.01s，继续下一次扫描
    if (isStarted()) {
        ScheduleMessageService.this.handleExecutorService
            .schedule(new HandlePutResultTask(this.delayLevel), DELAY_FOR_A_SLEEP, TimeUnit.MILLISECONDS);
    }
}
```



```java
private void resend() {
    log.info("Resend message, info: {}", this.toString());

    // Gradually increase the resend interval.
    try {
        Thread.sleep(Math.min(this.resendCount++ * 100, 60 * 1000));
    } catch (InterruptedException e) {
        e.printStackTrace();
    }

    try {
        // 从 CommitLog 中查询消息完整信息
        MessageExt msgExt = ScheduleMessageService.this.defaultMessageStore.lookMessageByOffset(this.physicOffset, this.physicSize);
        // 如果查询失败，检查重试次数，如果到达 6 次则打印日志并跳过该消息
        if (msgExt == null) {
            log.warn("ScheduleMessageService resend not found message. info: {}", this.toString());
            this.status = need2Skip() ? ProcessStatus.SKIP : ProcessStatus.EXCEPTION;
            return;
        }

        MessageExtBrokerInner msgInner = ScheduleMessageService.this.messageTimeup(msgExt);
        // 同步投递
        PutMessageResult result = ScheduleMessageService.this.writeMessageStore.putMessage(msgInner);
        // 根据结果更新状态
        this.handleResult(result);
        if (result != null && result.getPutMessageStatus() == PutMessageStatus.PUT_OK) {
            log.info("Resend message success, info: {}", this.toString());
        }
    } catch (Exception e) {
        this.status = ProcessStatus.EXCEPTION;
        log.error("Resend message error, info: {}", this.toString(), e);
    }
}
```

---

欢迎关注公众号【消息中间件】，更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
