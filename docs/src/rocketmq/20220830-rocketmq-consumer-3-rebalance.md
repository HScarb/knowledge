---
title: RocketMQ 消费者（3）重平衡 流程详解 & 源码解析
author: Scarb
date: 2022-08-30
---

原文地址：[http://hscarb.github.io/rocketmq/20220830-rocketmq-consumer-3-rebalance.html](http://hscarb.github.io/rocketmq/20220830-rocketmq-consumer-3-rebalance.html)

# RocketMQ 消费者（3）重平衡 流程详解 & 源码解析

## 1. 背景

本文是 RocketMQ 消费者系列的第三篇，介绍消费者重平衡。

我把 RocketMQ 消费分成如下几个步骤

1. 重平衡
2. 消费者拉取消息
3. Broker 接收拉取请求后从存储中查询消息并返回
4. 消费者消费消息

其中重平衡是消费者开始消费的起点。

### 1.1 重平衡的含义

RocketMQ 的 Topic 设计成有多个 Queue，被多个消费者同时消费来加快消费速率。

在多个消费者同时消费一个 Topic 时，其中的每个 Queue 只能同时被一个消费者消费。在消费者数量变化时，将  Queue 分配给消费者进行消费的动作即重平衡。

## 2. 概要设计

RocketMQ 的重平衡大致实现方式为：在消费者端用一个固定的分配策略将所有的消费队列分配给所有的消费者。通过将每个消费者的分配策略设置成一致，并且将消费者和消费队列排序的方法，保证每个消费者的分配的结果幂等。

### 2.1 重平衡的触发

RocketMQ 的重平衡在消费端完成。唯一的触发点是一个重平衡线程，触发方式分主动触发和定时触发。

* 主动触发：消费者数量发生变化
  1. 推模式消费者启动或恢复时，唤醒本地的重平衡线程，立即重平衡。在这之前还上报心跳让 Broker 感知到新消费者启动，发送请求让所有消费者重平衡。
  2. 消费者关机时，向 Broker 发请求解除注册。Broker 收到请求后发送请求让其他消费者重平衡。
  
  * 主动触发模式可以通过以下配置来关闭，当消费者数量很多，或者频繁上下线时，为了防止频繁进行重平衡，建议关闭主动触发。
    * Broker 级别配置：`notifyConsumerIdsChangedEnable`（broker.conf）
    * 消费组级别配置：`notifyConsumerIdsChangedEnable`（通过 `updateSubGroup` 命令设置）
    * 只要有一个为 false，就不会进行对应消费组的重平衡主动触发。
* 定时触发：重平衡线程每 20s 触发一次重平衡。

### 2.2 重平衡类设计

重平衡主要涉及两个类：重平衡实现 `RebalanceImpl` 和重平衡线程 `RebalanceService`

* 重平衡线程：客户端实例持有，每个客户端进程一般只有一个，负责定时或者立即触发重平衡。但它只负责触发，重平衡的实际逻辑在实现类中。
* 重平衡实现：
  * `RebalanceImpl` 中保存了消费者负载的消息队列、重分配策略，并实现了重分配的方法（调用重平衡策略）。
  * 每个消费者持有一个重平衡实现，根据推和拉模式的不同，分别在 `RebalanceImpl` 的基础上新实现了推模式和拉模式的重平衡实现。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312698813.png)

### 2.3 重平衡流程

消费者按 Topic 维度进行重平衡。

1. 从本地缓存中获取 Topic 的所有 Queue
2. 向 Broker 获取所有消费者
3. 按预设的策略将队列分配给消费者
4. 判断自己分配到的队列是否变化
   * 如果变化则丢弃老队列，开始拉取新队列，并将订阅关系上报到 Broker

RocketMQ 的重平衡流程在消费者端完成，但是由 Broker 端发送信号给所有消费者触发。

## 3. 详细设计

RocketMQ 的重平衡在客户端（即消费者端）完成。

