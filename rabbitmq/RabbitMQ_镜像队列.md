# RabbitMQ 镜像队列 使用和原理详解

# 1. 背景

单节点的 RabbitMQ 存在性能上限，可以通过垂直或者水平扩容的方式增加 RabbitMQ 的吞吐量。垂直扩容指的是提高 CPU 和内存的规格；水平扩容指部署 RabbitMQ 集群。

通过将单个节点的队列相对平均地分配到集群的不同节点，单节点的压力被分散，RabbitMQ 可以充分利用多个节点的计算和存储资源，以提升消息的吞吐量。

但是多节点的集群并不意味着有更好的可靠性——每个队列仍只存在于一个节点，当这个节点故障，这个节点上的所有队列都不再可用。

在 3.8 以前的版本，RabbitMQ 通过镜像队列（Classic Queue Mirroring）来提供高可用性。但镜像队列存在很大的局限性，在 3.8 之后的版本 RabbitMQ 推出了 Quorum queues 来替代镜像队列，在之后的版本中镜像队列将被移除。

镜像队列通过将一个队列镜像（消息广播）到其他节点的方式来提升消息的高可用性。当主节点宕机，从节点会提升为主节点继续向外提供服务。

本文将讲解镜像队列的使用方法和原理。

# 2. 镜像队列概述

RabbitMQ 以队列维度提供高可用的解决方案——镜像队列。

配置镜像队列规则后，新创建的队列按照规则成为镜像队列。每个镜像队列都包含一个主节点（Leader）和若干个从节点（Follower），其中只有主节点向外提供服务（生产消息和消费消息），从节点仅仅接收主节点发送的消息。

从节点会准确地按照主节点执行命令的顺序执行动作，所以从节点的状态与主节点应是一致的。

# 3. 使用方法和注意事项

## 3.1 使用方法

### 3.1.1 管理界面配置

使用策略（Policy）来配置镜像策略，策略使用正则表达式来配置需要应用镜像策略的队列名称，以及在参数中配置镜像队列的具体参数。

按此步骤创建镜像策略

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204082013492.png)

参数解释：

- Name: policy的名称，用户自定义。
- Pattern: queue的匹配模式（正则表达式）。`^`表示所有队列都是镜像队列。
- Definition: 镜像定义，包括三个部分ha-sync-mode、ha-mode、ha-params。
  - ha-mode: 指明镜像队列的模式，有效取值范围为all/exactly/nodes。
    - all：表示在集群所有的代理上进行镜像。
    - exactly：表示在指定个数的代理上进行镜像，代理的个数由ha-params指定。
    - nodes：表示在指定的代理上进行镜像，代理名称通过ha-params指定。
  - ha-params: ha-mode模式需要用到的参数。
  - ha-sync-mode: 表示镜像队列中消息的同步方式，有效取值范围为：automatic，manually。
    - automatic：表示自动向master同步数据。
    - manually：表示手动向master同步数据。

- Priority: 可选参数， policy的优先级。

### 3.1.2 命令行

