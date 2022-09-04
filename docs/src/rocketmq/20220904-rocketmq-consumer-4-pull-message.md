---
title: RocketMQ 消费者（4）消息拉取 流程详解 & 源码解析
author: Scarb
date: 2022-09-04
---

# RocketMQ 消费者（4）消息拉取 流程详解 & 源码解析

## 1. 背景

本文是 RocketMQ 消费者系列的第四篇，介绍消息拉取的流程。

RocketMQ 的消费主要分推和拉两个模式，拉模式主动拉取消息，整个逻辑比较简单。本文着重介绍推模式下，消费者客户端如何实现通过拉取来模拟推的效果，让消息看似主动从 Broker 推送到客户端。

我把 RocketMQ 消费分成如下几个步骤

1. 重平衡
2. 消费者拉取消息
3. Broker 接收拉取请求后从存储中查询消息并返回
4. 消费者消费消息

本文会涉及 2 和 3 这两个步骤。

## 2. 概要设计

### 2.1 交互流程

异步拉取消息的流程主要分为 3 步

1. 消费者组装拉取请求（包含队列信息、要拉取的逻辑偏移量、最大拉取的消息数量），发送给 Broker 端
2. Broker 处理拉取请求，从存储中查询要被拉取的消息返回相应给消费者
3. 消费者的处理线程池处理拉取完成的回调，将消息从拉取到的响应中解码出来，放入消费队列，让消费服务消费。

### 2.2 客户端拉取流程设计

#### 2.2.1 拉模式消费者拉取

拉模式消费者由于需要主动进行拉取，所以拉取流程并不复杂。

拉取模式消费者提供了同步和异步的拉取方法，用户主动发起拉取，并对拉取到的消息进行消费处理。

#### 2.2.2 推模式消费者拉取

推模式消费也是通过拉取消息请求来拉取消息，通过客户端的封装让用户使用时感觉像是 Broker 主动将消息推给消费者。

客户端实例包含一个消息拉取线程，客户端实例中的所有推模式消费者共用这个拉取线程。

消息拉取线程用了生产-消费模式，内部有一个阻塞队列，存放消费者的拉取请求；运行的时候不断尝试从队列中取出拉取请求执行消息拉取动作。

拉取请求从哪放入阻塞队列？上一篇重平衡篇有提到，重平衡将为消费者负载的队列创建拉取请求并放入队列，后续不会新建而是重复使用这个拉取请求，取出执行一次，拉取完成之后更新拉取偏移量，再将它重新放入队列。

拉取到的消息存放在哪？每个消息队列会对应创建一个处理队列，拉取成功后将拉取到的消息存入处理队列，然后提交给消息消费服务处理。

### 2.3 Broker 端拉取流程设计

Broker 端收到拉取请求后要做的就是将消息从磁盘中查询出来，封装后返回给客户端。

根据队列找到对应的消费队列，读取消费队列判断是否有消息可以消费，如果有则根据消费队列中的索引项，用物理偏移量从消息存储中查找消息。

## 3. 详细设计

### 3.1 相关类设计

以下为推模式下消息消费者端拉取相关类设计，拉模式不涉及自动拉取消息。

在消费者端需要处理拉取请求的发送和 Broker 端拉取结果的响应。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312699695.png)

RocketMQ 用单独的一个拉取消息线程 `PullMessageService` 来处理消息拉取，这个线程仅仅是异步发送自动拉取请求，并不负责请求处理，所以整个客户端实例只需要一个共用线程就足够了。拉取消息服务最终会调用 `DefaultMQPushConsumerImpl` 中的拉取方法实现 `pullMessage` 来真正发送拉取请求。

消费者收到 Broker 端响应后会调用 `PullCallback` 接口，该逻辑由 `NettyRemotingClient` 的 `publicExecutor` 线程池执行，默认有 4 个线程。

为了能够先后分别处理多个队列的拉取，拉取线程中应用了生产-消费模式，用阻塞队列 `pullRequestQueue` 存放其他地方（重平衡、上次拉取完成）用 `executePullRequestImmediately()` 提交的拉取请求 `PullRequest`。内部不断尝试从阻塞队列中获取拉去请求进行拉取操作。

由于每个队列每次拉取所需要的元信息几乎没什么变化，只需要改变下次拉取的偏移量即可，所以并没有选择每次都创建新的 `PullRequest` ，而是不断重用在重平衡中创建的同一个 `PullRequest` 进行拉取。

拉取到的消息会暂存在处理队列 `ProcessQueue` 中，其内用 `TreeMap` 保存这些消息，key 是消息在队列中的逻辑偏移量，value 是拉取到的消息。这样可以保证消息的顺序。

消息消费服务从处理队列中获取消息并消费。

### 3.2 整体流程

下图表示推模式消费者的消息拉取流程。整个流程分 3 个步骤

1. 左边 Client 部分为客户端发送拉取请求
2. 右边 Broker 部分为 Broker 端处理拉取请求从存储中查询消息返回
3. 橙色 `PullCallback` 部分为 客户端处理返回的消息

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312699734.png)

#### 3.2.1 消费者拉取消息

##### 3.2.1.1 `PullMessageService`

消费者使用消息拉取线程 `PullMessageService` 拉取消息，该线程中用生产-消费模式，`run` 方法不断从阻塞队列中读取拉取请求来执行拉取。每个拉取请求对应拉取一个消息队列的消息。

拉取请求放入阻塞队列的时机主要有三个

1. 重平衡会创建拉取请求
2. 消息拉取逻辑处理完成会更新拉取请求下次拉取的偏移量，然后重新放入队列
3. 消费速度太慢，消息拉取被流控，会等待一段时间后将拉取请求放入队列

---

##### 3.2.1.2 `DefaultMQPushConsumerImpl`

从阻塞队列中获取拉取请求之后，会调用 `DefaultMQPushConsumerImpl#pullMessage()` 方法

1. 从拉取请求中获取处理队列 `ProcessQueue`，检查队列是否被丢弃和消费者是否挂起
2. 消息拉取流控检查，检查处理队列中还未被消费的消息，从待消费消息数量、大小和待消费消息偏移量差来判断。如果需要流控则延迟 50ms 后将拉取请求重新放入队列
3. 获取队列的订阅信息，准备构造拉取请求
4. 创建拉取消息成功的回调
5. 判断是否需要提交偏移量，查询偏移量
6. 构造消息拉取系统标记
7. 调用 `PullAPIWrapper#pullKernelImpl` 与服务端交互拉取消息

---

##### 3.2.1.3 `PullApiWrapper`

1. 根据消息队列从本地缓存查询对应的 Broker 地址，如果查不到则请求 Name server 查询
2. 构造查询请求
3. 调用客户端 API 实现发送请求

##### 3.2.1.4 `MQClientAPIImpl`

根据请求发送的交互模式（单向/同步/异步）发送请求。

推模式消费者的拉取为异步调用

#### 3.2.2 Broker 端处理拉取请求

##### 3.2.2.1 `PullMessageProcessor`

`processRequest` 方法处理客户端的消息拉取请求