> [RocketMQ 5.0 中的 POP 消费者特性](https://github.com/apache/rocketmq/pull/2867/files) 支持将重平衡流程在服务端实现，解决了消费端异常 Hang 住时其负载的队列可能会堆积的问题。



### 3.1 重平衡实现类 RebalanceImpl

`RebalanceImpl` 类中实现了整个重平衡流程。

#### 3.1.1 域

RabalanceImpl 类保存一些重平衡需要的基本信息。

1. `subscriptionInner`：消费者订阅的所有 Topic。重平衡时遍历这些 Topic 进行重平衡。
2. `topicSubscribeInfoTable`：Topic 下的所有队列。重平衡时对这些队列应用重分配策略进行分配。
3. `processQueueTable`：该消费者负载的所有消息队列。重平衡完成后，对比之前的负载来判断是否要改变队列进行消息拉取。

此外还有一个重要的域即重分配策略类 `allocateMessageQueueStrategy`，同一消费组中的每个消费者应保持一致，以保证重分配的结果一致。

#### 3.1.2 方法

重平衡实现类中包含重平衡的一系列逻辑，由抽象类直接实现。

* 重平衡方法 `doRebalance`
  * 重平衡方法会可以细分为对每个 Topic 进行重平衡的方法 `rebalanceByTopic`
    * 对 Topic 进行重平衡后需要判断并更新消费者的负载，方法为 `updateProcessQueueTableInRebalance`

此外还包含了一些抽象方法，根据消费者类型不同有着不同的实现。

* `messageQueueChange`：负载的消息队列发生变化时调用
* `dispatchPullRequest`：分发拉取请求到消息拉取服务，开始拉取消息
* `removeUnnecessaryMessageQueue`：将重平衡后丢弃的消费队列移除

### 3.2 重平衡流程

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312699594.png)

#### 3.2.1 重平衡触发

我把重平衡的触发分为主动触发和被动触发，主动触发是由消费者的启动和停止触发的；而被动触发一般是其他消费者每 20s 进行检查或者是收到 Broker 发送的重平衡请求时触发。

上图中标识了 4 个触发点。黄色为主动触发，蓝色为被动触发。

1. 消费者启动时（ `start()` ）先向 Broker 发送心跳（触发点 4），然后调用 `rebalanceImmediately()` 方法，立即唤醒重平衡线程执行本地重平衡。
2. 消费者停止时（`shutdown()`）
   1.  Broker 发送请求解除注册
   2.  Broker 处理之后再向每个消费者发送消费者数量变化消息
   3. 所有消费者收到后唤醒重平衡线程进行重平衡
3. 被动触发，重平衡线程 `RebalanceService` 每等待 20s 进行一次重平衡
4. 其他消费者收到消费者数量变化请求时进行重平衡。与触发点 2 类似，都是消费者收到 Broker 请求后触发。

RocketMQ 中主要有 3 种消费者实现，它们的重平衡触发也不太相同。上面主要讲的是推模式消费者 `DefaultMQPushConsumer` 的重平衡触发流程。此外还有两个拉模式消费者。

* `DefaultMQPullConsumer`：封装很原始的消费者，已经被标记为 `@Deprecated`。只有指定队列进行拉取的接口。
  * 它没有订阅 Topic 的方法，在启动和停止时也不会向 Broker 发送心跳标识消费者的数量变化。
  * 在每次拉取消息时（`pull()`）会更新订阅的 Topic，也会启动重平衡线程每 20s 进行重平衡。也就是说在第一次拉取消息之后的 20s 内可能会进行重平衡。
  * 一般不会用到该消费者的重平衡机制。

* `DefaultLitePullConsumer`：仿照 kafka 消费者的 API 实现的新消费者，后台有线程拉取消息进行缓存，可以做到比推模式消费者更高的拉取效率。
  * 在订阅 Topic 时（`subscribe()`）会向 Broker 发送心跳请求，此时就开始重平衡。
  * 在停止时（`shutdown()`）向 Broker 发送注销请求，此时也会触发重平衡。
  * 重平衡线程每 20s 进行重平衡的检查。
  * 可以看出该拉模式消费者与推模式消费者的重平衡机制比较类似，可以进行重平衡。

