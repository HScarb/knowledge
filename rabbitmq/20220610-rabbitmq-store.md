# RabbitMQ 存储机制

## 1. 背景

RabbitMQ 的存储设计与 Kafka、RocketMQ 等消息队列有较大的不同。RabbitMQ 在设计上更倾向于消息被及时消费，或者是存储在内存中以达到更高的生产和消费效率，而不是直接存储在磁盘中。

当然，RabbitMQ 也支持通过配置**队列**和**消息**都**持久化**的方式，让消息必须保存在磁盘中，这样消息才会在重启之后仍然存在。但是，即使是保存到磁盘的消息，在内存中也会保留一份备份，以便将消息更快地发给消费者。这样就带来了较大且不稳定的内存消耗。如果希望消息直接被保存到磁盘中，可以设置队列为种**惰性队列**。

RabbitMQ 的消息以队列维度存储，会随着系统的负载而在几种不同的存储状态中不断地流动。大致会经过从内存到磁盘再到内存的流程。

本文将介绍 RabbitMQ 消息的存储机制。

## 2. 概述

### 2.1 持久化

持久化指的是数据保存在磁盘中，以防止异常关机、重启等情况下的数据丢失。
与存储相关的持久化包括队列的持久化和消息的持久化。

#### 2.1.1 队列持久化

通过将队列的 durable 属性设置为 true 的方式可以将队列设置为持久化。

队列持久化仅仅指的是队列元数据持久化，即重启之后该队列还会存在，但**队列中的消息会消失**。

如果队列为非持久化，则重启之后队列也会消失。

#### 2.1.2 消息的持久化

通过发送时设置消息的 `BasicProperties#deliveryMode` 的方式可以将消息设置为持久化的。

只有将消息和队列都设置为持久化之后，消息才会在重启之后仍然存在。

### 2.2 存储机制

#### 2.2.1 存储结构

RabbitMQ 的存储可以被分为两个部分：队列索引和消息存储。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202206101450602.png)

* 队列索引（rabbit_queue_index）：每个队列单独存储。负责维护队列中落盘消息的信息，包括消息的存储地点、是否已被交付给消费者、是否已被消费者 ack 等。
* 消息存储（rabbit_msg_store）：每个 Broker 只有一个，所有队列共同使用。以键值对的形式存储消息。RabbitMQ 将持久化和非持久化的消息在磁盘中区分存储。
  * 非持久化消息存储（msg_store_transient）：重启后清空
  * 持久化消息存储（msg_store_persistent）：重启后不会清空

在消费消息时，会先查询队列索引，查询到消息在存储中的位置，然后再从消息存储中查询具体的消息。这样就会经历 2 次查询。为了优化消费性能，RabbitMQ 会将较小的消息体直接全量保存到队列索引，而不保存到消息存储中。较大的消息会保存在消息存储中，在队列索引中建立消息索引。这样在消费较小的消息时只需要查询 1 次。

可以通过配置 `queue_index_embed_msgs_below` 的方式来指定消息整体大小小于某个值时会只保存到队列索引中。该值默认为 `4096`（byte）。

#### 2.2.2 合并机制

消息被消费后会被删除。删除消息时并不会直接删除消息所在的文件，而是先标记该消息为垃圾数据。当一个文件中都是垃圾数据是可以将这个文件删除。当检测到前后两个文件中的有效数据可以合并成一个文件，并且（垃圾数据大小/所有文件数据大小）的值超过 `garbage_fraction`（默认 0.5）时会触发垃圾回收，将这两个文件合并。这两个文件一定是逻辑上相邻的两个文件。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202206101514907.png)

### 2.3 队列结构

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202206101535209.png)

- 在RabbitMQ中，队列 主要由两部分组成
  - `AMQPQueue`：实现AMQP协议的逻辑功能，包括接收消息，投递消息，Confirm消息等；
  - `BackingQueue`：提供AMQQueue调用的接口，完成消息的存储和持久化工作

## RabbitMQ中队列的存储状态

BackingQueue由Q1,Q2,Delta,Q3,Q4五个子队列构成，在BackingQueue中，消息的生命周期有4个状态：

| queue | state\store | message itself | message index(message position) |
| :---- | :---------- | :------------- | :------------------------------ |
| q1,q4 | alpha       | RAM            | RAM                             |
| q2,q3 | beta        | DISK           | RAM                             |
| q2,q3 | gamma       | DISK           | RAM&DISK                        |
| delta | delta       | DISK           | DISK                            |

- `alpha`: 消息的内容和消息索引都在RAM中。（Q1，Q4）
- `beta`: 消息的内容保存在Disk上，消息索引保存在RAM中。（Q2，Q3）
- `gamma`: 消息的内容保存在Disk上，消息索引在DISK和RAM上都有。（Q2，Q3）
- `delta`: 消息内容和索引都在Disk上。(Delta）

> 5个内部队列
>
> - q1和q4队列中只有alpha状态的消息；
> - q2和q3包含beta和gamma状态的消息；
> - delta队列是消息按序存盘后的一种逻辑队列，只有delta状态的消息。所以delta队列并不在内存中，其他4个队列则是由erlang queue模块实现。

这里以持久化消息为例（可以看到非持久化消息的生命周期会简单很多），从Q1到Q4，消息实际经历了一个`RAM->DISK->RAM`这样的过程，
BackingQueue的设计有点类似于Linux的虚拟内存`Swap`区，

- 当队列`负载很高`时，通过将部分消息放到磁盘上来`·`节省内存空间`，
- 当`负载降低`时，消息又从磁盘回到内存中，让整个队列有很好的`弹性`。
  因此触发消息流动的主要因素是：

1. `消息被消费`；
2. `内存不足`。

- RabbitMQ会根据`消息的传输速度`来计算当前`内存中允许保存的最大消息数量`（Traget_RAM_Count），

- 当`内存中保存的消息数量 + 等待ACK的消息数量 > Target_RAM_Count`时，RabbitMQ才会把消息`写到磁盘`上，

- 所以说虽然理论上消息会按照`Q1->Q2->Delta->Q3->Q4`的顺序流动，但是并不是每条消息都会经历所有的子队列以及对应的生命周期。

- 从RabbitMQ的Backing Queue结构来看，当`内存不足`时，消息要经历多个生命周期，在Disk和RAM之间置换，这实际会`降低RabbitMQ的处理性能`（后续的流控就是关联的解决方法）。

- 对于持久化消息，RabbitMQ先将消息的内容和索引保存在磁盘中，然后才处于上面的某种状态（即只可能处于`alpha、gamma、delta`三种状态之一）。

  > the term `gamma` seldom appears.

## 参考资料

* [【RabbitMQ学习记录】- 消息队列存储机制源码分析](https://blog.csdn.net/wangyiyungw/article/details/80610699)
* [RabbitMQ数据读写过程](http://geosmart.github.io/2019/11/11/RabbitMQ%E6%95%B0%E6%8D%AE%E8%AF%BB%E5%86%99%E8%BF%87%E7%A8%8B/)