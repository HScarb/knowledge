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

RocketMQ 的 Topic 的资源密集体现在

1. Topic 的

### 2.1 实现思想

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202302030055437.png)

## 3. 详细设计

## 4. 源码解析



## 参考资料

* [RIP28-Llight message queue (LMQ)](https://docs.google.com/document/d/1wq7crKF67fWv5h13TPHtCpHs-B9X8ZmaA-RM6yVbVbY)
* [RocketMQ LMQ 官方文档](https://github.com/apache/rocketmq/blob/develop/docs/cn/Example_LMQ.md)