#### 3.2.2 重平衡流程

重平衡线程调用客户端实例的重平衡方法 `doRebalance` 进行重平衡，客户端实例的该方法没有具体逻辑，仅仅是遍历客户端上注册的所有消费者，获取它们的重平衡实现并且调用 `RebalanceImpl#doRebalance` 方法。

该方法逻辑如下：

* `rebalanceByTopic`：从本地缓存中获取该消费者订阅的所有 Topic，对每个 Topic 进行重平衡 
  * 从本地缓存中获取该 Topic 的所有消息队列
  * 发送请求到 Broker，获取该消费组下所有的消费者（ID）
  * 将消息队列和消费者 ID 排序（用来保证每个消费者执行同样的重平衡流程得到的结果一致，刚好能完全分配队列给所有消费者）
  * 执行分配策略的重分配方法，获取自己分配到的消息队列
  * `updateProcessQueueTableInRebalance`：更新自己需要拉取的处理队列 
    * 遍历本地缓存的消费者分到的消息队列，判断要丢弃的队列并丢弃
    * `computePullFromWhereWithException`：计算并从偏移量存储中读取下次拉取的偏移量
    * 遍历新分配的消息队列，对于新分配的，添加处理队列并创建 `PullRequest` 启动拉取
    * `dispatchPullRequest`：将新建的 `PullRequest` 加入消息拉取线程 `PullMessageService`，开始拉取
  * `messageQueueChanged`：将新的队列订阅关系通过发送心跳请求上报给 Broker
    * 更新订阅数据版本号
    * 设置 Topic 维度拉取流控
    * 发送心跳给 Broker 更新队列订阅关系
    * 重新分配之后，移除不再属于当前实例的消息队列和处理队列

这里的处理队列指 `ProcessQueue`，用来临时存放拉取到待消费的消息，与消息队列一一对应。

拉取请求 `PullRequest`，每个队列只会新建一个，重复使用。每次拉取完一次后将拉取请求重新放入拉取服务的等待队列 `pullRequestQueue`，进行下一次拉取。初始化 `PullRequest` 的地方只有一个，就是重平衡实现 `RebalanceImpl`，也就是说重平衡是消息拉取唯一的起点。

### 3.3 重平衡队列分配策略

RocketMQ 提供了 6 中重平衡策略（队列分配策略）



![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202208302336879.png)

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312699654.png)



* AllocateMessageQueueAveragely：（默认）平均分配，推荐使用。
* AllocateMessageQueueAveragelyByCircle：环形寻论平均分配，推荐使用。
* AllocateMessageQueueConsistentHash：一致性哈希。
* AllocateMessageQueueByConfig：根据配置，为每个消费者配置固定的消息队列。
* AllocateMessageQueueByMachineRoom：根据 Broker 配置的机房名，对每隔消费者负载不同 Broker 上的队列。

## 4. 源码解析

### 4.1 `RebalanceService` 重平衡线程

```java
public class RebalanceService extends ServiceThread {
    // ...

    @Override
    public void run() {
        log.info(this.getServiceName() + " service started");

        while (!this.isStopped()) {
            // 等待 20s，调用 ServiceThread#wakeup() 方法可以直接跳过等待
            this.waitForRunning(waitInterval);
            // 每隔 20s 对所有消费者执行一次重平衡检查
            this.mqClientFactory.doRebalance();
        }

        log.info(this.getServiceName() + " service end");
    }
}
```

### 4.2 `RebalanceImpl` 重平衡实现 

#### 4.2.1 `doRebalance` 重平衡入口 

