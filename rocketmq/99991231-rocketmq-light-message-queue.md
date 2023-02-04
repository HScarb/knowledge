# RocketMQ 轻量级队列 Light Message Queue（RIP-28）原理详解 & 源码解析

## 1. 背景

### 1.1 引入原因

在 RocketMQ 4.9.3 版本中，引入了轻量级队列（LMQ）特性。

这个特性主要是为了支持在一些消息场景下可能存在的大量队列场景。比如 MQTT 的多级主题和 AMQP 的队列，这些队列的数量可能非常多。而 RocketMQ 的 Topic 资源密集，很难支持百万级别甚至更多数量。Light Message Queue 特性就是为了解决 IOT 设备和 AMQP 协议可能需要的海量队列的场景。

### 1.2 使用方法

#### 1.2.1 Broker 启动配置

broker.conf文件需要增加以下的配置项，开启 LMQ 开关，这样才能识别 LMQ 相关消息属性，分发消息到 LMQ

```conf
enableLmq = true
enableMultiDispatch = true
```

#### 1.2.2 生产消息

发送消息的时候通过设置 `INNER_MULTI_DISPATCH` 属性，LMQ 使用逗号分割，queue 前缀必须是 %LMQ%，这样 broker 就可以识别 LMQ。

```java
DefaultMQProducer producer = new DefaultMQProducer("please_rename_unique_group_name");
producer.setNamesrvAddr("name-server1-ip:9876;name-server2-ip:9876");
producer.start();


/*
* Create a message instance, specifying topic, tag and message body.
*/
Message msg = new Message("TopicTest" /* Topic */,
                          "TagA" /* Tag */,
                          ("Hello RocketMQ " + i).getBytes(RemotingHelper.DEFAULT_CHARSET) /* Message body */
                         );
/*
* INNER_MULTI_DISPATCH property and PREFIX must start as "%LMQ%",
* If it is multiple LMQ, need to use “,” split
*/
message.putUserProperty("INNER_MULTI_DISPATCH", "%LMQ%123,%LMQ%456");
/*
* Call send message to deliver message to one of brokers.
*/
SendResult sendResult = producer.send(msg);
```

#### 1.2.3 消费消息

LMQ 在每个 broker 上只有一个 queue，也即 queueId 为 0， 指明要消费的 LMQ，就可以拉取消息进行消费。 

```java
DefaultMQPullConsumer defaultMQPullConsumer = new DefaultMQPullConsumer();
defaultMQPullConsumer.setNamesrvAddr("name-server1-ip:9876;name-server2-ip:9876");
defaultMQPullConsumer.setVipChannelEnabled(false);
defaultMQPullConsumer.setConsumerGroup("CID_RMQ_SYS_LMQ_TEST");
defaultMQPullConsumer.setInstanceName("CID_RMQ_SYS_LMQ_TEST");
defaultMQPullConsumer.setRegisterTopics(new HashSet<>(Arrays.asList("TopicTest")));
defaultMQPullConsumer.setBrokerSuspendMaxTimeMillis(2000);
defaultMQPullConsumer.setConsumerTimeoutMillisWhenSuspend(3000);
defaultMQPullConsumer.start();

String brokerName = "set broker Name";
MessageQueue mq = new MessageQueue("%LMQ%123", brokerName, 0);
defaultMQPullConsumer.getDefaultMQPullConsumerImpl().getRebalanceImpl().getmQClientFactory().updateTopicRouteInfoFromNameServer("TopicTest");

Thread.sleep(30000);
Long offset = defaultMQPullConsumer.maxOffset(mq);

defaultMQPullConsumer.pullBlockIfNotFound(
                mq, "*", offset, 32,
                new PullCallback() {
                    @Override
                    public void onSuccess(PullResult pullResult) {
                        List<MessageExt> list = pullResult.getMsgFoundList();
                        if (list == null || list.isEmpty()) {
                            return;
                        }
                        for (MessageExt messageExt : list) {
                            System.out.println(messageExt);
                        }    
                    }
                    @Override
                    public void onException(Throwable e) {
                       
                    }
});
```

