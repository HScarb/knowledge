# RocketMQ 消息消费（1）设计和原理详解

[TOC]

## 1. 背景

## 2. 概述

### 2.1 消费组概念与消费模式

和大多数消息队列一样，RocketMQ 支持两种消息模式：集群消费（Clustering）和广播消费（Broadcasting）。在了解它们之前，需要先引入消费组的概念。

#### 2.1.1 消费组

一个消费者实例即是一个消费者进程，负责消费消息。单个消费者速度有限，在实际使用中通常会采用多个消费者共同消费同样的 Topic 以加快消费速度。这多个消费同样 Topic 的消费者组成了消费者组。

消费组是一个逻辑概念，它包含了多个同一类的消费者实例，通常这些消费者都消费同一类消息（都消费相同的 Topic）且消费逻辑一致。

消费组的引入是用来在消费消息时更好地进行负载均衡和容错。

#### 2.1.2 广播消费模式（BROADCASTING）

广播消费模式即全部的消息会广播分发到所有的消费者实例，每个消费者实例会收到全量的消息（即便消费组中有多个消费者都订阅同一 Topic）。

如下图所示，生产者发送了 5 条消息，每个消费组中的消费者都收到全部的 5 条消息。

广播模式使用较少，适合各个消费者都需要通知的场景，如刷新应用中的缓存。

![广播消费模式](../assets/rocketmq-consume-message/rocketmq-consume-mode-broadcasting.drawio.png)

> 注意事项：
>
> 1. 广播消费模式下不支持 **顺序消息**。
> 2. 广播消费模式下不支持 **重置消费位点**。
> 3. 每条消息都需要**被相同订阅逻辑的多台机器处理**。
> 4. **消费进度在客户端维护**，出现重复消费的概率稍大于集群模式。如果消费进度文件丢失，存在消息丢失的可能。
> 5. 广播模式下，消息队列 RocketMQ 版保证每条消息至少被每台客户端消费一次，但是并**不会重投消费失败的消息**，因此业务方需要关注消费失败的情况。
> 6. 广播模式下，**客户端每一次重启都会从最新消息消费**。客户端在被停止期间发送至服务端的消息将会被自动跳过，请谨慎选择。
> 7. 广播模式下，每条消息都会被大量的客户端重复处理，因此推荐尽可能使用集群模式。
> 8. 广播模式下服务端不维护消费进度，所以消息队列 RocketMQ 版控制台不支持消息堆积查询、消息堆积报警和订阅关系查询功能。

#### 2.1.3 集群消费模式（CLUSTERING）

集群消费模式下，**同一 Topic 下的一条消息只会被同一消费组中的一个消费者消费**。也就是说，消息被负载均衡到了同一个消费组的多个消费者实例上。

更具体一点，在同一消费组中的不同消费者会根据负载机制来平均地订阅 Topic 中的每个 Queue。（默认 AVG 负载方式）

![广播消费模式](../assets/rocketmq-consume-message/rocketmq-consume-mode-clustering.drawio.png)

RocketMQ 默认使用集群消费模式，这也是大部分场景下会使用到的消费模式。

### 2.2 消息消费形式

#### 2.2.1 Pull

指消费者**主动拉取消息**进行消费，主动从 Broker 拉取消息，主动权由消费者应用控制。

#### 2.2.2 Push

指 **Broker 主动将消息 Push 给消费者**，Broker 收到消息就会主动推送到消费者端。该模式的消费实时性较高，也是主流场景中普遍采用的消费形式。

消费者组中的消费者实例会根据预设的负载均衡算法对 Topic 中的 Queue 进行均匀的订阅，每个 Queue 最多只能被一个消费者订阅。

在 RocketMQ 中，Push 消费其实也是由 Pull 消费（拉取）实现。Push 消费只是通过客户端 API 层面的封装让用户感觉像是 Broker 在推送消息给消费者。

#### 2.2.3 Pop

RocketMQ 5.0 引入的新消费形式。

Push 模式在一些情况下存在一定缺陷：

* 富客户端：客户端逻辑比较重，多语言支持不友好
* 队列独占：Topic 中的一个 Queue 最多只能被 1 个 Push 消费者消费，消费者数量无法无限扩展
* 消费后更新 offset：本地消费成功才会提交 offset

会导致消费者 hang 住时分配的队列消息堆积。

### 2.3 队列负载机制与重平衡

在集群消费模式下，消费组中的消费者共同消费订阅的 Topic 中的所有消息，这里就存在 Topic 中的队列如何分配给消费者的问题。

#### 2.3.1 队列负载机制

RocketMQ Broker 中的队列负载机制将一个 Topic 的不同队列按照算法尽可能平均地分配给消费者组中的所有消费者。RocketMQ 预设了多种负载算法供不同场景下的消费。

AVG：将队列按数量平均分配给多个消费者，按 Broker 顺序先分配第一个 Broker 的所有队列给第一个消费者，然后给第二个。

AVG_BY_CIRCLE：将 Broker 上的队列轮流分给不同消费者，更适用于 Topic 在不同 Broker 之间分布不均匀的情况。

默认采用 AVG 负载方式。

#### 2.3.2 重平衡（Rebalance）

为消费者分配队列消费的这一个负载过程并不是一劳永逸的，比如当消费者数量变化、Broker 掉线等情况发生后，原先的负载就变得不再均衡，此时就需要重新进行负载均衡，这一过程被称为重平衡机制。

每隔 20s，RocketMQ 会进行一次检查，检查队列数量、消费者数量是否发生变化，如果变化则触发消费队列重平衡，重新执行上述负载算法。

### 2.4 消费端高可靠

#### 2.4.1 重试-死信机制