```java
/**
 * 消费者重平衡
 * 获取全部的订阅信息，从订阅信息中找到所有的 Topic，每一个 Topic 的队列进行重平衡
 */
public void doRebalance(final boolean isOrder) {
    Map<String, SubscriptionData> subTable = this.getSubscriptionInner();
    if (subTable != null) {
        // 遍历每个 Topic 的订阅信息
        for (final Map.Entry<String, SubscriptionData> entry : subTable.entrySet()) {
            final String topic = entry.getKey();
            try {
                // 对每个主题的队列进行重平衡
                this.rebalanceByTopic(topic, isOrder);
            } catch (Throwable e) {
                if (!topic.startsWith(MixAll.RETRY_GROUP_TOPIC_PREFIX)) {
                    log.warn("rebalanceByTopic Exception", e);
                }
            }
        }
    }

    // 重新分配之后，移除不再属于当前实例的MessageQueue和ProcessQueue
    this.truncateMessageQueueNotMyTopic();
}
```

#### 4.2.2 `rebalanceByTopic` 对 Topic 进行重平衡

```java
/**
 * 根据 Topic 重新进行 MessageQueue 负载（重平衡）
 *
 * @param topic
 */
private void rebalanceByTopic(final String topic, final boolean isOrder) {
    switch (messageModel) {
        case BROADCASTING: {
            Set<MessageQueue> mqSet = this.topicSubscribeInfoTable.get(topic);
            if (mqSet != null) {
                boolean changed = this.updateProcessQueueTableInRebalance(topic, mqSet, isOrder);
                if (changed) {
                    this.messageQueueChanged(topic, mqSet, mqSet);
                    log.info("messageQueueChanged {} {} {} {}",
                             consumerGroup,
                             topic,
                             mqSet,
                             mqSet);
                }
            } else {
                log.warn("doRebalance, {}, but the topic[{}] not exist.", consumerGroup, topic);
            }
            break;
        }
        case CLUSTERING: {
            // 从客户端缓存表中获取 Topic 对应的队列信息
            Set<MessageQueue> mqSet = this.topicSubscribeInfoTable.get(topic);
            // 从 Broker 获取当前消费组内所有消费者的客户端 ID
            List<String> cidAll = this.mQClientFactory.findConsumerIdList(topic, consumerGroup);
            if (null == mqSet) {
                if (!topic.startsWith(MixAll.RETRY_GROUP_TOPIC_PREFIX)) {
                    log.warn("doRebalance, {}, but the topic[{}] not exist.", consumerGroup, topic);
                }
            }

            if (null == cidAll) {
                log.warn("doRebalance, {} {}, get consumer id list failed", consumerGroup, topic);
            }

            if (mqSet != null && cidAll != null) {
                // Topic 下的所有队列
                List<MessageQueue> mqAll = new ArrayList<MessageQueue>();
                mqAll.addAll(mqSet);

                // 对该 Topic 下的所有队列和消费者列表进行排序，保证所有消费者分配的结果一致
                Collections.sort(mqAll);
                Collections.sort(cidAll);

                // 分配策略
                AllocateMessageQueueStrategy strategy = this.allocateMessageQueueStrategy;

                // 按策略分配，得到分配给当前消费者实例的队列列表
                List<MessageQueue> allocateResult = null;
                try {
                    allocateResult = strategy.allocate(//
                        this.consumerGroup, // 消费组
                        this.mQClientFactory.getClientId(), // 当前消费者ID
                        mqAll,// Topic下所有的MessageQueue
                        cidAll); //当前Topic下，当前消费组中所有的消费者ID
                } catch (Throwable e) {
                    log.error("AllocateMessageQueueStrategy.allocate Exception. allocateMessageQueueStrategyName={}", strategy.getName(),
                              e);
                    return;
                }

                // 得到重平衡后的该消费者分到的消息队列 Set
                Set<MessageQueue> allocateResultSet = new HashSet<MessageQueue>();
                if (allocateResult != null) {
                    allocateResultSet.addAll(allocateResult);
                }

                // 对比分配给自己的消息队列是否发生变化
                boolean changed = this.updateProcessQueueTableInRebalance(topic, allocateResultSet, isOrder);
                if (changed) {
                    log.info(
                        "rebalanced result changed. allocateMessageQueueStrategyName={}, group={}, topic={}, clientId={}, mqAllSize={}, cidAllSize={}, rebalanceResultSize={}, rebalanceResultSet={}",
                        strategy.getName(), consumerGroup, topic, this.mQClientFactory.getClientId(), mqSet.size(), cidAll.size(),
                        allocateResultSet.size(), allocateResultSet);
                    // 回调 MessageQueue 变化事件，
                    this.messageQueueChanged(topic, mqSet, allocateResultSet);
                }
            }
            break;
        }
        default:
            break;
    }
}
```



