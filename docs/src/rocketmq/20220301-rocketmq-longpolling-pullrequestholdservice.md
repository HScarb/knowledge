---
title: RocketMQ 消息消费 轮询机制 PullRequestHoldService
author: Scarb
date: 2022-03-01
---

# RocketMQ 消息消费 轮询机制 PullRequestHoldService

[[toc]]

## 1. 概述

先来看看 RocketMQ 消费过程中的轮询机制是啥。首先需要补充一点消费相关的前置知识。

### 1.1 消息消费方式

RocketMQ 支持多种消费方式，包括 Push 模式和 Pull 模式

- Pull 模式：用户自己进行消息的拉取和消费进度的更新
- Push 模式：Broker 将新的消息自动发送给用户进行消费

### 1.2 Push 消费模式

我们一般使用 RocketMQ 时用的是 Push 模式，因为比较方便，不需要手动拉取消息和更新消费进度。

那么你有没有想过 Push 模式是如何做到能够立即消费新的消息？

#### 1.2.1 Push 模式原理

实际上，在 Push 消费时，消费者是在不断轮询 Broker，询问是否有新消息可供消费。一旦有新消息到达，马上拉取该消息。也就是说 Push 模式内部也用了 Pull 消息的模式，这样就可以立即消费到最新的消息。

### 1.3 如何进行轮询？

那么 Push 模式或 Pull 模式如何进行消息的查询？

能够想到的比较笨的方法是，每隔一定的时间（如1ms）就向 Broker 发送一个查询请求，如果没有新消息则立刻返回。可想而知这种方法非常浪费网络资源。

RocketMQ 为了提高网络性能，在拉取消息时如果没有新消息，不会马上返回，而是会将该查询请求挂起一段时间，然后再重试查询。如果一直没有新消息，直到轮询时间超过设定的阈值才会返回。

根据轮询设定的超时阈值大小的不同，RocketMQ 有两种轮询方式，分别为**长轮询**（默认）和**短轮询。**

### 1.4 长轮询和短轮询

RocketMQ 的 Broker 端参数 `longPollingEnable` 可以配置轮询方式，默认为 `true`

- 短轮询：`longPollingEnable=false`，轮询时间为 `shortPollingTimeMills` ，默认为 1s
- 长轮询：`longPollingEnable=true`，轮询时间为 5s。拉取请求挂起时间：受 `DefaultMQPullConsumer` 的 `brokerSuspendMaxTimeMillis` 控制，默认push模式固定15s，pull模式固定20s。

## 2. 概要流程

