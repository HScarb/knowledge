# RocketMQ 消费者（5）消息消费、消费进度上报 流程详解 & 源码解析

## 1. 背景

本文是 RocketMQ 消费者系列的第五篇，主要介绍并发消费者的消费和消费进度上报的流程。

我把 RocketMQ 消费分成如下几个步骤

1. 重平衡
2. 消费者拉取消息
3. Broker 接收拉取请求后从存储中查询消息并返回
4. 消费者消费消息

本文介绍的是步骤 4。RocketMQ 的消费还分并发消费和顺序消费，顺序消费将会在下一篇进行讲解。

## 2. 概要设计

### 2.1 推模式并发消费交互流程

RocketMQ 推模式下有并发消费和顺序消费两种消费模式。并发消费，顾名思义，将由一个消费线程池并行处理消费逻辑，消费速度较快。

![](https://raw.githubusercontent.com/HScarb/knowledge/master/assets/rocketmq-consume-message/rocketmq-consumer-message-consume-struct.drawio.png)

默认为消费线程池设置 20 个线程。从上一步拉取消息到消费者后，将拉取到的一批消息提交给并发消费服务，并发消费服务将消息封装成一个个消费请求（每个消费请求将消费一批消息，默认一批只包含一条消息）提交给消费线程池进行消费。

消费时将会调用订阅时注册的消费监听器中的业务方法，执行真正的业务逻辑，然后处理消费结果。

如果消费成功，则更新消费进度。如果消费失败，则需要将失败的消息发回 Broker，一段时间后进行重新消费。

总结一下，推模式并发消费主要的步骤为：

1. 从拉取到的消息保存的处理队列获取消息，封装成消费请求，提交到消费线程池进行并发消费
2. 调用注册的监听器执行消费逻辑
3. 消费结果处理
   * 消费成功则将这批消息从处理队列中移除，并更新消费进度
   * 消费失败则将失败的消息发回 Broker，利用延迟消息特性，过一段时间将会再次收到这些消息进行消费

### 2.2 重试消费设计

为了保证消息消费的高可靠性，RocketMQ 默认提供了重试消费和死信队列功能。消费失败的消息将会过一段时间后重新消费，每次重新消费的时间间隔将会逐渐增加。当重新消费次数超过最大阈值时，消息将会被放入死信队列，为用户提供了主动处理这些消费多次失败的消息的可能。

重试消费需要在消费结果处理的步骤中进行判断，如果消息消费失败，则将消息发回给 Broker。

Broker 收到请求后用延迟消息机制，用该消息重新消费的次数计算延迟等级，生成一个新消息，将重新消费次数 + 1，作为延迟消息放入消息存储。

延迟到期后该消息将被重新投递到消费者。

初始的延迟为 30s，每次重试消费失败后延迟等级会增加，最后一次延迟 2 小时。如果仍然消费失败，则会被放入死信 Topic。

### 2.3 消费进度管理设计

广播模式下，每个消费者都要消费全量消息，消费者之间不需要共享消费进度，所以消费进度可以存在本地。

集群模式下，多个消费者共同消费一个 Topic，还存在重平衡的可能性，所以需要共享消费进度，这样的话消费进度存在 Broker 端比较好。

RocketMQ 为广播模式和集群模式分别创建了消费进度存储类。

#### 2.3.1 广播模式消费进度管理

广播模式的消费者本地存储进度比较简单，它包含一个内存中的消费进度缓存表，用来实时更新。客户端实例启动时会启动定时任务，每 5s 将内存中的消费进度持久化到磁盘。

#### 2.3.2 集群模式消费进度管理

集群模式的消费进度管理涉及到消费者端和 Broker 端，每端都有一个消费进度管理器。消费者端仅保存一个消费进度内存缓存表，用来让消费者实时上报消费进度。客户端实例启动时的定时任务每 5s 会让消费者端的管理器向 Broker 端发送持久化请求。

Broker 端也包含一个消费进度内存缓存表，每 5s 会收到消费者端的请求，更新内存缓存表。Broker 启动时也会启动定时任务，每 10s 将消费进度管理器的内存缓存持久化到磁盘。

#### 2.3.3 消费者更新消费进度

推模式消费者在处理消费结果的逻辑中，如果消费成功则会更新消费进度。

拉模式消费者则需要用户自行调用消费者的方法触发消费进度更新。

## 3. 详细设计

### 3.1 推模式并发消费

#### 3.1.1 消息消费类设计

由于 RocketMQ 有两种消费方式：并发消费和顺序消费，这两种消费方式的流程又比较类似——都是构建消费请求，提交到消费线程池进行处理。

所以定义了一个消费消息服务接口 `ConsumeMessageService`，然后并发消费和顺序消费分别实现该接口。

![](https://raw.githubusercontent.com/HScarb/knowledge/master/assets/rocketmq-consume-message/rocketmq-consumer-consume-message-class.drawio.png)

消费消息服务接口定义了

* `consumeMessageDirectly`：直接消费消息的方法，主要用于管理命令触发的消息消费。
* `submitConsumeRequest`：提交消费请求到消费线程池，这个方法用于推模式的消费。

---

两个消费服务实现中都包含了

* `consumeRequestQueue`：消费请求队列，生产-消费模式用的阻塞队列。
* `consumeExecutor`：消费线程池，默认 20 个线程。并发模式下，表示最多同时消费 20 批消息；顺序模式下，可以同时处理 20 个队列。
* `messageListener`：消息消费监听器，用于注册和执行消息消费的真正逻辑。

顺序消费服务中还包含了消费队列锁。

两个消费服务都实现了

* `processConsumeResult`：消费结果处理方法，处理消费结果。消费成功则更新消费进度；消费失败则将消息发回 Broker 重试消费。
* `sendMessageBack`：将消息发回给 Broker 的方法。

#### 3.1.2 推模式并发消费流程

![](https://raw.githubusercontent.com/HScarb/knowledge/master/assets/rocketmq-consume-message/rocketmq-consumer-message-consume-process.drawio.png)

推模式消费逻辑从消息拉取开始

1. 消息拉取到后存入处理队列，然后调用并发消费服务 `ConsumeMessageConcurrentlyService` 的 `submitConsumeRequest` 方法将拉取到消息的处理队列提交消费服务处理。

   * 将消息分批打包成消费请求 `ConsumeRequest`，默认每批 1 条消息
   * 将消费请求提交给消费线程池

2. 消费线程池从阻塞队列 `consumeRequestQueue` 中不断获取消费请求，执行消费请求的 `run` 方法执行消费逻辑

   * 先检查处理队列是否被丢弃，被丢弃则放弃消费
   * 检查消息是否含有重试 Topic 属性，如果有则将真正 Topic 从属性中获取，然后复原
   * 执行消费前钩子函数
   * 调用 `messageListener` 执行真正消费业务逻辑
   * 根据消费状态判定返回结果
   * 执行消费后钩子函数
   * 最后判断一次队列是否被丢弃，如果没有则进行结果处理

3. 执行结果处理函数 `processConsumeResult`

   * 检查消费成功与否
   * 处理消费失败的消息，如果是广播模式，只打印日志。如果是集群模式，5s 后将消费失败的消息发回 Broker。
   * 更新统计数据
   * 从处理队列中移除这批已经处理过的消息，返回移除这批消息的最小的偏移量
   * 用该偏移量更新消费进度（后面讲解）

4. 如果消费成功，则消费逻辑已经结束。如果消费失败，还需要重试消费，重试消费需要消费者将消费失败的消息发回给 Broker，调用 `sendMessageBack` 方法

5. 调用消费者 `DefaultMQPushConsumerImpl` 的 `sendMessageBack` 方法，先找到 Broker 地址，然后调用 API 发送请求给 Broker。

6. Broker 由 `SendMessageprossor` 的 `aynscConsumerSendMsgBack` 处理重试消息请求

   1. 执行消息消费后钩子函数

   2. 获取订阅关系

   3. 获取或创建重试 Topic，重试 Topic 名称为 `%RETRY%{消费组名称}`

   4. 根据消息发回请求中带的物理偏移量，从消息存储 `CommitLog` 中查询出发回的消息。可以看出消费者发回消息并没有将整个消息都发回去，也没有这个必要，因为 Broker 端存储着所有的消息。只需要发回偏移量，Broker 就可以通过偏移量查询到这条消息的完整信息。

   5. 如果是重试消息且第一次重试，将真正的 Topic 存入属性。因为延迟重试消息依赖延迟消息能力，该消息之后会发送到延迟消息的 Topic 中，所以需要一个地方保存真正的 Topic 信息。

   6. 处理消息重新消费次数，

      * 如果大于重新消费次数阈值，则放进死信队列（先获取或创建死信队列）。死信队列名称为 `%DLQ%{消费组名称}`。
      * 如果在重新消费次数阈值之内，则为其设置延迟等级，延迟指定时间后投递。

   7. 创建一个新的消息对象，有新的消息 ID，将它作为重新消费的消息存入消息存储 `CommitLog`。

      > 为什么已经保存过的消息还要重新建一个并且保存，这样不是很占用存储吗？
      >
      > 由于 RocketMQ 同步消息的基准是 `CommitLog`，所以即便是已经保存在 `CommitLog` 的消息，如果要再次消费，也依然需要创建一个新的消息保存到 `CommitLog` 中。这样 `CommitLog` 会被同步到从 Broker 节点，从 Broker 节点也会收到该重试消息。

   8. 新创建的重试消息是定时消息，它的 Topic 是定时消息 Topic，定时消息的机制会不停扫描定时消息 Topic 中的队列，看该消息是否到期，如果到期则投递。[定时消息更详细的原理可以看这篇文章](https://github.com/HScarb/knowledge/blob/master/rocketmq/20220313-rocketmq-scheduled-message.md)。该消息投递之后消费者会收到并重试消费

### 3.2 消费进度管理

#### 3.2.1 消费进度管理类设计

![](https://raw.githubusercontent.com/HScarb/knowledge/master/assets/rocketmq-consume-message/rocketmq-consumer-consume-offset-manage-class.drawio.png)

消费者端，实现了 `OffsetStore` 接口，定义了更新、查询和持久化消费进度的方法。

有两个实现类，这里都使用了内存缓存，定时持久化的设计方法。保存一个缓存表 `offsetTable`，用来快速更新和查询。

* `LocalFileOffsetStore` ：消费者本地进度存储，持久化时保存到消费者本地
* `RemoteBrokerOffset`：Broker 端存储，持久化时先保存到本地缓存，然后发送请求给 Broker，保存到 Broker 缓存。Broker 再定时持久化

Broker 端也有一个对应的消费进度管理器 `ConsumerOffsetManager`，同样也是缓存 + 定时持久化的设计。

它扩展了 `ConfigManager`，`ConfigManager` 是用来管理配置的，它定义了持久化和加载的接口。

`ConsumerOffsetManager` 负责接收消费者的消费进度更新请求，然后定时持久化到磁盘。

#### 3.2.2 消费进度更新流程

这里讲解集群模式下消费进度的更新流程

每个消费者都会有一个消费进度管理器 `RemoteBrokerOffsetStore`，在消费者启动时创建。

Broker 端也有一个消费进度管理器 `ConsumerOffsetManager`，在 Broker 启动时创建。

这两个消费进度管理器都保存一个消费进度缓存表 `offsetStore` 在内存中，用于快速更新和查询。Broker 端消费进度管理器会定时将消费进度表持久化到磁盘。

![](https://raw.githubusercontent.com/HScarb/knowledge/master/assets/rocketmq-consume-message/rocketmq-consumer-consume-offset-manage-process.drawio.png)

1. 客户端实例 `MQClientInstance` 启动时，创建定时任务，每 5s 触发消费进度管理器的持久化方法。
2. 消费流程最后，如果消费请求被消费成功，将会调用 `RemoteBrokerOffsetStore` 的 `updateOffset` 方法，更新消费进度缓存
3. `persistAll()` 方法会遍历消费进度缓存表 `offsetStore`，为每个消息队列都向 Broker 发送消费进度更新和持久化的请求。
4. `updateConsumeOffsetToBroker` 构造一个消息队列的消费进度更新请求，发送给 Broker
5. Broker 的 `ConsumerManagerProcess` 处理请求，调用 `updateConsumerOffset` 方法，让消费进度管理器更新消费进度
6. 消费进度管理器的 `commitOffset` 方法将消费进度更新到其内存缓存表 `offsetStore`
7. `BrokerController` 启动时启动定时任务，每 10s 调用 `ConsumerOffsetManager` 的 `persist()` 方法，持久化消费进度

## 4. 源码解析

### 4.1 推模式并发消费

#### 4.1.1 并发消费服务提交消费请求

```java
// ConsumeMessageConcurrentlyService.java
/**
 * 构造消费请求（多批）并提交，拉取到消息之后调用
 *
 * @param msgs 每次拉取到的消息
 * @param processQueue 消息处理队列
 * @param messageQueue 消息队列
 * @param dispatchToConsume
 */
@Override
public void submitConsumeRequest(
    final List<MessageExt> msgs,
    final ProcessQueue processQueue,
    final MessageQueue messageQueue,
    final boolean dispatchToConsume) {
    // 每批次消费消息数量，默认为 1
    final int consumeBatchSize = this.defaultMQPushConsumer.getConsumeMessageBatchMaxSize();
    if (msgs.size() <= consumeBatchSize) {
        // 拉取的一批消息总数小于每批次可以消费的消息数，直接将所有拉取的消息构造成一个消费请求并提交
        ConsumeRequest consumeRequest = new ConsumeRequest(msgs, processQueue, messageQueue);
        try {
            this.consumeExecutor.submit(consumeRequest);
        } catch (RejectedExecutionException e) {
            // 拒绝提交，延迟 5s 再提交
            this.submitConsumeRequestLater(consumeRequest);
        }
    } else {
        // 如果这批消息数量大于每批次可以消费的消息，那么进行分页。每页包装可消费消息数量（1条）消息，构造多个消费请求提交消费
        for (int total = 0; total < msgs.size(); ) {
            List<MessageExt> msgThis = new ArrayList<MessageExt>(consumeBatchSize);
            for (int i = 0; i < consumeBatchSize; i++, total++) {
                if (total < msgs.size()) {
                    msgThis.add(msgs.get(total));
                } else {
                    break;
                }
            }

            ConsumeRequest consumeRequest = new ConsumeRequest(msgThis, processQueue, messageQueue);
            try {
                // 提交给消费线程池消费
                this.consumeExecutor.submit(consumeRequest);
            } catch (RejectedExecutionException e) {
                // 拒绝提交，延迟 5s 后再提交
                for (; total < msgs.size(); total++) {
                    msgThis.add(msgs.get(total));
                }

                this.submitConsumeRequestLater(consumeRequest);
            }
        }
    }
}
```

#### 4.1.2 消费请求运行、处理结果

```java
// ConsumeMessageConcurrentlyService.java
/**
 * 消费请求运行，执行消费逻辑
 */
@Override
public void run() {
    // 检查 processQueue 是否丢弃，重平衡时可能将队列分配给组内其他消费者会设置。如果丢弃，停止消费
    if (this.processQueue.isDropped()) {
        log.info("the message queue not be able to consume, because it's dropped. group={} {}", ConsumeMessageConcurrentlyService.this.consumerGroup, this.messageQueue);
        return;
    }

    MessageListenerConcurrently listener = ConsumeMessageConcurrentlyService.this.messageListener;
    ConsumeConcurrentlyContext context = new ConsumeConcurrentlyContext(messageQueue);
    ConsumeConcurrentlyStatus status = null;
    // 恢复重试消息的主题名
    defaultMQPushConsumerImpl.resetRetryAndNamespace(msgs, defaultMQPushConsumer.getConsumerGroup());

    // 执行消费前钩子函数
    ConsumeMessageContext consumeMessageContext = null;
    if (ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.hasHook()) {
        consumeMessageContext = new ConsumeMessageContext();
        consumeMessageContext.setNamespace(defaultMQPushConsumer.getNamespace());
        consumeMessageContext.setConsumerGroup(defaultMQPushConsumer.getConsumerGroup());
        consumeMessageContext.setProps(new HashMap<String, String>());
        consumeMessageContext.setMq(messageQueue);
        consumeMessageContext.setMsgList(msgs);
        consumeMessageContext.setSuccess(false);
        ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.executeHookBefore(consumeMessageContext);
    }

    // 执行具体消费逻辑
    long beginTimestamp = System.currentTimeMillis();
    boolean hasException = false;
    ConsumeReturnType returnType = ConsumeReturnType.SUCCESS;
    try {
        // 设置消费开始时间戳
        if (msgs != null && !msgs.isEmpty()) {
            for (MessageExt msg : msgs) {
                MessageAccessor.setConsumeStartTimeStamp(msg, String.valueOf(System.currentTimeMillis()));
            }
        }
        // 消费逻辑，消息调用监听器的方法进行消费
        status = listener.consumeMessage(Collections.unmodifiableList(msgs), context);
    } catch (Throwable e) {
        log.warn(String.format("consumeMessage exception: %s Group: %s Msgs: %s MQ: %s",
                               RemotingHelper.exceptionSimpleDesc(e),
                               ConsumeMessageConcurrentlyService.this.consumerGroup,
                               msgs,
                               messageQueue), e);
        hasException = true;
    }
    long consumeRT = System.currentTimeMillis() - beginTimestamp;
    // 判断消费结果
    if (null == status) {
        if (hasException) {
            returnType = ConsumeReturnType.EXCEPTION;
        } else {
            returnType = ConsumeReturnType.RETURNNULL;
        }
    } else if (consumeRT >= defaultMQPushConsumer.getConsumeTimeout() * 60 * 1000) {
        returnType = ConsumeReturnType.TIME_OUT;
    } else if (ConsumeConcurrentlyStatus.RECONSUME_LATER == status) {
        // 消费失败，需要重试
        returnType = ConsumeReturnType.FAILED;
    } else if (ConsumeConcurrentlyStatus.CONSUME_SUCCESS == status) {
        // 消费成功
        returnType = ConsumeReturnType.SUCCESS;
    }

    if (ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.hasHook()) {
        consumeMessageContext.getProps().put(MixAll.CONSUME_CONTEXT_TYPE, returnType.name());
    }

    if (null == status) {
        log.warn("consumeMessage return null, Group: {} Msgs: {} MQ: {}",
                 ConsumeMessageConcurrentlyService.this.consumerGroup,
                 msgs,
                 messageQueue);
        status = ConsumeConcurrentlyStatus.RECONSUME_LATER;
    }

    // 执行消费后钩子函数
    if (ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.hasHook()) {
        consumeMessageContext.setStatus(status.toString());
        consumeMessageContext.setSuccess(ConsumeConcurrentlyStatus.CONSUME_SUCCESS == status);
        ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.executeHookAfter(consumeMessageContext);
    }

    ConsumeMessageConcurrentlyService.this.getConsumerStatsManager()
        .incConsumeRT(ConsumeMessageConcurrentlyService.this.consumerGroup, messageQueue.getTopic(), consumeRT);

    // 消费后，验证队列是否丢弃，如果丢弃则不处理结果，此时其他消费者会重新消费该消息
    if (!processQueue.isDropped()) {
        // 处理消费结果，成功则更新统计数据；失败则重试，将消息发回 Broker，延迟一段时间后再次进行消费
        ConsumeMessageConcurrentlyService.this.processConsumeResult(status, context, this);
    } else {
        log.warn("processQueue is dropped without process consume result. messageQueue={}, msgs={}", messageQueue, msgs);
    }
}
```

```java
// ConsumeMessageConcurrentlyService.java
/**
 * 处理消费结果
 *
 * @param status 消费状态，成功或失败
 * @param context 消费上下文信息
 * @param consumeRequest 消费请求
 */
public void processConsumeResult(
    final ConsumeConcurrentlyStatus status,
    final ConsumeConcurrentlyContext context,
    final ConsumeRequest consumeRequest
) {
    // 用来标记消费成功失败的位置，默认为 Integer.MAX_VALUE，表示拉取的一批消息都消费成功
    // 消费时可以通过设置 context 的 ackIndex 来标记哪些消息成功了，哪些失败了
    // ackIndex 位置之前的消息都是消费成功的，index 大于 ackIndex 的后面的数据都是处理失败的
    int ackIndex = context.getAckIndex();

    // 如果没有消息则不处理
    if (consumeRequest.getMsgs().isEmpty())
        return;

    // 消费状态判断和处理
    switch (status) {
        case CONSUME_SUCCESS:
            // 消费成功，设置 ackIndex 为 size - 1（消费成功的消息数量的 index，为下面失败处理逻辑使用）
            if (ackIndex >= consumeRequest.getMsgs().size()) {
                ackIndex = consumeRequest.getMsgs().size() - 1;
            }
            // 成功数量
            int ok = ackIndex + 1;
            // 失败数量
            int failed = consumeRequest.getMsgs().size() - ok;
            // 更新统计数据
            this.getConsumerStatsManager().incConsumeOKTPS(consumerGroup, consumeRequest.getMessageQueue().getTopic(), ok);
            this.getConsumerStatsManager().incConsumeFailedTPS(consumerGroup, consumeRequest.getMessageQueue().getTopic(), failed);
            break;
        case RECONSUME_LATER:
            // 消费失败，ackIndex 设为 -1，为下面的失败处理逻辑使用
            ackIndex = -1;
            // 消费失败统计数据更新
            this.getConsumerStatsManager().incConsumeFailedTPS(consumerGroup, consumeRequest.getMessageQueue().getTopic(),
                                                               consumeRequest.getMsgs().size());
            break;
        default:
            break;
    }

    // 处理消费失败的消息
    switch (this.defaultMQPushConsumer.getMessageModel()) {
        case BROADCASTING:
            // 广播模式，对消费失败的消息不会重复消费，只会打印警告日志，输出消息内容
            // ackIndex 后面的 index 都是消费失败的
            for (int i = ackIndex + 1; i < consumeRequest.getMsgs().size(); i++) {
                MessageExt msg = consumeRequest.getMsgs().get(i);
                log.warn("BROADCASTING, the message consume failed, drop it, {}", msg.toString());
            }
            break;
        case CLUSTERING:
            List<MessageExt> msgBackFailed = new ArrayList<MessageExt>(consumeRequest.getMsgs().size());
            // 集群模式，处理消费失败的消息。将消费失败的消息发回 Broker
            // ackIndex 后面的消息（index 大于 ackIndex）都是消费失败的
            for (int i = ackIndex + 1; i < consumeRequest.getMsgs().size(); i++) {
                MessageExt msg = consumeRequest.getMsgs().get(i);
                // 将消息发回 Broker
                boolean result = this.sendMessageBack(msg, context);
                if (!result) {
                    // 如果发回失败，加入失败列表
                    msg.setReconsumeTimes(msg.getReconsumeTimes() + 1);
                    msgBackFailed.add(msg);
                }
            }

            // 5 秒后重新消费发回失败的消息
            if (!msgBackFailed.isEmpty()) {
                consumeRequest.getMsgs().removeAll(msgBackFailed);

                this.submitConsumeRequestLater(msgBackFailed, consumeRequest.getProcessQueue(), consumeRequest.getMessageQueue());
            }
            break;
        default:
            break;
    }

    // 从 ProcessQueue 中移除这批已经处理过的消息
    long offset = consumeRequest.getProcessQueue().removeMessage(consumeRequest.getMsgs());
    if (offset >= 0 && !consumeRequest.getProcessQueue().isDropped()) {
        // 更新消费进度
        this.defaultMQPushConsumerImpl.getOffsetStore().updateOffset(consumeRequest.getMessageQueue(), offset, true);
    }
}
```

### 4.2 重试消费

#### 4.2.1 消费者消费失败，将消息发回 Broker

```java
// ConsumeMessageConcurrentlyService.java
/**
 * 把消费失败的消息发回 Broker
 *
 * @param msg
 * @param context
 * @return
 */
public boolean sendMessageBack(final MessageExt msg, final ConsumeConcurrentlyContext context) {
    // 获取延迟等级，默认为 0，表示由 Broker 端控制延迟等级
    // Broker 端将延迟等级设置为重试消费次数 + 3
    int delayLevel = context.getDelayLevelWhenNextConsume();

    // Wrap topic with namespace before sending back message.
    msg.setTopic(this.defaultMQPushConsumer.withNamespace(msg.getTopic()));
    try {
        this.defaultMQPushConsumerImpl.sendMessageBack(msg, delayLevel, context.getMessageQueue().getBrokerName());
        return true;
    } catch (Exception e) {
        log.error("sendMessageBack exception, group: " + this.consumerGroup + " msg: " + msg.toString(), e);
    }

    return false;
}
```

```java
// DefaultMQPushConsumerImpl.java
/**
 * 把消费失败的消息发回 Broker
 *
 * @param msg
 * @param delayLevel
 * @param brokerName
 * @throws RemotingException
 * @throws MQBrokerException
 * @throws InterruptedException
 * @throws MQClientException
 */
public void sendMessageBack(MessageExt msg, int delayLevel, final String brokerName)
    throws RemotingException, MQBrokerException, InterruptedException, MQClientException {
    try {
        // 查找 Broker 地址，如果知道 Broker 名称，根据名称查询主节点地址；否则使用消息存储的地 host 为 Broker 地址
        String brokerAddr = (null != brokerName) ? this.mQClientFactory.findBrokerAddressInPublish(brokerName)
            : RemotingHelper.parseSocketAddressAddr(msg.getStoreHost());
        this.mQClientFactory.getMQClientAPIImpl().consumerSendMessageBack(brokerAddr, msg,
                                                                          this.defaultMQPushConsumer.getConsumerGroup(), delayLevel, 5000, getMaxReconsumeTimes());
    } catch (Exception e) {
        // 发回 Broker 失败，将消息发送回重试 Topic 中，设置延迟等级，等待重新消费
        log.error("sendMessageBack Exception, " + this.defaultMQPushConsumer.getConsumerGroup(), e);

        Message newMsg = new Message(MixAll.getRetryTopic(this.defaultMQPushConsumer.getConsumerGroup()), msg.getBody());

        String originMsgId = MessageAccessor.getOriginMessageId(msg);
        MessageAccessor.setOriginMessageId(newMsg, UtilAll.isBlank(originMsgId) ? msg.getMsgId() : originMsgId);

        newMsg.setFlag(msg.getFlag());
        MessageAccessor.setProperties(newMsg, msg.getProperties());
        MessageAccessor.putProperty(newMsg, MessageConst.PROPERTY_RETRY_TOPIC, msg.getTopic());
        // 重新消费次数 +1
        MessageAccessor.setReconsumeTime(newMsg, String.valueOf(msg.getReconsumeTimes() + 1));
        MessageAccessor.setMaxReconsumeTimes(newMsg, String.valueOf(getMaxReconsumeTimes()));
        MessageAccessor.clearProperty(newMsg, MessageConst.PROPERTY_TRANSACTION_PREPARED);
        newMsg.setDelayTimeLevel(3 + msg.getReconsumeTimes());

        this.mQClientFactory.getDefaultMQProducer().send(newMsg);
    } finally {
        msg.setTopic(NamespaceUtil.withoutNamespace(msg.getTopic(), this.defaultMQPushConsumer.getNamespace()));
    }
}
```

#### 4.2.2 Broker 端处理客户端发回的消息

```java
// SendMessageProcessor.java
/**
 * Broker 处理消费者消费失败发回的消息
 *
 * @param ctx
 * @param request
 * @return
 * @throws RemotingCommandException
 */
private CompletableFuture<RemotingCommand> asyncConsumerSendMsgBack(ChannelHandlerContext ctx,
                                                                    RemotingCommand request) throws RemotingCommandException {
    final RemotingCommand response = RemotingCommand.createResponseCommand(null);
    final ConsumerSendMsgBackRequestHeader requestHeader =
        (ConsumerSendMsgBackRequestHeader)request.decodeCommandCustomHeader(ConsumerSendMsgBackRequestHeader.class);
    String namespace = NamespaceUtil.getNamespaceFromResource(requestHeader.getGroup());
    // 消息轨迹：记录消费失败的消息
    if (this.hasConsumeMessageHook() && !UtilAll.isBlank(requestHeader.getOriginMsgId())) {
        ConsumeMessageContext context = buildConsumeMessageContext(namespace, requestHeader, request);
        this.executeConsumeMessageHookAfter(context);
    }
    // 获取消费组的订阅配置
    SubscriptionGroupConfig subscriptionGroupConfig =
        this.brokerController.getSubscriptionGroupManager().findSubscriptionGroupConfig(requestHeader.getGroup());
    if (null == subscriptionGroupConfig) {
        // 订阅配置不存在，返回错误
        response.setCode(ResponseCode.SUBSCRIPTION_GROUP_NOT_EXIST);
        response.setRemark("subscription group not exist, " + requestHeader.getGroup() + " "
                           + FAQUrl.suggestTodo(FAQUrl.SUBSCRIPTION_GROUP_NOT_EXIST));
        return CompletableFuture.completedFuture(response);
    }
    if (!PermName.isWriteable(this.brokerController.getBrokerConfig().getBrokerPermission())) {
        // Broker 不可写
        response.setCode(ResponseCode.NO_PERMISSION);
        response.setRemark("the broker[" + this.brokerController.getBrokerConfig().getBrokerIP1() + "] sending message is forbidden");
        return CompletableFuture.completedFuture(response);
    }

    // 如果重试队列数量为 0，说明该消费组不支持重试，返回成功并丢弃消息
    if (subscriptionGroupConfig.getRetryQueueNums() <= 0) {
        response.setCode(ResponseCode.SUCCESS);
        response.setRemark(null);
        return CompletableFuture.completedFuture(response);
    }

    String newTopic = MixAll.getRetryTopic(requestHeader.getGroup());
    int queueIdInt = ThreadLocalRandom.current().nextInt(99999999) % subscriptionGroupConfig.getRetryQueueNums();
    // 如果是单元化模式，对 Topic 进行设置
    int topicSysFlag = 0;
    if (requestHeader.isUnitMode()) {
        topicSysFlag = TopicSysFlag.buildSysFlag(false, true);
    }

    // 创建重试主题 %RETRY%{消费组名称}，构建主题配置
    TopicConfig topicConfig = this.brokerController.getTopicConfigManager().createTopicInSendMessageBackMethod(
        newTopic,
        subscriptionGroupConfig.getRetryQueueNums(),
        PermName.PERM_WRITE | PermName.PERM_READ, topicSysFlag);
    // 检查 Topic 是否存在
    if (null == topicConfig) {
        response.setCode(ResponseCode.SYSTEM_ERROR);
        response.setRemark("topic[" + newTopic + "] not exist");
        return CompletableFuture.completedFuture(response);
    }

    // 检查 Topic 权限
    if (!PermName.isWriteable(topicConfig.getPerm())) {
        response.setCode(ResponseCode.NO_PERMISSION);
        response.setRemark(String.format("the topic[%s] sending message is forbidden", newTopic));
        return CompletableFuture.completedFuture(response);
    }
    // 根据偏移量从 CommitLog 查询发回的消息
    MessageExt msgExt = this.brokerController.getMessageStore().lookMessageByOffset(requestHeader.getOffset());
    if (null == msgExt) {
        response.setCode(ResponseCode.SYSTEM_ERROR);
        response.setRemark("look message by offset failed, " + requestHeader.getOffset());
        return CompletableFuture.completedFuture(response);
    }

    // 如果消息之前没有重新消费过，将消息的真正 Topic 存入属性，因为 Topic 之后会被重试 Topic 覆盖
    final String retryTopic = msgExt.getProperty(MessageConst.PROPERTY_RETRY_TOPIC);
    if (null == retryTopic) {
        MessageAccessor.putProperty(msgExt, MessageConst.PROPERTY_RETRY_TOPIC, msgExt.getTopic());
    }
    msgExt.setWaitStoreMsgOK(false);

    // 客户端自动决定延迟等级
    int delayLevel = requestHeader.getDelayLevel();

    int maxReconsumeTimes = subscriptionGroupConfig.getRetryMaxTimes();
    if (request.getVersion() >= MQVersion.Version.V3_4_9.ordinal()) {
        Integer times = requestHeader.getMaxReconsumeTimes();
        if (times != null) {
            maxReconsumeTimes = times;
        }
    }

    // 死信消息处理，如果 > 0，表示由客户端控制重试次数
    // 如果重试次数超过 maxReconsumeTimes，或者小于 0，会放入死信队列。改变 Topic 为 %DLQ%{消费者组}
    if (msgExt.getReconsumeTimes() >= maxReconsumeTimes
        || delayLevel < 0) {
        newTopic = MixAll.getDLQTopic(requestHeader.getGroup());
        queueIdInt = ThreadLocalRandom.current().nextInt(99999999) % DLQ_NUMS_PER_GROUP;

        topicConfig = this.brokerController.getTopicConfigManager().createTopicInSendMessageBackMethod(newTopic,
                                                                                                       DLQ_NUMS_PER_GROUP,
                                                                                                       PermName.PERM_WRITE | PermName.PERM_READ, 0);

        if (null == topicConfig) {
            response.setCode(ResponseCode.SYSTEM_ERROR);
            response.setRemark("topic[" + newTopic + "] not exist");
            return CompletableFuture.completedFuture(response);
        }
        msgExt.setDelayTimeLevel(0);
    } else {
        // 如果是 0，表示由 Broker 端控制延迟时间，将延迟等级设置为：重新消费次数 + 3
        if (0 == delayLevel) {
            delayLevel = 3 + msgExt.getReconsumeTimes();
        }
        msgExt.setDelayTimeLevel(delayLevel);
    }

    // 创建一个新的消息对象，作为重试消息，它有新的消息 ID
    MessageExtBrokerInner msgInner = new MessageExtBrokerInner();
    msgInner.setTopic(newTopic);
    msgInner.setBody(msgExt.getBody());
    msgInner.setFlag(msgExt.getFlag());
    MessageAccessor.setProperties(msgInner, msgExt.getProperties());
    msgInner.setPropertiesString(MessageDecoder.messageProperties2String(msgExt.getProperties()));
    msgInner.setTagsCode(MessageExtBrokerInner.tagsString2tagsCode(null, msgExt.getTags()));

    msgInner.setQueueId(queueIdInt);
    msgInner.setSysFlag(msgExt.getSysFlag());
    msgInner.setBornTimestamp(msgExt.getBornTimestamp());
    msgInner.setBornHost(msgExt.getBornHost());
    msgInner.setStoreHost(msgExt.getStoreHost());
    // 重新消费次数 +1，下次重新消费的延迟等级根据该值来确定
    msgInner.setReconsumeTimes(msgExt.getReconsumeTimes() + 1);

    // 保存源消息的 ID
    String originMsgId = MessageAccessor.getOriginMessageId(msgExt);
    MessageAccessor.setOriginMessageId(msgInner, UtilAll.isBlank(originMsgId) ? msgExt.getMsgId() : originMsgId);
    msgInner.setPropertiesString(MessageDecoder.messageProperties2String(msgExt.getProperties()));

    // 存入 CommitLog
    CompletableFuture<PutMessageResult> putMessageResult = this.brokerController.getMessageStore().asyncPutMessage(msgInner);
    // 存入之后统计数据并返回结果
    return putMessageResult.thenApply((r) -> {
        if (r != null) {
            switch (r.getPutMessageStatus()) {
                case PUT_OK:
                    String backTopic = msgExt.getTopic();
                    String correctTopic = msgExt.getProperty(MessageConst.PROPERTY_RETRY_TOPIC);
                    if (correctTopic != null) {
                        backTopic = correctTopic;
                    }
                    if (TopicValidator.RMQ_SYS_SCHEDULE_TOPIC.equals(msgInner.getTopic())) {
                        this.brokerController.getBrokerStatsManager().incTopicPutNums(msgInner.getTopic());
                        this.brokerController.getBrokerStatsManager().incTopicPutSize(msgInner.getTopic(), r.getAppendMessageResult().getWroteBytes());
                        this.brokerController.getBrokerStatsManager().incQueuePutNums(msgInner.getTopic(), msgInner.getQueueId());
                        this.brokerController.getBrokerStatsManager().incQueuePutSize(msgInner.getTopic(), msgInner.getQueueId(), r.getAppendMessageResult().getWroteBytes());
                    }
                    this.brokerController.getBrokerStatsManager().incSendBackNums(requestHeader.getGroup(), backTopic);
                    response.setCode(ResponseCode.SUCCESS);
                    response.setRemark(null);
                    return response;
                default:
                    break;
            }
            response.setCode(ResponseCode.SYSTEM_ERROR);
            response.setRemark(r.getPutMessageStatus().name());
            return response;
        }
        response.setCode(ResponseCode.SYSTEM_ERROR);
        response.setRemark("putMessageResult is null");
        return response;
    });
}
```

### 4.3 消费进度管理

#### 4.3.1 客户端消费进度管理器持久化消费进度

```java
// RemoteBrokerOffsetStore.java
/**
 * 持久化消费进度
 * 发送请求给 Broker，让 Broker 持久化消费进度到磁盘
 *
 * @param mqs
 */
@Override
public void persistAll(Set<MessageQueue> mqs) {
    if (null == mqs || mqs.isEmpty())
        return;

    final HashSet<MessageQueue> unusedMQ = new HashSet<MessageQueue>();

    // 遍历所有缓存的消息队列，为每隔队列发送持久化消费进度请求给 Broker
    for (Map.Entry<MessageQueue, AtomicLong> entry : this.offsetTable.entrySet()) {
        MessageQueue mq = entry.getKey();
        AtomicLong offset = entry.getValue();
        if (offset != null) {
            if (mqs.contains(mq)) {
                try {
                    this.updateConsumeOffsetToBroker(mq, offset.get());
                    log.info("[persistAll] Group: {} ClientId: {} updateConsumeOffsetToBroker {} {}",
                             this.groupName,
                             this.mQClientFactory.getClientId(),
                             mq,
                             offset.get());
                } catch (Exception e) {
                    log.error("updateConsumeOffsetToBroker exception, " + mq.toString(), e);
                }
            } else {
                unusedMQ.add(mq);
            }
        }
    }

    if (!unusedMQ.isEmpty()) {
        for (MessageQueue mq : unusedMQ) {
            this.offsetTable.remove(mq);
            log.info("remove unused mq, {}, {}", mq, this.groupName);
        }
    }
}
```

```java
// RemoteBrokerOffsetStore.java
/**
 * Update the Consumer Offset synchronously, once the Master is off, updated to Slave, here need to be optimized.
 * 发送 UPDATE_CONSUMER_OFFSET 请求到 Broker，让 Broker 持久化消费进度
 */
@Override
public void updateConsumeOffsetToBroker(MessageQueue mq, long offset, boolean isOneway) throws RemotingException,
MQBrokerException, InterruptedException, MQClientException {
    // 获取 Broker 地址
    FindBrokerResult findBrokerResult = this.mQClientFactory.findBrokerAddressInSubscribe(mq.getBrokerName(), MixAll.MASTER_ID, true);
    if (null == findBrokerResult) {
        this.mQClientFactory.updateTopicRouteInfoFromNameServer(mq.getTopic());
        findBrokerResult = this.mQClientFactory.findBrokerAddressInSubscribe(mq.getBrokerName(), MixAll.MASTER_ID, false);
    }

    if (findBrokerResult != null) {
        UpdateConsumerOffsetRequestHeader requestHeader = new UpdateConsumerOffsetRequestHeader();
        requestHeader.setTopic(mq.getTopic());
        requestHeader.setConsumerGroup(this.groupName);
        requestHeader.setQueueId(mq.getQueueId());
        requestHeader.setCommitOffset(offset);

        // 向 Broker 发送请求，持久化消费进度
        if (isOneway) {
            this.mQClientFactory.getMQClientAPIImpl().updateConsumerOffsetOneway(
                findBrokerResult.getBrokerAddr(), requestHeader, 1000 * 5);
        } else {
            this.mQClientFactory.getMQClientAPIImpl().updateConsumerOffset(
                findBrokerResult.getBrokerAddr(), requestHeader, 1000 * 5);
        }
    } else {
        throw new MQClientException("The broker[" + mq.getBrokerName() + "] not exist", null);
    }
}
```

#### 4.3.2 Broker 端消费进度管理器

收到客户端发来的持久化消费进度请求，将消费进度缓存

```java
/**
 * 持久化消费进度
 *
 * @param clientHost
 * @param group
 * @param topic
 * @param queueId
 * @param offset
 */
public void commitOffset(final String clientHost, final String group, final String topic, final int queueId,
                         final long offset) {
    // topic@group
    String key = topic + TOPIC_GROUP_SEPARATOR + group;
    this.commitOffset(clientHost, key, queueId, offset);
}

/**
 * 持久化消费进度，将消费进度保存到缓存表
 * 
 * @param clientHost
 * @param key
 * @param queueId
 * @param offset
 */
private void commitOffset(final String clientHost, final String key, final int queueId, final long offset) {
    ConcurrentMap<Integer, Long> map = this.offsetTable.get(key);
    if (null == map) {
        map = new ConcurrentHashMap<Integer, Long>(32);
        map.put(queueId, offset);
        this.offsetTable.put(key, map);
    } else {
        Long storeOffset = map.put(queueId, offset);
        if (storeOffset != null && offset < storeOffset) {
            log.warn("[NOTIFYME]update consumer offset less than store. clientHost={}, key={}, queueId={}, requestOffset={}, storeOffset={}", clientHost, key, queueId, offset, storeOffset);
        }
    }
}
```

定时持久化消费进度

```java
// BrokerController#initialize()

// 每 10s 持久化消费进度到磁盘
this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {
    @Override
    public void run() {
        try {
            BrokerController.this.consumerOffsetManager.persist();
        } catch (Throwable e) {
            log.error("schedule persist consumerOffset error.", e);
        }
    }
}, 1000 * 10, this.brokerConfig.getFlushConsumerOffsetInterval(), TimeUnit.MILLISECONDS);
```



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