#### 4.2.3 `updateProcessQueueTableInRebalance` 重平衡后更新订阅的队列和处理队列表

```java
/**
 * 重平衡后更新 ProcessQueue 表
 * 丢弃不再消费的队列，为新增的队列新建 ProcessQueue 和 PullRequest
 *
 * @param topic 主题
 * @param mqSet 重平衡后该消费者新分配到的的消息队列
 * @param isOrder
 * @return
 */
private boolean updateProcessQueueTableInRebalance(final String topic, final Set<MessageQueue> mqSet,
                                                   final boolean isOrder) {
    boolean changed = false;

    // 遍历本地缓存的消费者分到的消息队列，判断要丢弃的队列并丢弃
    Iterator<Entry<MessageQueue, ProcessQueue>> it = this.processQueueTable.entrySet().iterator();
    while (it.hasNext()) {
        Entry<MessageQueue, ProcessQueue> next = it.next();
        MessageQueue mq = next.getKey();
        ProcessQueue pq = next.getValue();

        if (mq.getTopic().equals(topic)) {
            // 如果新分配到的消息队列集合中不含有老的消息队列，丢弃老的处理队列
            if (!mqSet.contains(mq)) {
                // 该 ProcessQueue 中不会有消息被消费
                pq.setDropped(true);
                // 移除消费队列，移除前持久化
                if (this.removeUnnecessaryMessageQueue(mq, pq)) {
                    it.remove();
                    changed = true;
                    log.info("doRebalance, {}, remove unnecessary mq, {}", consumerGroup, mq);
                }
            } else if (pq.isPullExpired()) {
                /**
                     * 如果Reblance之后的mq集合包含该MessageQueue,但是ProcessQueue已经太久没有拉取数据（上次拉取消息的时间距离现在超过设置时间）
                     */
                switch (this.consumeType()) {
                    case CONSUME_ACTIVELY:
                        break;
                    case CONSUME_PASSIVELY:
                        /**
                             * PushConsumer为被动消费
                             * 如果是PUSH，则丢弃ProcessQueue
                             * 同时删除MessageQueue
                             */
                        pq.setDropped(true);
                        if (this.removeUnnecessaryMessageQueue(mq, pq)) {
                            it.remove();
                            changed = true;
                            log.error("[BUG]doRebalance, {}, remove unnecessary mq, {}, because pull is pause, so try to fixed it",
                                      consumerGroup, mq);
                        }
                        break;
                    default:
                        break;
                }
            }
        }
    }

    // 遍历新分配的 MessageQueue，对于新分配的，创建 PullRequest 启动拉取
    List<PullRequest> pullRequestList = new ArrayList<PullRequest>();
    // 为每个 MessageQueue 新建一个 PullRequest
    for (MessageQueue mq : mqSet) {
        if (!this.processQueueTable.containsKey(mq)) {
            // 本地缓存的 ProcessQueue 中不包含，表示新增队列
            if (isOrder && !this.lock(mq)) {
                log.warn("doRebalance, {}, add a new mq failed, {}, because lock failed", consumerGroup, mq);
                continue;
            }

            // 从内存中移除该 MessageQueue 的消费进度（老的进度不需要）
            this.removeDirtyOffset(mq);
            ProcessQueue pq = new ProcessQueue();

            // 计算当前 MessageQueue 应该从哪里开始拉取消息
            long nextOffset = -1L;
            try {
                // 计算并从偏移量存储中读取下次拉取的偏移量
                nextOffset = this.computePullFromWhereWithException(mq);
            } catch (Exception e) {
                log.info("doRebalance, {}, compute offset failed, {}", consumerGroup, mq);
                continue;
            }

            if (nextOffset >= 0) {
                // 添加 MessageQueue 和 ProcessQueue 的映射关系
                ProcessQueue pre = this.processQueueTable.putIfAbsent(mq, pq);
                if (pre != null) {
                    log.info("doRebalance, {}, mq already exists, {}", consumerGroup, mq);
                } else {
                    // 添加成功，创建新的 PullRequest
                    // 唯一的创建 PullRequest 的地方
                    log.info("doRebalance, {}, add a new mq, {}", consumerGroup, mq);
                    PullRequest pullRequest = new PullRequest();
                    pullRequest.setConsumerGroup(consumerGroup);
                    pullRequest.setNextOffset(nextOffset);
                    pullRequest.setMessageQueue(mq);
                    pullRequest.setProcessQueue(pq);
                    pullRequestList.add(pullRequest);
                    changed = true;
                }
            } else {
                log.warn("doRebalance, {}, add new mq failed, {}", consumerGroup, mq);
            }
        }
    }

    // 将新建的 PullRequest 加入消息拉取线程 PullMessageService，开始拉取
    this.dispatchPullRequest(pullRequestList);

    return changed;
}
```

