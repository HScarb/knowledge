# RocketMQ 最佳实践

## 生产者

### 发送重试

默认的消息发送超时时间为 3s，重试次数为 2 次。

在生产环境中建议将超时时间合重试次数设大一点，以便有足够的重试次数来应对发送失败的场景。

配置建议：

使用异步发送可以避免上游调用超时，可以将超时时间设为 10s，重试次数设为 16次。

```java
        producer.setSendMsgTimeout(10000);
        producer.setRetryTimesWhenSendFailed(16);
        producer.setRetryTimesWhenSendAsyncFailed(16);
```

### 延迟故障规避

RocketMQ 引入了延迟故障规避机制，当消息发送失败后，不再会发送到失败的 Broker，而是换一个 Broker 发送。该机制默认不开启。

该配置项为 `sendLatencyFaultEnable`

* false：默认值，规避策略只在当前消息发送失败重试时失效。
* true：一旦消息发送失败，在接下来的一段时间内所有的客户端都不会向对应的 Broker 发送消息。

配置建议：

根据集群的负载来选择，一般无需开启。

* 如果集群负载较高，不建议开启。因为某个 Broker 发送失败后的 5 分钟不会接收消息，会造成其他 Broker 负载过高。

### 同一进程中多个生产者发送消息到多个集群

RocketMQ 客户端 SDK 中的 `MQClientInstance` 表示对应到一个 RocketMQ 集群的客户端，在一个进程中可以有多个。
在 `MQClientInstance` 中可以注册多个生产者和消费者，这些生产者和消费者的元数据配置是相同的。

为了实现多个生产者分别发送消息到多个集群，需要将生产者分别注册到多个 `MQClientInstance` 下，具体的方法为：为生产者设置不同的 `ClientId`。

配置建议：

将生产者的 `UnitName` 设置成集群名称，`ClientId` 生成时会拼接 `UnitName`，进而产生不同的 `ClientId`。

```java
DefaultMQProducer producer1 = new DefaultMQProducer("producer_group1");
producer.setUnitName("Cluster1")
producer.setNamesrvAddr("1.1.1.1:9876");
producer.start();

DefaultMQProducer producer2 = new DefaultMQProducer("producer_group2");
producer.setUnitName("Cluster2")
producer.setNamesrvAddr("2.2.2.2:9876");
producer.start();
```

附：生成 `ClientId` 的源码，

```java
public String buildMQClientId() {
    StringBuilder sb = new StringBuilder();
    sb.append(this.getClientIP());

    sb.append("@");
    sb.append(this.getInstanceName());
    if (!UtilAll.isBlank(this.unitName)) {
        sb.append("@");
        sb.append(this.unitName);
    }

    return sb.toString();
}
```

## 消费者

### 消费组线程数

RocketMQ 消费者提供 `consumeThreadMin`、`consumeThreadMax` 两个参数来设置线程池中的线程个数，但是由于线程池内部为无界队列，所以 `consumeThreadMax` 参数无效。
在实践中这两个值往往会设置成相同的。

### 避免订阅关系不一致导致消息丢失

RocketMQ 的一个消费组可以订阅多个 Topic，订阅多个 Tag。到那时同一个消费组中的订阅关系必须一致。
如果订阅关系不一致会造成消息丢失（部分消息未被消费）。

### 避免 ClientId 相同

消费者的 ClientId 生成规则与生产者一样。如果一个消费组内两个消费者的 ClientId 相同，会出现有的队列重复消费、有的队列无法消费的情况。

配置建议：

由于 ClientId 生成时会拼接消费者的 `clientIP` 属性，同一 IP 下不同消费者的 `clientIP` 相同会导致 ClientId 相同，所以建议手动设置 `clientIP`。

```java
consumer.setClientIP('192.168.3.10' + System.currentTimeMillis());
```

### 消费重试次数

普通消息默认重试 16 次，重试实践按照延迟等级每次重试会递增，到达 16 次后，之后每次重试按照最大延迟等级对应的时间间隔。

```java
    // 重试的时间从 10s 开始
    private String messageDelayLevel = "1s 5s 10s 30s 1m 2m 3m 4m 5m 6m 7m 8m 9m 10m 20m 30m 1h 2h";
```

顺序消费模式下重试次数配置无效，如果一条消息消费不成功会一直重试，重试次数为 `Integer.MAX_VALUE`。重试时间间隔可以用 `suspendCurrentQueueTimeMillis` 设置，默认为 1s。

## Broker