![https://raw.githubusercontent.com/HScarb/drawio-diagrams/main/rocketmq/consume/long_polling_activity.drawio.svg](https://raw.githubusercontent.com/HScarb/drawio-diagrams/main/rocketmq/consume/long_polling_activity.drawio.svg)

根据上面的活动图来看一下 RocketMQ 消费时的轮询机制流程

1. Consumer 发送拉取消息请求
2. Broker 收到请求后交给请求处理模块处理
3. 尝试从存储的消息中拉取消息
4. 如果能够拉取消息，那么将拉取到的消息直接返回
5. 如果没有拉取到消息，那么根据 Broker 是否支持挂起和是否开启长轮询来判断是否要进行轮询以及进行哪种轮询。
    1. 如果支持挂起，那么会将该拉取请求挂起
    2. 长轮询等待 5s
    3. 短轮询等待 1s
6. 检查消费队列中是否有新消息到达，如果没有则继续等待，以此循环。如果有新消息，处理挂起的拉取消息请求并返回消费者。
7. 如果没有新消息到达，轮询后会检查每个挂起的拉取请求的挂起时间是否超过挂起时间阈值，如果超过那么也会直接返回消费者，否则继续循环进行轮询操作。

---

那么按照上述流程，开启长轮询的情况下，如果一次轮询没有找到消息，要等待 5s 才能进行下一次查询。如果这 5s 当中有新的消息存入，如何保证能够立刻消费到？

解决方案不难想到，就是新的消息写入后，主动进行通知，让挂起的拉取请求立刻进行拉取操作。

RocketMQ 就是这么做的，在消息存入 CommitLog 后的 doReput 方法中，会判断是否是长轮询，如果是则会发送一个通知，让挂起的拉取请求立刻进行处理。

## 3. 详细流程

### 3.1 涉及到的类

#### 3.1.1 PullMessageProcessor

该类是 Broker 处理 Consumer 拉取清求的入口类。当 Broker 收到 Consumer 发送的拉取请求时，调用该类的 processRequest 方法

#### 3.1.2 **PullRequestHoldService**

长轮询请求管理线程，挂起的拉取请求会在这里进行保存。每等待一段时间（长轮询/短轮询等待时间）会检查挂起的请求中是否有可以进行拉取的数据。

#### 3.1.3 **DefaultMessageStore#ReputMessageService**

该线程负责将存储到 CommitLog 的消息重新转发，用以生成 ConsumeQueue 和 IndexFile 索引。在生成索引之后，会向长轮询线程发送提醒，立刻唤醒相应队列的拉取请求，执行消息拉取。

### 3.2 时序图

![https://raw.githubusercontent.com/HScarb/drawio-diagrams/main/rocketmq/consume/long_polling_sequence.drawio.svg](https://raw.githubusercontent.com/HScarb/drawio-diagrams/main/rocketmq/consume/long_polling_sequence.drawio.svg)

着重体现了长轮询逻辑，其他逻辑有所省略

1. 消费者调用 `pullKernelImpl()` 发送拉取请求，调用时用 `brokerSuspendMaxTimeMillis` 指定了 Broker 挂起的最长时间，默认为 20s
2. Broker 中 `PullMessageProcess` 处理拉取请求，从 `ConsumeQueue` 中查询消息
3. 如果没有查询到消息，判断是否启用长轮询，调用 `PullRequestHoldService#suspendPullRequest()` 方法将该请求挂起
4. PullRequestHoldService 线程 `run()` 方法循环等待轮询时间，然后周期性调用 `checkHoldRequest()` 方法检查挂起的请求是否有消息可以拉取
5. 如果检查到有新消息可以拉取，调用 `notifyMessageArriving()` 方法
6. ReputMessageService 的 doReput() 如果被调用，说明也有新消息到达，需要唤醒挂起的拉取请求。这里也会发送一个 notify，进而调用 `notifyMessageArriving()` 方法
7. `notifyMessageArriving()` 方法中也会查询 ConsumeQueue 的最大 offset，如果确实有新消息，那么将唤醒对应的拉取请求，具体的方法是调用 `executeRequestWhenWakeup()` 方法
8. `executeRequestWhenWakeup()` 方法唤醒拉取请求，调用 `processRequest()` 方法处理该请求

### 3.3 每个类的具体逻辑

#### 3.3.1 PullMessageProcessor

Broker 处理 Consumer 拉取清求的入口类

- `RemotingCommand processRequest(ChannelHandlerContext ctx, RemotingCommand request)`：处理 Consumer 拉取请求的入口方法，收到 Consumer 拉取请求时调用。该方法主要完成如下操作
    1. 校验
    2. 消息过滤
    3. 从存储中查询消息
    4. 返回响应给 Consumer
    
    如果从存储中没有查询到消息，会将响应码设置为 `ResponseCode.PULL_NOT_FOUND`，并且启动长轮询
    
- `void executeRequestWhenWakeup(Channel channel, final RemotingCommand request)`：将 Hold 的拉取请求唤醒，再次拉取消息
    - 该方法在长轮询收到新消息时调用，立即唤醒挂起的拉取请求，然后对这些请求调用 `processRequest` 方法
    - 何时需要提醒长轮询新消息已经到达？上面说到，在长轮询等待时如果有新消息到达，`CommitLog` 的 `doReput` 方法中会进行提醒，最终会调用 `executeRequestWhenWakeup` 方法

#### 3.3.2 **PullRequestHoldService**

该服务线程会从 `pullRequestTable` 本地缓存变量中取PullRequest请求，检查轮询条件“**待拉取消息的偏移量是否小于消费队列最大偏移量**”是否成立，如果条件成立则说明有新消息达到Broker端，则通过PullMessageProcessor的executeRequestWhenWakeup()方法重新尝试发起Pull消息的RPC请求

- `pullRequestTable`
  
    ```java
    private ConcurrentMap<String/* topic@queueId */, ManyPullRequest/* 同一队列积累的拉取请求 */> pullRequestTable = new ConcurrentHashMap<>(1024)
    ```
    
    上面是挂起的消息拉取请求容器，它是一个 `ConcurrentHashMap`，key 是拉取请求的队列，value 是该队列挂起的所有拉取请求。其中 `ManyPullRequest` 底层是一个 `ArrayList`，它的 add 方法加了锁。
    
- `suspendPullRequest(String topic, int queueId, PullRequest pullRequest)`：将 Consumer 拉取请求暂时挂起，会将请求加入到 `pullRequestTable` 中
- `checkHoldRequest()`：检查所有挂起的拉取请求，如果有数据满足要求，就唤醒该请求，对其执行 `PullMessageProcessor#processRequest` 方法
- `run()`：线程主循环，每等待一段时间就调用 `checkHoldRequest()` 方法检查是否有请求需要唤醒。等待的时间根据长轮询/短轮询的配置决定，长轮询等待 5s，短轮询默认等待 1s
- `notifyMessageArriving()`：被 `checkHoldRequest()` 和 `ReputMessageService#doReput()` 调用，表示新消息到达，唤醒对应队列挂起的拉取请求

#### 3.3.3 **DefaultMessageStore#ReputMessageService**

该服务线程 `doReput()` 方法会在 Broker 端不断地从数据存储对象 `CommitLog` 中解析数据并分发请求，随后构建出 `ConsumeQueue`（逻辑消费队列）和 `IndexFile`（消息索引文件）两种类型的数据。

同时从本地缓存变量 `PullRequestHoldService#pullRequestTable` 中，取出挂起的拉起请求并执行。

## 4. 源码解析

### 4.1 PullMessageProcessor

#### 4.1.1 processRequest

如果从存储中没有查询到消息，会将响应码设置为 `ResponseCode.PULL_NOT_FOUND`，并且启动长轮询

以下三种情况会将响应码设置为`ResponseCode.PULL_NOT_FOUND`：

1. NO_MESSAGE_IN_QUEUE：消费队列中没有任何消息
2. OFFSET_FOUND_NULL：offset未找到任何数据
3. OFFSET_OVERFLOW_ONE：待拉取偏移量等于队列最大偏移量

```java
/**
 * 处理客户端请求入口
 *
 * @param channel 网络通道，通过该通道向消息拉取客户端发送响应结果
 * @param request 消息拉取请求
 * @param brokerAllowSuspend Broker端是否允许挂起，默认true。true：如果未找到消息则挂起。false：未找到消息直接返回消息未找到
 * @return 响应
 * @throws RemotingCommandException 当解析请求发生异常时
 */
private RemotingCommand processRequest(final Channel channel, RemotingCommand request, boolean brokerAllowSuspend)
    throws RemotingCommandException {
		// ...
		switch (response.getCode()) {
				// ...
        // 如果从消费队列中未找到新的可以拉取的消息，判断并挂起该拉取请求
        case ResponseCode.PULL_NOT_FOUND:
            // 长轮询
            if (brokerAllowSuspend && hasSuspendFlag) {
                long pollingTimeMills = suspendTimeoutMillisLong;
                if (!this.brokerController.getBrokerConfig().isLongPollingEnable()) {
                    pollingTimeMills = this.brokerController.getBrokerConfig().getShortPollingTimeMills();
                }

                String topic = requestHeader.getTopic();
                long offset = requestHeader.getQueueOffset();
                int queueId = requestHeader.getQueueId();
                PullRequest pullRequest = new PullRequest(request, channel, pollingTimeMills,
                    this.brokerController.getMessageStore().now(), offset, subscriptionData, messageFilter);
                this.brokerController.getPullRequestHoldService().suspendPullRequest(topic, queueId, pullRequest);
                response = null;
                break;
            }
    // ...
}
```

#### 4.1.2 executeRequestWhenWakeup

在PullMessageProcessor的executeRequestWhenWakeup()方法中，通过业务线程池pullMessageExecutor，异步提交重新Pull消息的请求任务，即为重新调了一次PullMessageProcessor业务处理器的processRequest()方法，来实现Pull消息请求的二次处理）。

```java
/**
 * 将Hold的拉取请求唤醒，再次拉取消息
 * 该方法调用线程池，因此，不会阻塞
 *
 * @param channel 通道
 * @param request Consumer拉取请求
 * @throws RemotingCommandException 当远程调用发生异常
 */
public void executeRequestWhenWakeup(final Channel channel,
    final RemotingCommand request) throws RemotingCommandException {
    Runnable run = new Runnable() {
        @Override
        public void run() {
            try {
                // 处理Consumer拉取请求，获取返回体
                final RemotingCommand response = PullMessageProcessor.this.processRequest(channel, request, false);

                if (response != null) {
                    response.setOpaque(request.getOpaque());
                    response.markResponseType();
                    try {
                        // 将返回体写入channel，返回给Consumer
                        channel.writeAndFlush(response).addListener(new ChannelFutureListener() {
                            @Override
                            public void operationComplete(ChannelFuture future) throws Exception {
                                if (!future.isSuccess()) {
                                    log.error("processRequestWrapper response to {} failed",
                                        future.channel().remoteAddress(), future.cause());
                                    log.error(request.toString());
                                    log.error(response.toString());
                                }
                            }
                        });
                    } catch (Throwable e) {
                        log.error("processRequestWrapper process request over, but response failed", e);
                        log.error(request.toString());
                        log.error(response.toString());
                    }
                }
            } catch (RemotingCommandException e1) {
                log.error("excuteRequestWhenWakeup run", e1);
            }
        }
    };
    // 异步执行请求处理和返回
    this.brokerController.getPullMessageExecutor().submit(new RequestTask(run, channel, request));
}
```

### 4.2 **PullRequestHoldService**

#### 4.2.1 suspendPullRequest

```java
/**
 * 挂起（保存）客户端请求，当有数据的时候触发请求
 *
 * @param topic 主题
 * @param queueId 队列编号
 * @param pullRequest 拉取消息请求
 */
public void suspendPullRequest(final String topic, final int queueId, final PullRequest pullRequest) {
    // 根据topic和queueId构造map的key
    String key = this.buildKey(topic, queueId);
    // map的key如果为空，创建一个空的request队列，填充key和value
    ManyPullRequest mpr = this.pullRequestTable.get(key);
    if (null == mpr) {
        mpr = new ManyPullRequest();
        ManyPullRequest prev = this.pullRequestTable.putIfAbsent(key, mpr);
        if (prev != null) {
            mpr = prev;
        }
    }

    // 保存该次Consumer拉取请求
    mpr.addPullRequest(pullRequest);
}
```

#### 4.2.2 checkHoldRequest

```java
/**
 * 检查所有已经挂起的长轮询请求
 * 如果有数据满足要求，就触发请求再次执行
 */
private void checkHoldRequest() {
    // 遍历拉取请求容器中的每个队列
    for (String key : this.pullRequestTable.keySet()) {
        String[] kArray = key.split(TOPIC_QUEUEID_SEPARATOR);
        if (2 == kArray.length) {
            String topic = kArray[0];
            int queueId = Integer.parseInt(kArray[1]);
            // 从store中获取队列的最大偏移量
            final long offset = this.brokerController.getMessageStore().getMaxOffsetInQueue(topic, queueId);
            try {
                // 根据store中获取的最大偏移量，判断是否有新消息到达，如果有则执行拉取请求操作
                this.notifyMessageArriving(topic, queueId, offset);
            } catch (Throwable e) {
                log.error("check hold request failed. topic={}, queueId={}", topic, queueId, e);
            }
        }
    }
}
```

#### 4.2.3 run

```java
@Override
public void run() {
    log.info("{} service started", this.getServiceName());
    while (!this.isStopped()) {
        try {
            // 等待一定时间
            if (this.brokerController.getBrokerConfig().isLongPollingEnable()) {
                // 开启长轮询，每5s判断一次消息是否到达
                this.waitForRunning(5 * 1000);
            } else {
                // 未开启长轮询，每1s判断一次消息是否到达
                this.waitForRunning(this.brokerController.getBrokerConfig().getShortPollingTimeMills());
            }

            long beginLockTimestamp = this.systemClock.now();
            // 检查是否有消息到达，可以唤醒挂起的请求
            this.checkHoldRequest();
            long costTime = this.systemClock.now() - beginLockTimestamp;
            if (costTime > 5 * 1000) {
                log.info("[NOTIFYME] check hold request cost {} ms.", costTime);
            }
        } catch (Throwable e) {
            log.warn(this.getServiceName() + " service has exception. ", e);
        }
    }

    log.info("{} service end", this.getServiceName());
}
```

#### 4.2.4 notifyMessageArriving

这个方法在两个地方被调用，如下图所示

![Untitled](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203152215195.png)

这个方法是重新唤醒拉取请求的核心方法。调用这个方法，提醒 PullRequestHoldService 线程有新消息到达

我们来看看这个方法具体做了什么

1. 根据 topic 和 queueId 获取挂起的拉取请求列表
2. 从 store 中获取该队列消息的最大offset
3. 遍历该队列的所有拉取请求，符合以下两种条件之一的拉取请求会被处理并返回
    1. 消费队列最大offset比消费者拉取请求的offset大，说明有新的消息可以被拉取，处理该拉取请求
    2. 拉取请求挂起时间超过阈值，直接返回消息未找到
4. 如果不满足以上两个条件，那么该拉取请求会重新放回 `pullRequestTable`，等待下次检查

```java
/**
 * 当有新消息到达的时候，唤醒长轮询的消费端请求
 *
 * @param topic     消息Topic
 * @param queueId   消息队列ID
 * @param maxOffset 消费队列的最大Offset
 */
public void notifyMessageArriving(final String topic, final int queueId, final long maxOffset, final Long tagsCode,
    long msgStoreTime, byte[] filterBitMap, Map<String, String> properties) {
    // 根据topic和queueId从容器中取出挂起的拉取请求列表
    String key = this.buildKey(topic, queueId);
    ManyPullRequest mpr = this.pullRequestTable.get(key);
    if (mpr != null) {
        // 获取挂起的拉取请求列表
        List<PullRequest> requestList = mpr.cloneListAndClear();
        if (requestList != null) {
            // 预先定义需要继续挂起的拉取请求列表
            List<PullRequest> replayList = new ArrayList<PullRequest>();

            for (PullRequest request : requestList) {
                long newestOffset = maxOffset;
                // 从store中获取该队列消息的最大offset
                if (newestOffset <= request.getPullFromThisOffset()) {
                    newestOffset = this.brokerController.getMessageStore().getMaxOffsetInQueue(topic, queueId);
                }

                // 消费队列最大offset比消费者拉取请求的offset大，说明有新的消息可以被拉取
                if (newestOffset > request.getPullFromThisOffset()) {
                    // 消息过滤匹配
                    boolean match = request.getMessageFilter().isMatchedByConsumeQueue(tagsCode,
                        new ConsumeQueueExt.CqExtUnit(tagsCode, msgStoreTime, filterBitMap));
                    // match by bit map, need eval again when properties is not null.
                    if (match && properties != null) {
                        match = request.getMessageFilter().isMatchedByCommitLog(null, properties);
                    }

                    if (match) {
                        try {
                            // 会调用PullMessageProcessor#processRequest方法拉取消息，然后将结果返回给消费者
                            this.brokerController.getPullMessageProcessor().executeRequestWhenWakeup(request.getClientChannel(),
                                request.getRequestCommand());
                        } catch (Throwable e) {
                            log.error("execute request when wakeup failed.", e);
                        }
                        continue;
                    }
                }

                // 查看是否超时，如果Consumer请求达到了超时时间，也触发响应，直接返回消息未找到
                if (System.currentTimeMillis() >= (request.getSuspendTimestamp() + request.getTimeoutMillis())) {
                    try {
                        this.brokerController.getPullMessageProcessor().executeRequestWhenWakeup(request.getClientChannel(),
                            request.getRequestCommand());
                    } catch (Throwable e) {
                        log.error("execute request when wakeup failed.", e);
                    }
                    continue;
                }
                // 当前不满足要求，重新放回Hold列表中
                replayList.add(request);
            }

            if (!replayList.isEmpty()) {
                mpr.addPullRequest(replayList);
            }
        }
    }
}
```

### 4.3 **DefaultMessageStore#ReputMessageService**

#### 4.3.1 doReput

```java
private void doReput() {
    // ...
    DefaultMessageStore.this.doDispatch(dispatchRequest);
    // 通知消息消费长轮询线程，有新的消息落盘，立即唤醒挂起的消息拉取请求
    if (BrokerRole.SLAVE != DefaultMessageStore.this.getMessageStoreConfig().getBrokerRole()
            && DefaultMessageStore.this.brokerConfig.isLongPollingEnable()
            && DefaultMessageStore.this.messageArrivingListener != null) {
        DefaultMessageStore.this.messageArrivingListener.arriving(dispatchRequest.getTopic(),
            dispatchRequest.getQueueId(), dispatchRequest.getConsumeQueueOffset() + 1,
            dispatchRequest.getTagsCode(), dispatchRequest.getStoreTimestamp(),
            dispatchRequest.getBitMap(), dispatchRequest.getPropertiesMap());
}
```

这里调用了 NotifyMessageArrivingListener#arriving() 方法，进而调用 PullRequestHoldService.notifyMessageArriving()。

为什么不直接调用 pullRequestHoldService.notifyMessageArriving() ？因为 doReput 所处的类所在的包是 store，存储包，而 PullRequestHoldService 在 broker 包中

所以需要一个桥梁，就是 NotifyMessageArrivingListener。它在 Broker 初始化 DefaultMessageStore 时被写入 DefaultMessageStore 

#### 4.3.2 NotifyMessageArrivingListener#arriving

```java
public class NotifyMessageArrivingListener implements MessageArrivingListener {
    @Override
    public void arriving(String topic, int queueId, long logicOffset, long tagsCode,
        long msgStoreTime, byte[] filterBitMap, Map<String, String> properties) {
        // 提醒长轮询请求管理容器，新的消息到达，立刻拉取最新消息
        this.pullRequestHoldService.notifyMessageArriving(topic, queueId, logicOffset, tagsCode,
            msgStoreTime, filterBitMap, properties);
    }
}
```

## 参考资料

- [源码分析RocketMQ消息PULL-长轮询模式](https://blog.csdn.net/prestigeding/article/details/79357818)
- [消息中间件—RocketMQ 消息消费（二）（push 模式实现）](https://www.6aiq.com/article/1563130068940)


---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