rabbitmqctl [**set_policy**](https://www.rabbitmq.com/rabbitmqctl.8.html#set_policy) [**-p** vhost] [**--priority** priority] [**--apply-to** apply-to] name pattern definition

例如，对队列名称以“queue_”开头的所有队列进行镜像，并在集群的两个节点上完成进行，policy的设置命令为：

```shell
rabbitmqctl set_policy --priority 0 --apply-to queues mirror_queue "^queue_" '{"ha-mode":"exactly","ha-params":3,"ha-sync-mode":"automatic"}'
```

### 3.1.3 HTTP API

https://www.rabbitmq.com/ha.html#examples

```json
PUT /api/policies/%2f/ha-two
{
  "pattern":"^queue_",
  "definition": {
    "ha-mode":"exactly",
    "ha-params":3,
    "ha-sync-mode":"automatic"
  }
}
```

## 3.2 配置参数

镜像队列有许多配置参数，表达了镜像队列的镜像策略和异常后的晋升策略。

下面来详细解释一下这些配置参数的意义

### 3.2.1 镜像策略

| ha-mode | ha-params | 结果                                                         |
| ------- | --------- | ------------------------------------------------------------ |
| exactly | count     | 集群中队列副本的数量（主队列加上镜像）。count值为1表示一个副本：只有主节点。如果主节点不可用，则其行为取决于队列是否持久化。count值为2表示两个副本：一个队列主队列和一个队列镜像。换句话说:“镜像数=节点数-1”。如果运行队列主服务器的节点变得不可用，队列镜像将根据配置的镜像提升策略自动提升到主服务器。如果集群中的可用节点数少于count，则将队列镜像到所有节点。如果集群中有多个计数节点，并且一个包含镜像的节点宕机，那么将在另一个节点上创建一个新镜像。使用' exactly '模式和' ha-promot-on-shutdown ': ' always '可能是危险的，因为队列可以跨集群迁移，并在停机时变得不同步。 |
| all     | 不设置    | 队列跨集群中的所有节点镜像。当一个新节点被添加到集群中时，队列将被镜像到该节点。这个设置非常保守。建议设置的副本值为大多数节点`N / 2 + 1`。镜像到所有节点会给所有集群节点带来额外的负担，包括网络I/O、磁盘I/O和磁盘空间的使用。 |
| nodes   | 节点名称  | 队列被镜像到节点名中列出的节点。节点名是在rabbitmqctl cluster_status中出现的Erlang节点名；它们的形式通常是“rabbit@hostname”。如果这些节点名中有任何一个不是集群的一部分，则不构成错误。如果在声明队列时列表中的节点都不在线，则将在声明客户机连接的节点上创建队列。 |

### 3.2.2 新镜像同步策略

| ha-sync-mode | 说明                                                         |
| ------------ | ------------------------------------------------------------ |
| manual       | 这是默认模式。新队列镜像将不接收现有消息，它只接收新消息。一旦使用者耗尽了仅存在于主服务器上的消息，新的队列镜像将随着时间的推移成为主服务器的精确副本。如果主队列在所有未同步的消息耗尽之前失败，则这些消息将丢失。您可以手动完全同步队列，详情请参阅未同步的镜像部分。 |
| automatic    | 当新镜像加入时，队列将自动同步。值得重申的是，队列同步是一个阻塞操作。如果队列很小，或者您在RabbitMQ节点和ha-sync-batch-size之间有一个快速的网络，那么这是一个很好的选择。 |

### 3.2.3 从节点晋升策略

镜像队列主节点出现故障时，最老的从节点会被提升为新的主节点。如果新提升为主节点的这个副本与原有的主节点并未完成数据的同步，那么就会出现数据的丢失，而实际应用中，出现数据丢失可能会导致出现严重后果。

rabbitmq 提供了 `ha-promote-on-shutdown`，`ha-promote-on-failure` 两个参数让用户决策是保证队列的可用性，还是保证队列的一致性；两个参数分别控制正常关闭、异常故障情况下从节点是否提升为主节点，其可设置的值为 `when-synced` 和 `always`。

| ha-promote-on-shutdown/ha-promote-on-failure | 说明                                           |
| -------------------------------------------- | ---------------------------------------------- |
| when-synced                                  | 从节点与主节点完成数据同步，才会被提升为主节点 |
| always                                       | 无论什么情况下从节点都将被提升为主节点         |

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204082027040.png)

> 这里要注意的是ha-promote-on-failure设置为always，插拔网线模拟网络异常的两个测试场景：当网络恢复后，其中一个会重新变为mirror，具体是哪个变为mirror，受cluster_partition_handling处理策略的影响。

> 例如两台节点A，B组成集群，并且cluster_partition_handling设置为autoheal，队列的master位于节点A上，具有全量数据，mirror位于节点B上，并且还未完成消息的同步，此时出现网络异常，网络异常后两个节点交互决策：如果节点A节点成为赢家，此时B节点内部会重启，这样数据全部保留不会丢失；相反如果B节点成为赢家，A需要重启，那么由于ha-prromote-on-failure设置为always，B节点上的mirror提升为master，这样就出现了数据丢失。

## 3.3 注意事项

# 4. 镜像队列原理

# 5. 源码分析

# 参考资料

* [RabbitMQ Doc - Classic Queue Mirroring](https://www.rabbitmq.com/ha.html)
* [RabbitMQ——镜像队列的数据流](https://my.oschina.net/hncscwc/blog/4672769)
* [rabbitmq——镜像队列](https://my.oschina.net/hncscwc/blog/186350)
* [RabbitMQ——镜像队列Master故障后的处理](https://my.oschina.net/hncscwc/blog/4745863)