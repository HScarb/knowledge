# RocketMQ 延迟消息（定时消息）4.9.3 版本优化

# 1. 概述

在 RocketMQ 4.9.3 版本中，[@Git-Yang](https://github.com/Git-Yang) 对延迟消息做了很大的优化，大幅度提升了延迟消息的性能。

其中，[PR#3287](https://github.com/apache/rocketmq/pull/3287) 将原先用来启动周期性任务的 `Timer` 改为使用 `ScheduledExecutorService`，将多延迟等级下同时发送延迟消息的性能提升了 3+ 倍。

本文主要讲解的是另一个改动 [PR#3458](https://github.com/apache/rocketmq/pull/3458)：支持延迟消息的异步投递。老版本中，延迟消息到期投递到 CommitLog 的动作是同步的，在 Dledger 模式下性能很差。新的改动将延迟消息的到期投递模式改为可配置，使用 BrokerConfig 的 `enableScheduleAsyncDeliver` 属性进行配置。改成异步投递后，在 Dledger 下的性能提升了 3 倍左右。

老版本的延迟消息逻辑和源码解析可以看这篇文章：[](https://github.com/HScarb/knowledge/blob/master/rocketmq/RocketMQ%20%E5%BB%B6%E8%BF%9F%E6%B6%88%E6%81%AF%EF%BC%88%E5%AE%9A%E6%97%B6%E6%B6%88%E6%81%AF%EF%BC%89.md)

# 2. 改动解析

## 2.1 将多延迟等级延迟消息扫描和投递的任务从单线程执行改为多线程

先看一下改动后的性能变化，图片出处：https://github.com/apache/rocketmq/issues/3286

* 改动前，同时向 4 个延迟等级发送延迟消息，TPS: 657
  ​    ![改动前，同时向 4 个延迟等级发送延迟消息](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203152329113.png)

* 改动后，同时向4个延迟等级发送延迟消息，TPS: 2453

  ![改动后，同时向4个延迟等级发送延迟消息](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203152330256.png)

---

这个改动将延迟消息的任务调度器从 `Timer` 改为 `ScheduledExecutorService`。

在老版本中，所有 18 个延迟等级的定时消息扫描和投递任务都是由一个 `Timer` 启动定时任务执行的。`Timer` 中所有定时任务都是由**一个工作线程单线程处理**的，如果某个任务处理慢了，后续有新的任务进来，会导致新的任务需要等待前一个任务执行结束。

改为 `ScheduledExecutorService` 线程池之后多线程处理任务，可以大幅度提高延迟消息处理速度，并且避免多延迟等级消息同时发送时造成的阻塞。


## 2.2 支持延迟消息异步投递，提升 Dledger 模式下的投递性能

# 3. 异步投递详解

# 4. 源码解析