在实际使用中，消息的消费可能出现失败。RocketMQ 拥有重试机制和死信机制来保证消息消费的可靠性。

1. 正常消费：消费成功则提交消费位点
2. 重试机制：如果正常消费失败，消息会被放入重试 Topic `%RETRY%消费者组`，最多重试消费 16 次，重试的时间间隔逐渐变长。（消费者组会自动订阅重试 Topic）
3. 死信机制：如果正常消费和重试 16 次均失败，消息会保存到死信 Topic `%DLQ%消费者组` 中，此时需人工介入处理

#### 2.4.2 队列负载机制与重平衡

当发生 Broker 挂掉或者消费者挂掉时，会引发重平衡，可以自动感知有组件挂掉的情况并重新调整消费者的订阅关系。

### 2.5 并发消费与顺序消费

在消费者客户端消费时，有两种订阅消息的方式，分别是并发消费和顺序消费。广播模式不支持顺序消费，仅有集群模式能使用顺序消费。

需要注意的是，这里所说的顺序消费指的是队列维度的顺序，即在消费一个队列时，消费消息的顺序和消息发送的顺序一致。如果一个 Topic 有多个队列， 是不可能达成 Topic 级别的顺序消费的，因为无法控制哪个队列的消息被先消费。Topic 只有一个队列的情况下能够实现 Topic 级别的顺序消费。

具体顺序生产和消费代码见 [官方文档](https://github.com/apache/rocketmq/blob/master/docs/cn/RocketMQ_Example.md#2-%E9%A1%BA%E5%BA%8F%E6%B6%88%E6%81%AF%E6%A0%B7%E4%BE%8B)。

顺序生产的方式为串行生产，并在生产时指定队列。

并发消费的方式是调用消费者的指定 `MessageListenerConcurrently` 作为消费的回调类，顺序消费则使用 `MessageListenerOrderly` 类进行回调。处理这两种消费方式的消费服务也不同，分别是 `ConsumeMessageConcurrentlyService` 和 `ConsumeMessageOrderlyService`。

顺序消费的大致原理是依靠两把锁，一把在 Broker 端，锁定队列和消费者的关系，保证同一时间只有一个消费者在消费；在消费者端也有一把锁以保证消费请求的顺序化。

### 2.6 消费进度保存和提交

消费者消费一批消息完成之后，需要保存消费进度。如果是集群消费模式，还需要将消费进度让其他消费者知道，所以需要提交消费进度。这样在消费者重启或队列重平衡时可以根据消费进度继续消费。

不同模式下消费进度保存方式的不同：

1. 广播模式：保存在**消费者本地**。因为每个消费者都需要消费全量消息消息。在 `LocalfileOffsetStore` 当中。
2. 集群模式：保存在 **Broker，同时消费者端缓存**。因为一个 Topic 的消息只要被消费者组中的一个消费者消费即可，所以消息的消费进度需要统一保存。通过 `RemoteBrokerOffsetStore` 存储。

集群模式下，消费者端有定时任务，定时将内存中的消费进度提交到 Broker，Broker 也有定时任务将内存中的消费偏移量持久化到磁盘。此外，消费者向 Broker 拉取消息时也会提交消费偏移量。注意，消费者线程池提交的偏移量是线程池消费的这一批消息中偏移量最小的消息的偏移量。

1. 消费完一批消息后将消息消费进度存在本地内存
2. 消费者中有一个定时线程，每 5s 将内存中所有队列的消费偏移量提交到 Broker
3. Broker 收到消费进度先缓存到内存，有一个定时任务每隔 5s 将消息偏移量持久化到磁盘
4. 消费者向 Broker 拉取消息时也会将队列的消息偏移量提交到 Broker

### 2.7 消息消费概要流程



## 3. 详细设计

![](../assets/rocketmq-consume-message/rocketmq-consume-process-aliyun.png)

### 3.1 消费者类结构

### 3.2 消费者启动



## 4. 源码解析



## 参考资料

* [官方文档——设计](https://github.com/apache/rocketmq/blob/master/docs/cn/design.md#42-consumer%E7%9A%84%E8%B4%9F%E8%BD%BD%E5%9D%87%E8%A1%A1)
* [RocketMQ 实战与进阶——丁威](http://learn.lianglianglee.com/%E4%B8%93%E6%A0%8F/RocketMQ%20%E5%AE%9E%E6%88%98%E4%B8%8E%E8%BF%9B%E9%98%B6%EF%BC%88%E5%AE%8C%EF%BC%89/08%20%E6%B6%88%E6%81%AF%E6%B6%88%E8%B4%B9%20API%20%E4%B8%8E%E7%89%88%E6%9C%AC%E5%8F%98%E8%BF%81%E8%AF%B4%E6%98%8E.md)
* [RocketMQ消费消息——白云鹏](https://www.baiyp.ren/RocketMQ%E6%B6%88%E8%B4%B9%E6%B6%88%E6%81%AF.html)
* [消息中间件—RocketMQ消息消费（一）——癫狂侠](https://www.jianshu.com/p/f071d5069059)
* [RocketMQ 消息接受流程——赵坤](https://kunzhao.org/docs/rocketmq/rocketmq-message-receive-flow/)
* [RocketMQ 消息消费——贝贝猫](https://zhuanlan.zhihu.com/p/360911990)
* [RocketMQ 5.0 POP 消费模式探秘](https://developer.aliyun.com/article/801815)
* [RocketMQ消息消费源码分析](https://www.jianshu.com/p/4757079f871f)
* [Rocketmq消费消息原理——服务端技术栈](https://blog.csdn.net/daimingbao/article/details/120231289)
* [RocketMQ——4. Consumer 消费消息——Kong](http://47.100.139.123/blog/article/89)