1. 前置检查
2. 消息过滤相关逻辑
3. 从消息存储查询消息
4. 计算下次拉取建议的 Broker 地址，设置到返回体
5. 根据从存储查询消息的结果
   1. 如果找到消息，将消息放入返回体
   2. 如果没有找到，执行长轮询逻辑，[长轮询相关介绍见本文](https://github.com/HScarb/knowledge/blob/master/rocketmq/20220301-rocketmq-longpolling-pullrequestholdservice.md)
   3. 如果没有这个队列，发送异常消息
6. 执行消息轨迹的消费钩子
7. 存储消费者消费进度：如果 `CommitLog` 可用且当前节点为主节点，则更新消费进度

##### 3.2.2.2 `DefaultMessageStore`

从消息存储中查询需要拉取的一批消息

1. 找到对应的消费队列索引
2. 获取消费队列最大和最小的逻辑偏移量
3. 将要拉取的偏移量与上述偏移量比较，判断拉取结果。只有拉取偏移量大于等于最小偏移量、小于最大偏移量时才能正常拉取，否则返回错误
4. 遍历消费队列索引，最多遍历 maxNum 个（消息拉取最大数量）
5. 根据消费队列索引从 `CommitLog` 中查询消息
6. 返回查询结果

#### 3.2.3 消费者拉取成功结果处理

在 `NettyRemotingClient` 的处理线程池中处理异步请求完成的回调，默认有 4 个线程。

1. 将拉取到的消息解码，过滤
2. 根据拉取的状态进行判断，如果拉取成功才执行下述操作
3. 为拉取请求设置下次拉取的偏移量
4. 更新统计数据
5. 将拉取到的消息放入处理队列
6. 将处理队列让消息消费服务处理
7. 将拉取请求放入拉取线程继续下次拉取

## 4. 源码解析

### 4.1 消费者拉取消息

#### 4.1.1 `PullMessageService` 消息拉取线程

RocketMQ 封装的服务线程，不断执行 `run()` 方法

```java
// 拉取请求队列，阻塞队列
private final LinkedBlockingQueue<PullRequest> pullRequestQueue = new LinkedBlockingQueue<PullRequest>();

/**
 * 立即执行拉取消息请求（立即将拉取请求放入队列）
 * 每个 MessageQueue 复用一个拉取请求 PullRequest
 * 在如下位置被调用
 * - 重平衡完
 * - 一次拉取任务执行完
 *
 * @param pullRequest
 */
public void executePullRequestImmediately(final PullRequest pullRequest) {
    try {
        this.pullRequestQueue.put(pullRequest);
    } catch (InterruptedException e) {
        log.error("executePullRequestImmediately pullRequestQueue.put", e);
    }
}

public void run() {
    log.info(this.getServiceName() + " service started");

    // 如果是启动状态，无限循环。stopped 是 volatile 的变量
    while (!this.isStopped()) {
        try {
            // 从拉取请求队列中获取一个拉取请求
            PullRequest pullRequest = this.pullRequestQueue.take();
            // 执行拉取消息请求，拉取消息
            this.pullMessage(pullRequest);
        } catch (InterruptedException ignored) {
        } catch (Exception e) {
            log.error("Pull Message Service Run Method exception", e);
        }
    }

    log.info(this.getServiceName() + " service end");
}
```

#### 4.1.2 `PullRequest` 消息拉取请求

消息拉取请求主要包含拉取消息所需要的元数据

```java
/**
 * 拉取请求，为推模式消费者服务，在 {@link PullMessageService} 中保存和指定
 */
public class PullRequest {
    // 消费者组
    private String consumerGroup;
    // 待拉取的消费队列
    private MessageQueue messageQueue;
    // 消息处理队列，从 Broker 中拉取到的消息会先存入 ProcessQueue，再提交到消费者消费线程池进行消费
    private ProcessQueue processQueue;
    // 待拉取的 MessageQueue 偏移量
    private long nextOffset;
    
    // ...
}
```

#### 4.1.3 `DefaultMQPushConsumerImpl`

推消费者实现

```java
/**
 * 拉取消息入口
 * 
 * @param pullRequest 拉取请求，包含需要拉取的消费队列信息
 */
public void pullMessage(final PullRequest pullRequest) {
    // 获取待拉取的消费队列
    final ProcessQueue processQueue = pullRequest.getProcessQueue();
    // 如果该队列被丢弃，返回
    if (processQueue.isDropped()) {
        log.info("the pull request[{}] is dropped.", pullRequest.toString());
        return;
    }

    // 设置该队列的最新拉取时间为当前时间
    pullRequest.getProcessQueue().setLastPullTimestamp(System.currentTimeMillis());

    try {
        this.makeSureStateOK();
    } catch (MQClientException e) {
        log.warn("pullMessage exception, consumer state not ok", e);
        this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
        return;
    }

    // 如果当前消费者被挂起，延迟1s后再拉取
    if (this.isPause()) {
        log.warn("consumer was paused, execute pull request later. instanceName={}, group={}", this.defaultMQPushConsumer.getInstanceName(), this.defaultMQPushConsumer.getConsumerGroup());
        this.executePullRequestLater(pullRequest, PULL_TIME_DELAY_MILLS_WHEN_SUSPEND);
        return;
    }

    // ====== 流控 begin ======
    long cachedMessageCount = processQueue.getMsgCount().get();
    long cachedMessageSizeInMiB = processQueue.getMsgSize().get() / (1024 * 1024);

    // 消息消费数量流控，当前处理消息数量大于1000，触发流控
    if (cachedMessageCount > this.defaultMQPushConsumer.getPullThresholdForQueue()) {
        // 放弃本次拉取，延迟50ms之后重新拉取
        this.executePullRequestLater(pullRequest, PULL_TIME_DELAY_MILLS_WHEN_FLOW_CONTROL);
        if ((queueFlowControlTimes++ % 1000) == 0) {
            log.warn(
                "the cached message count exceeds the threshold {}, so do flow control, minOffset={}, maxOffset={}, count={}, size={} MiB, pullRequest={}, flowControlTimes={}",
                this.defaultMQPushConsumer.getPullThresholdForQueue(), processQueue.getMsgTreeMap().firstKey(), processQueue.getMsgTreeMap().lastKey(), cachedMessageCount, cachedMessageSizeInMiB, pullRequest, queueFlowControlTimes);
        }
        return;
    }

    // 消息消费大小流控，当前消费消息超过100MB，触发流控
    if (cachedMessageSizeInMiB > this.defaultMQPushConsumer.getPullThresholdSizeForQueue()) {
        // 放弃本次拉取，延迟50ms之后重新拉取
        this.executePullRequestLater(pullRequest, PULL_TIME_DELAY_MILLS_WHEN_FLOW_CONTROL);
        if ((queueFlowControlTimes++ % 1000) == 0) {
            log.warn(
                "the cached message size exceeds the threshold {} MiB, so do flow control, minOffset={}, maxOffset={}, count={}, size={} MiB, pullRequest={}, flowControlTimes={}",
                this.defaultMQPushConsumer.getPullThresholdSizeForQueue(), processQueue.getMsgTreeMap().firstKey(), processQueue.getMsgTreeMap().lastKey(), cachedMessageCount, cachedMessageSizeInMiB, pullRequest, queueFlowControlTimes);
        }
        return;
    }

    if (!this.consumeOrderly) {
        // 消息消费偏移量间隔流控，大于2000，触发流控
        if (processQueue.getMaxSpan() > this.defaultMQPushConsumer.getConsumeConcurrentlyMaxSpan()) {
            this.executePullRequestLater(pullRequest, PULL_TIME_DELAY_MILLS_WHEN_FLOW_CONTROL);
            if ((queueMaxSpanFlowControlTimes++ % 1000) == 0) {
                log.warn(
                    "the queue's messages, span too long, so do flow control, minOffset={}, maxOffset={}, maxSpan={}, pullRequest={}, flowControlTimes={}",
                    processQueue.getMsgTreeMap().firstKey(), processQueue.getMsgTreeMap().lastKey(), processQueue.getMaxSpan(),
                    pullRequest, queueMaxSpanFlowControlTimes);
            }
            return;
        }
    } else {
        // 处理顺序消费
        if (processQueue.isLocked()) {
            if (!pullRequest.isPreviouslyLocked()) {
                long offset = -1L;
                try {
                    offset = this.rebalanceImpl.computePullFromWhereWithException(pullRequest.getMessageQueue());
                } catch (Exception e) {
                    this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
                    log.error("Failed to compute pull offset, pullResult: {}", pullRequest, e);
                    return;
                }
                boolean brokerBusy = offset < pullRequest.getNextOffset();
                log.info("the first time to pull message, so fix offset from broker. pullRequest: {} NewOffset: {} brokerBusy: {}",
                         pullRequest, offset, brokerBusy);
                if (brokerBusy) {
                    log.info("[NOTIFYME]the first time to pull message, but pull request offset larger than broker consume offset. pullRequest: {} NewOffset: {}",
                             pullRequest, offset);
                }

                pullRequest.setPreviouslyLocked(true);
                pullRequest.setNextOffset(offset);
            }
        } else {
            this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
            log.info("pull message later because not locked in broker, {}", pullRequest);
            return;
        }
    }
    // ====== 流控 end ======

    // 拉取该主题订阅信息
    final SubscriptionData subscriptionData = this.rebalanceImpl.getSubscriptionInner().get(pullRequest.getMessageQueue().getTopic());
    // 如果为空，延迟3s后拉取
    // 由于并发关系，即使找不到订阅关系，也要重试下，防止丢失PullRequest
    if (null == subscriptionData) {
        this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
        log.warn("find the consumer's subscription failed, {}", pullRequest);
        return;
    }

    final long beginTimestamp = System.currentTimeMillis();

    // 从Broker拉取完成的回调函数
    PullCallback pullCallback = new PullCallback() {
        // ...
    };

    // 偏移量提交计算
    boolean commitOffsetEnable = false;
    long commitOffsetValue = 0L;
    if (MessageModel.CLUSTERING == this.defaultMQPushConsumer.getMessageModel()) {
        commitOffsetValue = this.offsetStore.readOffset(pullRequest.getMessageQueue(), ReadOffsetType.READ_FROM_MEMORY);
        if (commitOffsetValue > 0) {
            commitOffsetEnable = true;
        }
    }

    // ====== 消息过滤相关 ======
    String subExpression = null;
    boolean classFilter = false;
    // 获取订阅数据，包含过滤信息
    SubscriptionData sd = this.rebalanceImpl.getSubscriptionInner().get(pullRequest.getMessageQueue().getTopic());
    if (sd != null) {
        // 如果不是类过滤模式，设置过滤表达式
        if (this.defaultMQPushConsumer.isPostSubscriptionWhenPull() && !sd.isClassFilterMode()) {
            subExpression = sd.getSubString();
        }

        classFilter = sd.isClassFilterMode();
    }

    // 根据过滤类型构建拉取时的系统标记
    int sysFlag = PullSysFlag.buildSysFlag(
        commitOffsetEnable, // commitOffset
        true, // suspend
        subExpression != null, // subscription
        classFilter // class filter
    );

    // 从服务端拉取
    try {
        this.pullAPIWrapper.pullKernelImpl(
            pullRequest.getMessageQueue(),  // 从那个消费队列拉取消息
            subExpression,  // 消息过滤表达式
            subscriptionData.getExpressionType(),   // 消息表达式类型：TAG/SQL92
            subscriptionData.getSubVersion(),   // 
            pullRequest.getNextOffset(),    // 消息拉取偏移量
            this.defaultMQPushConsumer.getPullBatchSize(),  // 消息拉取最大条数，32
            sysFlag,    // 拉取系统标记
            commitOffsetValue,  // 内存中当前消费队列的消费进度
            BROKER_SUSPEND_MAX_TIME_MILLIS, // 15000
            CONSUMER_TIMEOUT_MILLIS_WHEN_SUSPEND,   // 30000
            CommunicationMode.ASYNC,    // 消息拉取模式，异步
            pullCallback    // 拉取消息成功后的回调方法
        );
    } catch (Exception e) {
        log.error("pullKernelImpl exception", e);
        this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
    }
}
```

#### 4.1.4 `PullAPIWrapper`

```java
/**
 * 向 Broker 发送请求，拉取消息
 *
 * @param mq 消息队列
 * @param subExpression 过滤表达式
 * @param expressionType 过滤类型
 * @param subVersion 订阅关系版本号
 * @param offset 拉取偏移量
 * @param maxNums 拉取最大数量
 * @param sysFlag 标志位
 * @param commitOffset 提交偏移量
 * @param brokerSuspendMaxTimeMillis Broker 挂起最大时间
 * @param timeoutMillis 客户端拉取超时
 * @param communicationMode 交互模式：单向/异步/同步
 * @param pullCallback 拉取成功回调函数
 * @return 拉取结果
 * @throws MQClientException
 * @throws RemotingException
 * @throws MQBrokerException
 * @throws InterruptedException
 */
public PullResult pullKernelImpl(
    final MessageQueue mq,
    final String subExpression,
    final String expressionType,
    final long subVersion,
    final long offset,
    final int maxNums,
    final int sysFlag,
    final long commitOffset,
    final long brokerSuspendMaxTimeMillis,
    final long timeoutMillis,
    final CommunicationMode communicationMode,
    final PullCallback pullCallback
) throws MQClientException, RemotingException, MQBrokerException, InterruptedException {
    // 根据brokerName、brokerId从MQClientInstance中获取Broker地址。先从内存查找，找不到则从 NameServer 更新。
    FindBrokerResult findBrokerResult =
        this.mQClientFactory.findBrokerAddressInSubscribe(mq.getBrokerName(),
                                                          this.recalculatePullFromWhichNode(mq), false);
    if (null == findBrokerResult) {
        this.mQClientFactory.updateTopicRouteInfoFromNameServer(mq.getTopic());
        findBrokerResult =
            this.mQClientFactory.findBrokerAddressInSubscribe(mq.getBrokerName(),
                                                              this.recalculatePullFromWhichNode(mq), false);
    }

    if (findBrokerResult != null) {
        {
            // check version
            if (!ExpressionType.isTagType(expressionType)
                && findBrokerResult.getBrokerVersion() < MQVersion.Version.V4_1_0_SNAPSHOT.ordinal()) {
                throw new MQClientException("The broker[" + mq.getBrokerName() + ", "
                                            + findBrokerResult.getBrokerVersion() + "] does not upgrade to support for filter message by " + expressionType, null);
            }
        }
        int sysFlagInner = sysFlag;
        // 如果是子节点，把CommitOffset位去掉
        // 因为子节点不保存消费者的Offset值，只有主节点才保存，所以如果是从子节点拉消息，就不能把这个位设为有效
        if (findBrokerResult.isSlave()) {
            sysFlagInner = PullSysFlag.clearCommitOffsetFlag(sysFlagInner);
        }

        PullMessageRequestHeader requestHeader = new PullMessageRequestHeader();
        requestHeader.setConsumerGroup(this.consumerGroup);
        requestHeader.setTopic(mq.getTopic());
        requestHeader.setQueueId(mq.getQueueId());
        requestHeader.setQueueOffset(offset);
        requestHeader.setMaxMsgNums(maxNums);
        requestHeader.setSysFlag(sysFlagInner);
        // 消费的当前队列的已经消费的最大的Offset值
        requestHeader.setCommitOffset(commitOffset);
        requestHeader.setSuspendTimeoutMillis(brokerSuspendMaxTimeMillis);
        requestHeader.setSubscription(subExpression);
        requestHeader.setSubVersion(subVersion);
        requestHeader.setExpressionType(expressionType);

        String brokerAddr = findBrokerResult.getBrokerAddr();
        // 如果过滤模式为类过滤，根据主题名称、Broker地址找到注册在Broker上的FilterServer地址，从FilterServer上拉取消息
        if (PullSysFlag.hasClassFilterFlag(sysFlagInner)) {
            brokerAddr = computePullFromWhichFilterServer(mq.getTopic(), brokerAddr);
        }

        // 从Broker拉取消息
        PullResult pullResult = this.mQClientFactory.getMQClientAPIImpl().pullMessage(
            brokerAddr,
            requestHeader,
            timeoutMillis,
            communicationMode,
            pullCallback);

        return pullResult;
    }

    throw new MQClientException("The broker[" + mq.getBrokerName() + "] not exist", null);
}
```

#### 4.1.5 MQClientInstance

```java
public PullResult pullMessage(
    final String addr,
    final PullMessageRequestHeader requestHeader,
    final long timeoutMillis,
    final CommunicationMode communicationMode,
    final PullCallback pullCallback
) throws RemotingException, MQBrokerException, InterruptedException {
    RemotingCommand request = RemotingCommand.createRequestCommand(RequestCode.PULL_MESSAGE, requestHeader);

    switch (communicationMode) {
        case ONEWAY:
            assert false;
            return null;
        case ASYNC:
            this.pullMessageAsync(addr, request, timeoutMillis, pullCallback);
            return null;
        case SYNC:
            return this.pullMessageSync(addr, request, timeoutMillis);
        default:
            assert false;
            break;
    }

    return null;
}
```

#### 4.1.6 `PullMessageProcessor`

```java
/**
 * 处理客户端拉取请求入口
 *
 * @param channel 网络通道，通过该通道向消息拉取客户端发送响应结果
 * @param request 消息拉取请求
 * @param brokerAllowSuspend Broker端是否允许挂起，默认true。true：如果未找到消息则挂起。false：未找到消息直接返回消息未找到
 * @return 响应
 * @throws RemotingCommandException 当解析请求发生异常时
 */
private RemotingCommand processRequest(final Channel channel, RemotingCommand request, boolean brokerAllowSuspend)
    throws RemotingCommandException {
    final long beginTimeMills = this.brokerController.getMessageStore().now();
    RemotingCommand response = RemotingCommand.createResponseCommand(PullMessageResponseHeader.class);
    final PullMessageResponseHeader responseHeader = (PullMessageResponseHeader) response.readCustomHeader();
    final PullMessageRequestHeader requestHeader =
        (PullMessageRequestHeader) request.decodeCommandCustomHeader(PullMessageRequestHeader.class);

    // 设置ID，用于响应和请求的匹配
    response.setOpaque(request.getOpaque());

    log.debug("receive PullMessage request command, {}", request);

    // 判断Broker权限，broker是否可读
    if (!PermName.isReadable(this.brokerController.getBrokerConfig().getBrokerPermission())) {
        response.setCode(ResponseCode.NO_PERMISSION);
        response.setRemark(String.format("the broker[%s] pulling message is forbidden", this.brokerController.getBrokerConfig().getBrokerIP1()));
        return response;
    }

    // 校验ConsumerGroup配置是否存在
    SubscriptionGroupConfig subscriptionGroupConfig =
        this.brokerController.getSubscriptionGroupManager().findSubscriptionGroupConfig(requestHeader.getConsumerGroup());
    if (null == subscriptionGroupConfig) {
        response.setCode(ResponseCode.SUBSCRIPTION_GROUP_NOT_EXIST);
        response.setRemark(String.format("subscription group [%s] does not exist, %s", requestHeader.getConsumerGroup(), FAQUrl.suggestTodo(FAQUrl.SUBSCRIPTION_GROUP_NOT_EXIST)));
        return response;
    }

    // 校验ConsumerGroup配置是否可消费
    if (!subscriptionGroupConfig.isConsumeEnable()) {
        response.setCode(ResponseCode.NO_PERMISSION);
        response.setRemark("subscription group no permission, " + requestHeader.getConsumerGroup());
        return response;
    }

    // 是否挂起
    final boolean hasSuspendFlag = PullSysFlag.hasSuspendFlag(requestHeader.getSysFlag());
    // 客户端是否提交了消费进度
    final boolean hasCommitOffsetFlag = PullSysFlag.hasCommitOffsetFlag(requestHeader.getSysFlag());
    final boolean hasSubscriptionFlag = PullSysFlag.hasSubscriptionFlag(requestHeader.getSysFlag());

    // 计算挂起时间
    final long suspendTimeoutMillisLong = hasSuspendFlag ? requestHeader.getSuspendTimeoutMillis() : 0;

    // 查找Topic配置信息
    TopicConfig topicConfig = this.brokerController.getTopicConfigManager().selectTopicConfig(requestHeader.getTopic());
    if (null == topicConfig) {
        log.error("the topic {} not exist, consumer: {}", requestHeader.getTopic(), RemotingHelper.parseChannelRemoteAddr(channel));
        response.setCode(ResponseCode.TOPIC_NOT_EXIST);
        response.setRemark(String.format("topic[%s] not exist, apply first please! %s", requestHeader.getTopic(), FAQUrl.suggestTodo(FAQUrl.APPLY_TOPIC_URL)));
        return response;
    }

    // 判断Topic是否可读
    if (!PermName.isReadable(topicConfig.getPerm())) {
        response.setCode(ResponseCode.NO_PERMISSION);
        response.setRemark("the topic[" + requestHeader.getTopic() + "] pulling message is forbidden");
        return response;
    }

    // 请求的队列ID是否合法
    // >= 0 && < 已知的最大队列数量
    if (requestHeader.getQueueId() < 0 || requestHeader.getQueueId() >= topicConfig.getReadQueueNums()) {
        String errorInfo = String.format("queueId[%d] is illegal, topic:[%s] topicConfig.readQueueNums:[%d] consumer:[%s]",
                                         requestHeader.getQueueId(), requestHeader.getTopic(), topicConfig.getReadQueueNums(), channel.remoteAddress());
        log.warn(errorInfo);
        response.setCode(ResponseCode.SYSTEM_ERROR);
        response.setRemark(errorInfo);
        return response;
    }

    // ====== 消息过滤 ======
    // 判断客户端是否传过来了SubscriptionData，即过滤数据
    SubscriptionData subscriptionData = null;
    ConsumerFilterData consumerFilterData = null;
    if (hasSubscriptionFlag) {
        try {
            // true，则根据客户端传过来的数据构造subscriptionData
            subscriptionData = FilterAPI.build(
                requestHeader.getTopic(), requestHeader.getSubscription(), requestHeader.getExpressionType()
            );
            if (!ExpressionType.isTagType(subscriptionData.getExpressionType())) {
                // 如果不是 TAG 类型的过滤，则是 SQL92 过滤，构建过滤数据 ConsumerFilterData
                consumerFilterData = ConsumerFilterManager.build(
                    requestHeader.getTopic(), requestHeader.getConsumerGroup(), requestHeader.getSubscription(),
                    requestHeader.getExpressionType(), requestHeader.getSubVersion()
                );
                assert consumerFilterData != null;
            }
        } catch (Exception e) {
            log.warn("Parse the consumer's subscription[{}] failed, group: {}", requestHeader.getSubscription(),
                     requestHeader.getConsumerGroup());
            response.setCode(ResponseCode.SUBSCRIPTION_PARSE_FAILED);
            response.setRemark("parse the consumer's subscription failed");
            return response;
        }
    } else {
        // false，则通过服务端数据构造subscriptionData
        ConsumerGroupInfo consumerGroupInfo =
            this.brokerController.getConsumerManager().getConsumerGroupInfo(requestHeader.getConsumerGroup());
        if (null == consumerGroupInfo) {
            log.warn("the consumer's group info not exist, group: {}", requestHeader.getConsumerGroup());
            response.setCode(ResponseCode.SUBSCRIPTION_NOT_EXIST);
            response.setRemark("the consumer's group info not exist" + FAQUrl.suggestTodo(FAQUrl.SAME_GROUP_DIFFERENT_TOPIC));
            return response;
        }

        if (!subscriptionGroupConfig.isConsumeBroadcastEnable()
            && consumerGroupInfo.getMessageModel() == MessageModel.BROADCASTING) {
            response.setCode(ResponseCode.NO_PERMISSION);
            response.setRemark("the consumer group[" + requestHeader.getConsumerGroup() + "] can not consume by broadcast way");
            return response;
        }

        subscriptionData = consumerGroupInfo.findSubscriptionData(requestHeader.getTopic());
        if (null == subscriptionData) {
            log.warn("the consumer's subscription not exist, group: {}, topic:{}", requestHeader.getConsumerGroup(), requestHeader.getTopic());
            response.setCode(ResponseCode.SUBSCRIPTION_NOT_EXIST);
            response.setRemark("the consumer's subscription not exist" + FAQUrl.suggestTodo(FAQUrl.SAME_GROUP_DIFFERENT_TOPIC));
            return response;
        }

        // 判断Broker的订阅关系版本是否最新
        if (subscriptionData.getSubVersion() < requestHeader.getSubVersion()) {
            log.warn("The broker's subscription is not latest, group: {} {}", requestHeader.getConsumerGroup(),
                     subscriptionData.getSubString());
            response.setCode(ResponseCode.SUBSCRIPTION_NOT_LATEST);
            response.setRemark("the consumer's subscription not latest");
            return response;
        }
        if (!ExpressionType.isTagType(subscriptionData.getExpressionType())) {
            consumerFilterData = this.brokerController.getConsumerFilterManager().get(requestHeader.getTopic(),
                                                                                      requestHeader.getConsumerGroup());
            if (consumerFilterData == null) {
                response.setCode(ResponseCode.FILTER_DATA_NOT_EXIST);
                response.setRemark("The broker's consumer filter data is not exist!Your expression may be wrong!");
                return response;
            }
            if (consumerFilterData.getClientVersion() < requestHeader.getSubVersion()) {
                log.warn("The broker's consumer filter data is not latest, group: {}, topic: {}, serverV: {}, clientV: {}",
                         requestHeader.getConsumerGroup(), requestHeader.getTopic(), consumerFilterData.getClientVersion(), requestHeader.getSubVersion());
                response.setCode(ResponseCode.FILTER_DATA_NOT_LATEST);
                response.setRemark("the consumer's consumer filter data not latest");
                return response;
            }
        }
    }

    if (!ExpressionType.isTagType(subscriptionData.getExpressionType())
        && !this.brokerController.getBrokerConfig().isEnablePropertyFilter()) {
        response.setCode(ResponseCode.SYSTEM_ERROR);
        response.setRemark("The broker does not support consumer to filter message by " + subscriptionData.getExpressionType());
        return response;
    }

    // 构建消息过滤器
    MessageFilter messageFilter;
    if (this.brokerController.getBrokerConfig().isFilterSupportRetry()) {
        // 支持对重试主题的属性进行过滤
        messageFilter = new ExpressionForRetryMessageFilter(subscriptionData, consumerFilterData,
                                                            this.brokerController.getConsumerFilterManager());
    } else {
        // 不支持对重试主题的属性进行过滤
        messageFilter = new ExpressionMessageFilter(subscriptionData, consumerFilterData,
                                                    this.brokerController.getConsumerFilterManager());
    }

    // 根据消费组、Topic、QueueID、队列Offset、拉取消息数量、订阅信息查找消息
    final GetMessageResult getMessageResult =
        this.brokerController.getMessageStore().getMessage(requestHeader.getConsumerGroup(), requestHeader.getTopic(),
                                                           requestHeader.getQueueId(), requestHeader.getQueueOffset(), requestHeader.getMaxMsgNums(), messageFilter);
    if (getMessageResult != null) {
        // 填充responseHeader
        response.setRemark(getMessageResult.getStatus().name());
        responseHeader.setNextBeginOffset(getMessageResult.getNextBeginOffset());
        responseHeader.setMinOffset(getMessageResult.getMinOffset());
        responseHeader.setMaxOffset(getMessageResult.getMaxOffset());

        // 如果允许从SLAVE拉数据，根据主从同步延迟计算下一次从主或从节点拉取
        if (getMessageResult.isSuggestPullingFromSlave()) {
            // 消费较慢，重定向到另外一台机器
            responseHeader.setSuggestWhichBrokerId(subscriptionGroupConfig.getWhichBrokerWhenConsumeSlowly());
        } else {
            // 消费正常，按照订阅组配置重定向
            responseHeader.setSuggestWhichBrokerId(MixAll.MASTER_ID);
        }

        switch (this.brokerController.getMessageStoreConfig().getBrokerRole()) {
            case ASYNC_MASTER:
            case SYNC_MASTER:
                break;
            case SLAVE:
                if (!this.brokerController.getBrokerConfig().isSlaveReadEnable()) {
                    response.setCode(ResponseCode.PULL_RETRY_IMMEDIATELY);
                    responseHeader.setSuggestWhichBrokerId(MixAll.MASTER_ID);
                }
                break;
        }

        if (this.brokerController.getBrokerConfig().isSlaveReadEnable()) {
            // consume too slow ,redirect to another machine
            if (getMessageResult.isSuggestPullingFromSlave()) {
                responseHeader.setSuggestWhichBrokerId(subscriptionGroupConfig.getWhichBrokerWhenConsumeSlowly());
            }
            // consume ok
            else {
                responseHeader.setSuggestWhichBrokerId(subscriptionGroupConfig.getBrokerId());
            }
        } else {
            responseHeader.setSuggestWhichBrokerId(MixAll.MASTER_ID);
        }

        // 根据GetMessageResult状态码推算Response状态码
        switch (getMessageResult.getStatus()) {
            case FOUND:
                response.setCode(ResponseCode.SUCCESS);
                break;
            case MESSAGE_WAS_REMOVING:
                response.setCode(ResponseCode.PULL_RETRY_IMMEDIATELY);
                break;
                // 这两个返回值都表示服务器暂时没有这个队列，应该立刻将客户端Offset重置为0
            case NO_MATCHED_LOGIC_QUEUE:
            case NO_MESSAGE_IN_QUEUE:
                if (0 != requestHeader.getQueueOffset()) {
                    response.setCode(ResponseCode.PULL_OFFSET_MOVED);

                    // XXX: warn and notify me
                    log.info("the broker store no queue data, fix the request offset {} to {}, Topic: {} QueueId: {} Consumer Group: {}",
                             requestHeader.getQueueOffset(),
                             getMessageResult.getNextBeginOffset(),
                             requestHeader.getTopic(),
                             requestHeader.getQueueId(),
                             requestHeader.getConsumerGroup()
                            );
                } else {
                    response.setCode(ResponseCode.PULL_NOT_FOUND);
                }
                break;
            case NO_MATCHED_MESSAGE:
                response.setCode(ResponseCode.PULL_RETRY_IMMEDIATELY);
                break;
            case OFFSET_FOUND_NULL:
                response.setCode(ResponseCode.PULL_NOT_FOUND);
                break;
            case OFFSET_OVERFLOW_BADLY:
                response.setCode(ResponseCode.PULL_OFFSET_MOVED);
                // XXX: warn and notify me
                log.info("the request offset: {} over flow badly, broker max offset: {}, consumer: {}",
                         requestHeader.getQueueOffset(), getMessageResult.getMaxOffset(), channel.remoteAddress());
                break;
            case OFFSET_OVERFLOW_ONE:
                response.setCode(ResponseCode.PULL_NOT_FOUND);
                break;
            case OFFSET_TOO_SMALL:
                response.setCode(ResponseCode.PULL_OFFSET_MOVED);
                log.info("the request offset too small. group={}, topic={}, requestOffset={}, brokerMinOffset={}, clientIp={}",
                         requestHeader.getConsumerGroup(), requestHeader.getTopic(), requestHeader.getQueueOffset(),
                         getMessageResult.getMinOffset(), channel.remoteAddress());
                break;
            default:
                assert false;
                break;
        }

        // 消息轨迹：记录客户端拉取的消息记录（不表示消费成功）
        if (this.hasConsumeMessageHook()) {
            // 执行hook
            ConsumeMessageContext context = new ConsumeMessageContext();
            context.setConsumerGroup(requestHeader.getConsumerGroup());
            context.setTopic(requestHeader.getTopic());
            context.setQueueId(requestHeader.getQueueId());

            String owner = request.getExtFields().get(BrokerStatsManager.COMMERCIAL_OWNER);

            switch (response.getCode()) {
                case ResponseCode.SUCCESS:
                    int commercialBaseCount = brokerController.getBrokerConfig().getCommercialBaseCount();
                    int incValue = getMessageResult.getMsgCount4Commercial() * commercialBaseCount;

                    context.setCommercialRcvStats(BrokerStatsManager.StatsType.RCV_SUCCESS);
                    context.setCommercialRcvTimes(incValue);
                    context.setCommercialRcvSize(getMessageResult.getBufferTotalSize());
                    context.setCommercialOwner(owner);

                    break;
                case ResponseCode.PULL_NOT_FOUND:
                    if (!brokerAllowSuspend) {

                        context.setCommercialRcvStats(BrokerStatsManager.StatsType.RCV_EPOLLS);
                        context.setCommercialRcvTimes(1);
                        context.setCommercialOwner(owner);

                    }
                    break;
                case ResponseCode.PULL_RETRY_IMMEDIATELY:
                case ResponseCode.PULL_OFFSET_MOVED:
                    context.setCommercialRcvStats(BrokerStatsManager.StatsType.RCV_EPOLLS);
                    context.setCommercialRcvTimes(1);
                    context.setCommercialOwner(owner);
                    break;
                default:
                    assert false;
                    break;
            }

            this.executeConsumeMessageHookBefore(context);
        }

        switch (response.getCode()) {
            case ResponseCode.SUCCESS:
                // 统计
                this.brokerController.getBrokerStatsManager().incGroupGetNums(requestHeader.getConsumerGroup(), requestHeader.getTopic(),
                                                                              getMessageResult.getMessageCount());

                this.brokerController.getBrokerStatsManager().incGroupGetSize(requestHeader.getConsumerGroup(), requestHeader.getTopic(),
                                                                              getMessageResult.getBufferTotalSize());

                this.brokerController.getBrokerStatsManager().incBrokerGetNums(getMessageResult.getMessageCount());
                if (this.brokerController.getBrokerConfig().isTransferMsgByHeap()) {
                    final byte[] r = this.readGetMessageResult(getMessageResult, requestHeader.getConsumerGroup(), requestHeader.getTopic(), requestHeader.getQueueId());
                    this.brokerController.getBrokerStatsManager().incGroupGetLatency(requestHeader.getConsumerGroup(),
                                                                                     requestHeader.getTopic(), requestHeader.getQueueId(),
                                                                                     (int) (this.brokerController.getMessageStore().now() - beginTimeMills));
                    response.setBody(r);
                } else {
                    try {
                        FileRegion fileRegion =
                            new ManyMessageTransfer(response.encodeHeader(getMessageResult.getBufferTotalSize()), getMessageResult);
                        channel.writeAndFlush(fileRegion).addListener(new ChannelFutureListener() {
                            @Override
                            public void operationComplete(ChannelFuture future) throws Exception {
                                getMessageResult.release();
                                if (!future.isSuccess()) {
                                    log.error("transfer many message by pagecache failed, {}", channel.remoteAddress(), future.cause());
                                }
                            }
                        });
                    } catch (Throwable e) {
                        log.error("transfer many message by pagecache exception", e);
                        getMessageResult.release();
                    }

                    response = null;
                }
                break;
            case ResponseCode.PULL_NOT_FOUND:
                // 长轮询
                // 如果当前没有消息，并且本次拉取是由客户端触发，而非挂起请求触发的话，那么挂起当前拉取请求
                if (brokerAllowSuspend && hasSuspendFlag) {
                    // 最大挂起时间，push模式固定15s，pull模式固定20s
                    long pollingTimeMills = suspendTimeoutMillisLong;
                    if (!this.brokerController.getBrokerConfig().isLongPollingEnable()) {
                        // 如果不启用长轮询，则使用短轮询，1s检查一次是否有新消息。默认启用长轮询
                        pollingTimeMills = this.brokerController.getBrokerConfig().getShortPollingTimeMills();
                    }
                    // 构造一个PullRequest并交给PullRequestHoldService线程
                    String topic = requestHeader.getTopic();
                    long offset = requestHeader.getQueueOffset();
                    int queueId = requestHeader.getQueueId();
                    PullRequest pullRequest = new PullRequest(request, channel, pollingTimeMills,
                                                              this.brokerController.getMessageStore().now(), offset, subscriptionData, messageFilter);
                    this.brokerController.getPullRequestHoldService().suspendPullRequest(topic, queueId, pullRequest);
                    response = null;    // 将相应置为空，意味着暂时不返回给客户端
                    break;
                }
                // 向Consumer返回应答
            case ResponseCode.PULL_RETRY_IMMEDIATELY:
                break;
            case ResponseCode.PULL_OFFSET_MOVED:
                if (this.brokerController.getMessageStoreConfig().getBrokerRole() != BrokerRole.SLAVE
                    || this.brokerController.getMessageStoreConfig().isOffsetCheckInSlave()) {
                    MessageQueue mq = new MessageQueue();
                    mq.setTopic(requestHeader.getTopic());
                    mq.setQueueId(requestHeader.getQueueId());
                    mq.setBrokerName(this.brokerController.getBrokerConfig().getBrokerName());

                    OffsetMovedEvent event = new OffsetMovedEvent();
                    event.setConsumerGroup(requestHeader.getConsumerGroup());
                    event.setMessageQueue(mq);
                    event.setOffsetRequest(requestHeader.getQueueOffset());
                    event.setOffsetNew(getMessageResult.getNextBeginOffset());
                    this.generateOffsetMovedEvent(event);
                    log.warn(
                        "PULL_OFFSET_MOVED:correction offset. topic={}, groupId={}, requestOffset={}, newOffset={}, suggestBrokerId={}",
                        requestHeader.getTopic(), requestHeader.getConsumerGroup(), event.getOffsetRequest(), event.getOffsetNew(),
                        responseHeader.getSuggestWhichBrokerId());
                } else {
                    responseHeader.setSuggestWhichBrokerId(subscriptionGroupConfig.getBrokerId());
                    response.setCode(ResponseCode.PULL_RETRY_IMMEDIATELY);
                    log.warn("PULL_OFFSET_MOVED:none correction. topic={}, groupId={}, requestOffset={}, suggestBrokerId={}",
                             requestHeader.getTopic(), requestHeader.getConsumerGroup(), requestHeader.getQueueOffset(),
                             responseHeader.getSuggestWhichBrokerId());
                }

                break;
            default:
                assert false;
        }
    } else {
        response.setCode(ResponseCode.SYSTEM_ERROR);
        response.setRemark("store getMessage return null");
    }

    // 存储Consumer消费进度：如果CommitLog可用且当前节点为主节点，则更新消费进度
    boolean storeOffsetEnable = brokerAllowSuspend; // 说明是首次调用，相对于长轮询通知
    storeOffsetEnable = storeOffsetEnable && hasCommitOffsetFlag;   // 说明Consumer设置了标志位
    storeOffsetEnable = storeOffsetEnable   // 只有Master支持存储offset
        && this.brokerController.getMessageStoreConfig().getBrokerRole() != BrokerRole.SLAVE;
    if (storeOffsetEnable) {
        this.brokerController.getConsumerOffsetManager().commitOffset(RemotingHelper.parseChannelRemoteAddr(channel),
                                                                      requestHeader.getConsumerGroup(), requestHeader.getTopic(), requestHeader.getQueueId(), requestHeader.getCommitOffset());
    }
    return response;
}
```

#### 4.1.7 `DefaultMessageStore`

```java
/**
 * 获取消息
 *
 * @param group Consumer group that launches this query. 消费者组
 * @param topic Topic to query. 主题
 * @param queueId Queue ID to query. 队列ID
 * @param offset Logical offset to start from. 消息在队列中的逻辑偏移量
 * @param maxMsgNums Maximum count of messages to query. 查询的最大消息数量
 * @param messageFilter Message filter used to screen desired messages. 消息过滤器
 * @return 查询消息结果
 */
public GetMessageResult getMessage(final String group, final String topic, final int queueId, final long offset,
                                   final int maxMsgNums,
                                   final MessageFilter messageFilter) {
    if (this.shutdown) {
        log.warn("message store has shutdown, so getMessage is forbidden");
        return null;
    }

    if (!this.runningFlags.isReadable()) {
        log.warn("message store is not readable, so getMessage is forbidden " + this.runningFlags.getFlagBits());
        return null;
    }

    if (MixAll.isLmq(topic) && this.isLmqConsumeQueueNumExceeded()) {
        log.warn("message store is not available, broker config enableLmq and enableMultiDispatch, lmq consumeQueue num exceed maxLmqConsumeQueueNum config num");
        return null;
    }

    long beginTime = this.getSystemClock().now();

    GetMessageStatus status = GetMessageStatus.NO_MESSAGE_IN_QUEUE;
    long nextBeginOffset = offset;
    long minOffset = 0;
    long maxOffset = 0;

    // lazy init when find msg.
    GetMessageResult getResult = null;

    final long maxOffsetPy = this.commitLog.getMaxOffset();

    ConsumeQueue consumeQueue = findConsumeQueue(topic, queueId);
    if (consumeQueue != null) {
        minOffset = consumeQueue.getMinOffsetInQueue();
        maxOffset = consumeQueue.getMaxOffsetInQueue();

        if (maxOffset == 0) {
            status = GetMessageStatus.NO_MESSAGE_IN_QUEUE;
            nextBeginOffset = nextOffsetCorrection(offset, 0);
        } else if (offset < minOffset) {
            status = GetMessageStatus.OFFSET_TOO_SMALL;
            nextBeginOffset = nextOffsetCorrection(offset, minOffset);
        } else if (offset == maxOffset) {
            status = GetMessageStatus.OFFSET_OVERFLOW_ONE;
            nextBeginOffset = nextOffsetCorrection(offset, offset);
        } else if (offset > maxOffset) {
            status = GetMessageStatus.OFFSET_OVERFLOW_BADLY;
            if (0 == minOffset) {
                nextBeginOffset = nextOffsetCorrection(offset, minOffset);
            } else {
                nextBeginOffset = nextOffsetCorrection(offset, maxOffset);
            }
        } else {
            // 根据逻辑偏移量从 ConsumeQueue 中查出索引项
            SelectMappedBufferResult bufferConsumeQueue = consumeQueue.getIndexBuffer(offset);
            if (bufferConsumeQueue != null) {
                try {
                    status = GetMessageStatus.NO_MATCHED_MESSAGE;

                    long nextPhyFileStartOffset = Long.MIN_VALUE;
                    long maxPhyOffsetPulling = 0;

                    int i = 0;
                    final int maxFilterMessageCount = Math.max(16000, maxMsgNums * ConsumeQueue.CQ_STORE_UNIT_SIZE);
                    final boolean diskFallRecorded = this.messageStoreConfig.isDiskFallRecorded();

                    getResult = new GetMessageResult(maxMsgNums);

                    ConsumeQueueExt.CqExtUnit cqExtUnit = new ConsumeQueueExt.CqExtUnit();
                    // 从消费队列中读取消息，直到读完或者读到查询消息数的最大值
                    for (; i < bufferConsumeQueue.getSize() && i < maxFilterMessageCount; i += ConsumeQueue.CQ_STORE_UNIT_SIZE) {
                        long offsetPy = bufferConsumeQueue.getByteBuffer().getLong();
                        int sizePy = bufferConsumeQueue.getByteBuffer().getInt();
                        long tagsCode = bufferConsumeQueue.getByteBuffer().getLong();

                        maxPhyOffsetPulling = offsetPy;

                        // 物理文件正在被删除
                        if (nextPhyFileStartOffset != Long.MIN_VALUE) {
                            if (offsetPy < nextPhyFileStartOffset)
                                continue;
                        }

                        // 判断是否拉磁盘数据
                        boolean isInDisk = checkInDiskByCommitOffset(offsetPy, maxOffsetPy);
                        // 此批消息到达上限
                        if (this.isTheBatchFull(sizePy, maxMsgNums, getResult.getBufferTotalSize(), getResult.getMessageCount(),
                                                isInDisk)) {
                            break;
                        }

                        boolean extRet = false, isTagsCodeLegal = true;
                        if (consumeQueue.isExtAddr(tagsCode)) {
                            extRet = consumeQueue.getExt(tagsCode, cqExtUnit);
                            if (extRet) {
                                tagsCode = cqExtUnit.getTagsCode();
                            } else {
                                // can't find ext content.Client will filter messages by tag also.
                                log.error("[BUG] can't find consume queue extend file content!addr={}, offsetPy={}, sizePy={}, topic={}, group={}",
                                          tagsCode, offsetPy, sizePy, topic, group);
                                isTagsCodeLegal = false;
                            }
                        }

                        // 消息过滤，先根据 ConsumeQueue 条目中的哈希码进行过滤，不匹配则直接跳过该条消息
                        if (messageFilter != null
                            && !messageFilter.isMatchedByConsumeQueue(isTagsCodeLegal ? tagsCode : null, extRet ? cqExtUnit : null)) {
                            if (getResult.getBufferTotalSize() == 0) {
                                status = GetMessageStatus.NO_MATCHED_MESSAGE;
                            }

                            continue;
                        }

                        // 根据消息的偏移量和消息的大小从 CommitLog 文件中取出一条消息
                        SelectMappedBufferResult selectResult = this.commitLog.getMessage(offsetPy, sizePy);
                        if (null == selectResult) {
                            if (getResult.getBufferTotalSize() == 0) {
                                status = GetMessageStatus.MESSAGE_WAS_REMOVING;
                            }

                            nextPhyFileStartOffset = this.commitLog.rollNextFile(offsetPy);
                            continue;
                        }

                        // 如果消息通过了 ConsumeQueue 的哈希码过滤，要从 CommitLog 中加载整个消息体，根据属性进行过滤
                        if (messageFilter != null
                            && !messageFilter.isMatchedByCommitLog(selectResult.getByteBuffer().slice(), null)) {
                            if (getResult.getBufferTotalSize() == 0) {
                                status = GetMessageStatus.NO_MATCHED_MESSAGE;
                            }
                            // release...
                            selectResult.release();
                            continue;
                        }

                        this.storeStatsService.getGetMessageTransferedMsgCount().add(1);
                        getResult.addMessage(selectResult);
                        status = GetMessageStatus.FOUND;
                        nextPhyFileStartOffset = Long.MIN_VALUE;
                    }

                    if (diskFallRecorded) {
                        long fallBehind = maxOffsetPy - maxPhyOffsetPulling;
                        brokerStatsManager.recordDiskFallBehindSize(group, topic, queueId, fallBehind);
                    }

                    nextBeginOffset = offset + (i / ConsumeQueue.CQ_STORE_UNIT_SIZE);

                    long diff = maxOffsetPy - maxPhyOffsetPulling;
                    long memory = (long) (StoreUtil.TOTAL_PHYSICAL_MEMORY_SIZE
                                          * (this.messageStoreConfig.getAccessMessageInMemoryMaxRatio() / 100.0));
                    getResult.setSuggestPullingFromSlave(diff > memory);
                } finally {

                    bufferConsumeQueue.release();
                }
            } else {
                status = GetMessageStatus.OFFSET_FOUND_NULL;
                nextBeginOffset = nextOffsetCorrection(offset, consumeQueue.rollNextFile(offset));
                log.warn("consumer request topic: " + topic + "offset: " + offset + " minOffset: " + minOffset + " maxOffset: "
                         + maxOffset + ", but access logic queue failed.");
            }
        }
    } else {
        status = GetMessageStatus.NO_MATCHED_LOGIC_QUEUE;
        nextBeginOffset = nextOffsetCorrection(offset, 0);
    }

    if (GetMessageStatus.FOUND == status) {
        this.storeStatsService.getGetMessageTimesTotalFound().add(1);
    } else {
        this.storeStatsService.getGetMessageTimesTotalMiss().add(1);
    }
    long elapsedTime = this.getSystemClock().now() - beginTime;
    this.storeStatsService.setGetMessageEntireTimeMax(elapsedTime);

    // lazy init no data found.
    if (getResult == null) {
        getResult = new GetMessageResult(0);
    }

    getResult.setStatus(status);
    getResult.setNextBeginOffset(nextBeginOffset);
    getResult.setMaxOffset(maxOffset);
    getResult.setMinOffset(minOffset);
    return getResult;
}

public long getMaxOffsetInQueue(String topic, int queueId) {
    ConsumeQueue logic = this.findConsumeQueue(topic, queueId);
    if (logic != null) {
        long offset = logic.getMaxOffsetInQueue();
        return offset;
    }

    return 0;
}
```

#### 4.1.8 `PullCallback`

```java
// DefaultMQPushConsumerImpl.java
@Override
public void onSuccess(PullResult pullResult) {
    if (pullResult != null) {
        // 将消息字节数组解码成消息列表并填充msgFoundList；对消息进行TAG模式过滤
        pullResult = DefaultMQPushConsumerImpl.this.pullAPIWrapper.processPullResult(pullRequest.getMessageQueue(), pullResult,
                                                                                     subscriptionData);

        switch (pullResult.getPullStatus()) {
                // 找到对应消息
            case FOUND:
                // 上次请求偏移量
                long prevRequestOffset = pullRequest.getNextOffset();
                // 更新下一次拉取的偏移量
                pullRequest.setNextOffset(pullResult.getNextBeginOffset());
                // 计算和记录拉取用时
                long pullRT = System.currentTimeMillis() - beginTimestamp;
                DefaultMQPushConsumerImpl.this.getConsumerStatsManager().incPullRT(pullRequest.getConsumerGroup(),
                                                                                   pullRequest.getMessageQueue().getTopic(), pullRT);

                // 如果msgFoundList为空，马上进行下次拉取
                // msgFoundList为空的情况：因为根据TAG过滤时在服务端只验证了TAG的哈希码，客户端要再次对消息进行了过滤（见上），可能会出现为空的情况
                long firstMsgOffset = Long.MAX_VALUE;
                if (pullResult.getMsgFoundList() == null || pullResult.getMsgFoundList().isEmpty()) {
                    DefaultMQPushConsumerImpl.this.executePullRequestImmediately(pullRequest);
                } else {
                    // 获取返回结果中第一条消息的消费队列offset
                    firstMsgOffset = pullResult.getMsgFoundList().get(0).getQueueOffset();

                    DefaultMQPushConsumerImpl.this.getConsumerStatsManager().incPullTPS(pullRequest.getConsumerGroup(),
                                                                                        pullRequest.getMessageQueue().getTopic(), pullResult.getMsgFoundList().size());

                    // 将拉取到的消息存入ProcessQueue
                    boolean dispatchToConsume = processQueue.putMessage(pullResult.getMsgFoundList());
                    // 将拉取到的消息提交到ConsumeMessageService中供消费者消费（异步）
                    DefaultMQPushConsumerImpl.this.consumeMessageService.submitConsumeRequest(
                        pullResult.getMsgFoundList(),
                        processQueue,
                        pullRequest.getMessageQueue(),
                        dispatchToConsume);

                    // 等待pullInterval毫秒后重新拉取，或立即重新拉取
                    if (DefaultMQPushConsumerImpl.this.defaultMQPushConsumer.getPullInterval() > 0) {
                        DefaultMQPushConsumerImpl.this.executePullRequestLater(pullRequest,
                                                                               DefaultMQPushConsumerImpl.this.defaultMQPushConsumer.getPullInterval());
                    } else {
                        DefaultMQPushConsumerImpl.this.executePullRequestImmediately(pullRequest);
                    }
                }

                if (pullResult.getNextBeginOffset() < prevRequestOffset
                    || firstMsgOffset < prevRequestOffset) {
                    log.warn(
                        "[BUG] pull message result maybe data wrong, nextBeginOffset: {} firstMsgOffset: {} prevRequestOffset: {}",
                        pullResult.getNextBeginOffset(),
                        firstMsgOffset,
                        prevRequestOffset);
                }

                break;
                // 没有新消息，对应服务端结果：OFFSET_FOUND_NULL/OFFSET_OVERFLOW_ONE
            case NO_NEW_MSG:
                // 没有匹配的消息
            case NO_MATCHED_MSG:
                pullRequest.setNextOffset(pullResult.getNextBeginOffset());

                // 使用服务器端校正的偏移量进行下一次消息的拉取
                DefaultMQPushConsumerImpl.this.correctTagsOffset(pullRequest);

                DefaultMQPushConsumerImpl.this.executePullRequestImmediately(pullRequest);
                break;
                // 偏移量非法，对应服务端结果：NO_MATCHED_LOGIC_QUEUE/NO_MESSAGE_IN_QUEUE/OFFSET_OVERFLOW_BADLY/OFFSET_TOO_SMALL
            case OFFSET_ILLEGAL:
                log.warn("the pull request offset illegal, {} {}",
                         pullRequest.toString(), pullResult.toString());
                pullRequest.setNextOffset(pullResult.getNextBeginOffset());

                // 丢弃该消费队列，意味着ProcessQueue中拉取的消息将停止消费
                pullRequest.getProcessQueue().setDropped(true);
                DefaultMQPushConsumerImpl.this.executeTaskLater(new Runnable() {

                    @Override
                    public void run() {
                        try {
                            // 根据服务端下一次校对的偏移量尝试更新消息消费进度（内存中）
                            DefaultMQPushConsumerImpl.this.offsetStore.updateOffset(pullRequest.getMessageQueue(),
                                                                                    pullRequest.getNextOffset(), false);
                            // 尝试持久化消息消费进度
                            DefaultMQPushConsumerImpl.this.offsetStore.persist(pullRequest.getMessageQueue());
                            // 将该消息队列从RebalanceImpl的处理队列中移除，意味着暂停该消息队列的消息拉取，等待下一次消息队列重新负载
                            DefaultMQPushConsumerImpl.this.rebalanceImpl.removeProcessQueue(pullRequest.getMessageQueue());

                            log.warn("fix the pull request offset, {}", pullRequest);
                        } catch (Throwable e) {
                            log.error("executeTaskLater Exception", e);
                        }
                    }
                }, 10000);
                break;
            default:
                break;
        }
    }
}

@Override
public void onException(Throwable e) {
    if (!pullRequest.getMessageQueue().getTopic().startsWith(MixAll.RETRY_GROUP_TOPIC_PREFIX)) {
        log.warn("execute the pull request exception", e);
    }

    DefaultMQPushConsumerImpl.this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
}
```



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