## 2. 概要设计

### 2.1 当前痛点

在 AMQP 协议中，消息发送到 Exchange，由 Exchange 将消息分发到一个或多个 Queue 中。在 RocketMQ 实现 AMQP 协议时，如果将 Topic 与 Queue 对应，就意味着同一条消息会保存到多个 Topic，在磁盘上存储多份。

<img src="https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202302050005953.png" style="zoom: 67%;" />

MQTT 协议的 Topic 则可以看作类似文件路径的字符串，可以有多个层级，如 `home/kitchen/coffeemaker`。订阅 Topic 时可以进行通配，以订阅一组路径的 Topic。在 IOT 场景下，Topic 数量可能会非常多。

<img src="https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202302050055405.png" style="zoom: 50%;" />

RocketMQ 原本的 Topic 是资源密集型的，并不适合海量 Topic 的场景。这体现在消息数据的存储和 Topic 元数据上。

1. Topic 中的每个消息数据都会在磁盘上存储。
1. 所有 Topic 的元数据会上报到 NameServer，存储在内存中。

当存在大量 Topic 时就会有严重的数据放大，占用大量磁盘存储空间和内存。

### 2.1 实现思想

对于上面两个痛点，LMQ 的实现思想是减少数据的重复存储，也减少元数据的内存占用。

对于队列数据重复保存的问题，可以想到消费者消费时实际是读取消费队列 ConsumeQueue 进行消费，ConsumeQueue 将消费者和消息存储的 CommitLog 分开。那么可以用消费队列来表示一个 Topic，不同的消费队列可以复用 CommitLog 中存储的数据，但是对消费者来说看到的是多个消费队列。

此外，用消费队列表示的好处还在于，它不会作为元数据上报到 NameServer。不过消费者需要在消费时指定拉取这个消费队列才可以消费。

那么轻量级队列的实现也就呼之欲出：用消费队列来表示轻量级队列，消息存到 CommitLog 后分发构建索引时，构建轻量级队列。这样，一个 Topic 构建的队列除了它本身的读写队列以外，还可以包含大量轻量级队列。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202302030055437.png)

## 3. 详细设计

### 3.1 消息生产和消费

上面提到 Topic 的消息分发构建索引时会构建 LMQ。LMQ 不需要提前创建，只需要在生产消息时带有需要分发的 LMQ 属性，就会在分发时构建 LMQ。

在消费时，LMQ 不在对应 Topic 上报的元数据中，订阅 Topic 也无法消费到其 LMQ。要消费 LMQ，需要显式指定拉取或订阅的队列信息才可以。因为 LMQ 仅仅是一个队列，所以它的队列 ID 为 0。

### 3.2 CommitLog 分发到 LMQ

LMQ 实现的重点就是 CommitLog 在生成消费索引时一并生成 LMQ。生成 LMQ 消息的主要步骤有两步

1. 在消息存入 CommitLog 前，解析消息属性中是否有需要分发的 LMQ 属性，如果有则解析该属性，查询要分发的 LMQ 当前的逻辑偏移量。然后把这些属性封装放入消息属性中，以便构建 LMQ 时使用。
2. 消息存入 CommitLog 后，索引构建线程 `ReputMessageService` 为每个消息构建消费队列时，会检查消息属性，判断是否需要分发构建 LMQ。如果属性中有 LMQ 和其逻辑偏移量，则从该偏移量开始构建 LMQ。

处理 LMQ 消息分发的逻辑主要在 `MultiDispatch` 类中（4.9.x 版本），最新的 5.0.x 版本引入了 `ConsumeQueueInterface` 将这部分代码重构，放到 `ConsumeQueue` 中。



## 4. 源码解析



## 参考资料

* [RIP28-Llight message queue (LMQ)](https://docs.google.com/document/d/1wq7crKF67fWv5h13TPHtCpHs-B9X8ZmaA-RM6yVbVbY)
* [RocketMQ LMQ 官方文档](https://github.com/apache/rocketmq/blob/develop/docs/cn/Example_LMQ.md)