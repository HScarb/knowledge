---
title: Rocketmq 5.0 任意时间定时消息（RIP-43） 原理详解 & 源码解析
author: Scarb
date: 9999-12-31
---

原文地址：[http://hscarb.github.io/rocketmq/99991231-rocketmq-timer.html](http://hscarb.github.io/rocketmq/99991231-rocketmq-timer.html)

# Rocketmq 5.0 任意时间定时消息（RIP-43） 原理详解 & 源码解析

## 1. 背景

### 1.1 概念和应用场景

延迟消息（定时消息）即消息到达消息队列服务端后不会马上投递，而是到达某个时间才投递给消费者。它在在当前的互联网环境中有非常大的需求。

例如电商/网约车等业务中都会出现的订单场景，客户下单后并不会马上付款，但是这个订单也不可能一直开着，因为订单会占用商品/网约车资源。这时候就需要一个机制，在比如 5 分钟后进行一次回调，回调关闭订单的方法。 这个回调的触发可以用分布式定时任务来处理，，但是更好的方法可以是使用消息队列发送一个延迟消息，因为一条消息会比一个分布式定时任务轻量得多。 开启一个消费者消费订单取消 Topic 的消息，收到消息后关闭订单，简单高效。

当用户支付了订单，那么这个订单不再需要被取消，刚才发的延迟消息也不再需要被投递。当然，你可以在消费消息时判断一下订单的状态以确定是否需要关闭，但是这样做会有一次额外的数据库操作。如果可以取消定时消息，那么只要发送一条定时消息取消的命令就可以取消之前发送的定时消息投递。

除此之外，定时消息还能用于更多其他场景，如定时任务触发、等待重试、事件预订等等。

### 1.2 延迟消息与定时消息

首先需要明确延迟消息与定时消息虽然意思不同，但在体现的效果上确实相同的，都是在消息生产到 Broker 之一段时间之后才会被投递（消费者可以消费到）。只不过在使用的 API 上，延迟消息指定延迟的时间，而定时消息指定确切的投递时间。实际上它们可以实现相同的效果。

在 Rocketmq 4.x 中只支持通过设定延迟等级来支持 18 个固定延迟时间。具体的原理可以看 [RocketMQ 延迟消息（定时消息）源码解析](https://github.com/HScarb/knowledge/blob/master/rocketmq/20220313-rocketmq-scheduled-message.md)。

4.x 的延迟消息有很大的局限性，它无法支持任意时间的定时，而且最大的定时时间也只有 2 小时，它的性能也达不到普通消息（后来 4.x 的延迟消息性能被优化，详见 [RocketMQ 延迟消息（定时消息）4.9.3 版本优化 异步投递支持](https://github.com/HScarb/knowledge/blob/master/rocketmq/20220320-rocketmq-scheduled-message-4.9.3-improve.md)。

许多公司不满足于它的能力，自研了任意时间定时消息，扩展了最大定时时长。

在 Rocketmq 5.x 中终于开源了支持任意时间的定时消息（以下简称定时消息）。它与 4.x 的延迟消息是两套实现机制，互相之间几乎不影响。

### 1.2 任意时间定时消息的使用

在 Rocketmq 5.x 的客户端中，在构造消息时提供了 3 个 API 来指定延迟时间或定时时间。

```java
Message message = new Message(TOPIC, ("Hello scheduled message " + i).getBytes(StandardCharsets.UTF_8));
// 延迟 10s 后投递
message.setDelayTimeSec(10);
// 延迟 10000ms 后投递
message.setDelayTimeMs(10_000L);
// 定时投递，定时时间为当前时间 + 10000ms
message.setDeliverTimeMs(System.currentTimeMillis() + 10_000L);
// 发送消息
SendResult result = producer.send(message);
```

## 2. 概述

### 2.1 任意时间定时消息的难点

任意时间定时消息的实现存在一定的难点，所以 4.x 才会实现 18 个延迟等级的定时消息，作为一个折衷的方案。

任意时间定时消息的主要难点有以下几个。

#### 2.1.1 难点1：任意的定时时间

Rocketmq 4.x 的延迟消息的原理简单来说是：将延迟消息先不存到真正的 Topic，先存到一个延迟 Topic，然后周期性扫描这个 Topic 还未投递的消息是否到期，到期则投递到真正的 Topic 中。

这个方案的局限性在于扫描的每个队列的消息延迟时间必须是相同的。否则会出现先扫描的消息要后投递的情况，如下图所示：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2023/07/1689609879534.png)

队列中的第一个消息延迟 100s，从队列头开始扫描，需要等待第一个消息先投递，从队列中弹出，后面的消息才能投递。所以第一条消息会阻塞后续消息的投递。

所以 Rocketmq 4.x 的延迟 Topic 中包含 18 个队列，每个队列代表一个延迟等级，对应一个固定的延迟时长，用一个周期性任务去扫描。这样就避免了这个问题。

但任意时间定时消息不可能无限制地增加延迟时长对应的队列数量，这是一个难点。

#### 2.1.2 难点2：定时消息的存储和老化

我们知道 Rocketmq 的消息是有老化时间的，默认时间为 3 天。这就意味着延迟时间超过 3 天的消息可能会被老化清除，永远无法投递。

让定时消息不受老化时间的限制，这也是一个难点。

#### 2.1.3 难点3：大量定时消息的极端情况

在定时消息场景下有一种极端情况，就是在同一时刻定时了超大量的消息，需要在一瞬间投递（比如在 8 点定时了 1 亿条消息）。

如果不进行流控直接写入，会把 Rocketmq 冲垮。

### 2.2 设计思路

#### 2.2.1 任意时间定时

实现任意时间的定时的要点在于知道在某一时刻需要投递哪些消息，以及破除一个队列只能保存同一个延迟等级的消息的限制。

联想 Rocketmq 的索引文件 `IndexFile`，可以通过索引文件来辅助定时消息的查询。需要建立这样的一个索引结构：Key 是时间戳，Value 表示这个时间要投递的所有定时消息。

```java
Map<Long /* 投递时间戳 */, List<Message /* 被定时的消息 */>>
```

把这个索引结构以文件的形式实现，这个结构里的 Message 可以仅保存消息的存储位置，投递的时候再查出来。

#### 2.2.2 

## 3. 

## 参考资料

* [PR: [RIP-43] Support Timing Messages with Arbitrary Time Delay](https://github.com/apache/rocketmq/pull/4642/files)
* [RIP-43 Support timing messages with arbitrary time delay](https://shimo.im/docs/gXqme9PKKpIeD7qo/read)
* [社区在讨论什么？《Support Timing Messages with Arbitrary Time Delay》](https://mp.weixin.qq.com/s/iZL8M88gF7s5NmW7DYyYDQ)


---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
