# RabbitMQ Federation 插件使用

[TOC]

## 概述

RabbitMQ Federation 插件可以将消息从一个 Exchange 复制到另一个 Exchange，或从一个 Queue 分发到另一个 Queue。

复制的源端被称为 upstream，复制的目的端被称为 downstream。要使用 Federation 插件，需要在两个集群都开启 Federation 插件，并且在 downstream 集群创建 Federation，配置 upstream。

### 使用场景

* 将多个集群的消息收集到一个集群
* 将一个队列的压力分散到多个集群
* 在不下线的情况下将数据从一个集群同步到另一个集群
* 减少消息消费的时延

### Federation 种类

可以创建两种类型的 Federation，分别是 Exchange Federation 和 Queue Federation。

#### Exchange Federation

简单说，它可以实现消息在 Exchange 间的复制（同步）。

使用 Exchange Federation 可以将消息发到其他集群。效果是，当消息发送到被联邦的 Exchange 时，消息会被发送到本地的 Exchange 和 下游的集群。这样，你就可以在不同的集群多次消费消息。

#### Queue Federation

Queue Federation 的效果是消息的负载均衡，它只会将消息发往有空闲消费者的下游集群。也就是说，消息不会被复制。

常被用于分散压力和集群消息转移。

## 使用前提

* 两个 RabbitMQ 服务器或集群
* 在两个 RabbitMQ 上开启 Federation 插件
* （可选）为 Federation 的组件单独创建用户
* 上下游 RabbitMQ 网络可以通过 AMQP 协议连接

## Federation Exchange 使用

1. 满足使用前提
2. 在下游节点配置 Federation 的 upstream
3. 在下游节点配置 Policy，指定要被 Federate 的 Exchange 或 Queue

### upstream 上游集群配置

1. 创建 Exchange

![1. 创建 Exchange](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203111245154.png)

2. 创建 Queue

![2. 创建 Queue](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203111250015.png)

3. 绑定 Exchange 和 Queue

![3. 绑定 Exchange 和 Queue](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203111250347.png)

### downstream 下游集群配置

1. 配置 upstream

![1. 配置 upstream](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203111251414.png)

2. 创建 Federation policy

![2. 创建 Federation 的 policy](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203111251457.png)

3. 检查 Federation 状态

![3. 检查 Federation 状态](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203111251640.png)

### 测试

* 在上游集群向 Exchange 发送消息

![在上游集群向 Exchange 发送消息](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203111251635.png)

* 在上下游集群的队列都可以收到消息

![在上下游集群的队列都可以收到消息](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203111252460.png)

## 参考资料

* [Federation Plugin](https://www.rabbitmq.com/federation.html)
* [FAQ: What is the RabbitMQ Federation plugin](https://www.cloudamqp.com/blog/faq-what-is-the-rabbitmq-federation-plugin.html)
* [Setup RabbitMQ Exchange Federation](https://jee-appy.blogspot.com/2018/08/setup-rabbitmq-exchange-federation.html)