#### 4.2.4 `MessageQueueChanged`

```java
// RebalancePushImpl.java
/**
 * 如果消费的 MessageQueue 变化，上报 Broker，将订阅关系发送给 Broker
 * @param topic
 * @param mqAll
 * @param mqDivided
 */
@Override
public void messageQueueChanged(String topic, Set<MessageQueue> mqAll, Set<MessageQueue> mqDivided) {
    /**
         * When rebalance result changed, should update subscription's version to notify broker.
         * Fix: inconsistency subscription may lead to consumer miss messages.
         */
    SubscriptionData subscriptionData = this.subscriptionInner.get(topic);
    long newVersion = System.currentTimeMillis();
    log.info("{} Rebalance changed, also update version: {}, {}", topic, subscriptionData.getSubVersion(), newVersion);
    subscriptionData.setSubVersion(newVersion);

    int currentQueueCount = this.processQueueTable.size();
    if (currentQueueCount != 0) {
        // Topic 维度流控，默认为 -1，即不流控
        int pullThresholdForTopic = this.defaultMQPushConsumerImpl.getDefaultMQPushConsumer().getPullThresholdForTopic();
        if (pullThresholdForTopic != -1) {
            int newVal = Math.max(1, pullThresholdForTopic / currentQueueCount);
            log.info("The pullThresholdForQueue is changed from {} to {}",
                     this.defaultMQPushConsumerImpl.getDefaultMQPushConsumer().getPullThresholdForQueue(), newVal);
            // 设置每个队列的拉取流控
            this.defaultMQPushConsumerImpl.getDefaultMQPushConsumer().setPullThresholdForQueue(newVal);
        }

        // Topic 维度拉取大小流控
        int pullThresholdSizeForTopic = this.defaultMQPushConsumerImpl.getDefaultMQPushConsumer().getPullThresholdSizeForTopic();
        if (pullThresholdSizeForTopic != -1) {
            int newVal = Math.max(1, pullThresholdSizeForTopic / currentQueueCount);
            log.info("The pullThresholdSizeForQueue is changed from {} to {}",
                     this.defaultMQPushConsumerImpl.getDefaultMQPushConsumer().getPullThresholdSizeForQueue(), newVal);
            this.defaultMQPushConsumerImpl.getDefaultMQPushConsumer().setPullThresholdSizeForQueue(newVal);
        }
    }

    // notify broker
    this.getmQClientFactory().sendHeartbeatToAllBrokerWithLock();
}
```



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
