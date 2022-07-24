---
title: RocketMQ 消息消费设计和原理详解 源码解析
author: Scarb
date: 9999-12-31
---

# RocketMQ 消息消费设计和原理详解 源码解析

[[toc]]

## 1. 背景

## 2. 概述

### 2.1 消费组概念与消费模式

和大多数消息队列一样，RocketMQ 支持两种消息模式：集群消费（Clustering）和广播消费（Broadcasting）。在了解它们之前，需要先引入消费组的概念。

#### 2.1.1 消费组

一个消费者实例即是一个消费者进程，负责消费消息。

消费组是一个逻辑概念，它包含了多个同一类的消费者实例，通常这些消费者都消费同一类消息（都消费相同的 Topic）且消费逻辑一致。

消费组的引入是用来在消费消息时更好地进行负载均衡和容错。

#### 2.1.2 广播消费模式

广播消费模式即全部的消息会广播分发到所有的消费者实例，每个消费者实例会收到全量的消息（即便消费组中有多个消费者都订阅同一 Topic）。

如下图所示，生产者发送了 5 条消息，每个消费组中的消费者都收到全部的 5 条消息。

广播模式使用较少，适合各个消费者都需要通知的场景，如刷新应用中的缓存。

![广播消费模式](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/07/1658682241264.png)

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

#### 2.1.3 集群消费模式

集群消费模式下，同一 Topic 下的一条消息只会被同一消费组中的一个消费者消费。集群消费模式下，消息被负载均衡到了同一个消费组的多个消费者实例上。

更具体一点，在同一消费组中的不同消费者会根据负载机制来平均地订阅 Topic 中的每个 Queue。（默认的 AVG 负载方式）

![广播消费模式](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/07/1658682241525.png)

RocketMQ 默认使用集群消费模式，这也是大部分场景下会使用到的消费模式。

---

不同模式下消费进度保存方式的不同：

1. 广播模式：广播模式由于每个消费者都需要消费消息，RocketMQ 使 用 `LocalfileOffsetStore`，把 Offset存到本地。
2. 集群模式：由于集群中的消费者只要一个消费消息即可，故消息的消费进度需要统一保存。RocketMQ 保存在 Broker，通过 `RemoteBrokerOffsetStore` 存储。

### 2.2 消息消费形式

#### 2.2.1 Pull

指消费者主动拉取消息进行消费，主动从 Broker 拉取消息，主动权由消费者应用控制。

#### 2.2.2 Push

指 Broker 主动将消息 Push 给消费者，Broker 收到消息就会主动推送到消费者端。该模式的消费实时性较高。

消费者组中的消费者实例会根据预设的负载均衡算法对 Topic 中的 Queue 进行均匀的订阅，每个 Queue 最多只能被一个消费者订阅。

在 RocketMQ 中，Push 消费实际也是由 Pull 消费（拉取）实现。Push 消费只是通过客户端 API 层面的封装让用户感觉像是 Broker 在推送消息给消费者。

#### 2.2.3 Pop

RocketMQ 5.0 引入的新消费形式。

Push 模式在一些情况下存在一定缺陷：

* 富客户端：客户端逻辑比较重，多语言支持不友好
* 队列独占：Topic 中的一个 Queue 最多只能被 1 个 Push 消费者消费，消费者数量无法无限扩展

### 2.3 消费端高可靠

#### 2.3.1 重试-死信机制

在实际使用中，消息的消费可能出现失败。RocketMQ 拥有重试机制和死信机制来保证消息消费的可靠性。

1. 正常消费：消费成功则提交消费位点
2. 重试机制：如果正常消费失败，消息会被放入重试 Topic `%RETRY%消费者组`，最多重试消费 16 次，重试的时间间隔逐渐变长。（消费者组会自动订阅重试 Topic）
3. 死信机制：如果正常消费和重试 16 次均失败，消息会保存到死信 Topic `%DLQ%消费者组` 中，此时需人工介入处理

#### 2.3.2 队列负载机制与重平衡



### 2.4 并发消费与顺序消费

### 2.5 消费进度处理和反馈机制

### 2.6 消息消费概要流程



## 3. 详细设计

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/07/1658682241560.png)

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



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
