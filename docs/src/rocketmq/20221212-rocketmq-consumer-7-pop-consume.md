---
title: RocketMQ 5.0：POP 消费模式 原理详解 & 源码解析
author: Scarb
date: 2022-12-12
---

原文地址：[http://hscarb.github.io/rocketmq/20221212-rocketmq-consumer-7-pop-consume.html](http://hscarb.github.io/rocketmq/20221212-rocketmq-consumer-7-pop-consume.html)

# RocketMQ 5.0：POP 消费模式 原理详解 & 源码解析

## 1. 背景

### 1.1 什么是 Pop 消费

RocketMQ 5.0 中引入了一种新的消费模式：Pop 消费模式。

我们知道 RocketMQ 原来有两种消费模式：Pull 模式消费和 Push 模式消费，其中 Push 模式指的是 Broker 将消息主动“推送”给消费者，它的背后其实是消费者在不断地 Pull 消息来实现类似于 Broker “推”消息给消费者的效果。

新引入的 Pop 消费模式主要是用于 Push 消费时将拉消息的动作替换成 Pop 。Pop 消费的行为和 Pull 消费很像，区别在于 Pop 消费的重平衡是在 Broker 端做的，而之前的 Pull 和 Push 消费都是由客户端完成重平衡。

### 1.2 如何使用 Pop 消费

RocketMQ 提供了 2 种方式，能够让 Push 消费切换为使用 Pop 模式拉取消息（Pull 消费暂不支持切换 Pop 模式），分别为命令行方式切换和客户端代码方式切换。

#### 1.2.1 使用命令行方式切换

利用命令行，用如下命令，指定集群和需要切换的消费组，可以将一个消费组切换成 Pop 消费模式消费某个 Topic

```bash
mqadmin setConsumeMode -c cluster -t topic -g group -m POP -q 8
```

以下为参数含义，其中 `popShareQueueNum` 表示 1 个队列最多可以被 N 个消费者同时消费。

```java
opt = new Option("c", "clusterName", true, "create subscription group to which cluster");
opt = new Option("t", "topicName", true, "topic name");
opt = new Option("g", "groupName", true, "consumer group name");
opt = new Option("m", "mode", true, "consume mode. PULL/POP");
opt = new Option("q", "popShareQueueNum", true, "num of queue which share in pop mode");
```

#### 1.2.2 代码切换

在创建 Consumer 之前，先运行 `switchPop()` 方法，它其实与上面命令行的逻辑一样，也是发送请求给集群中的所有 Broker 节点，让它们切换对应消费者组和 Topic 的消费者的消费模式为 Pop 模式。

```java
// PopPushConsumer.java
public class PopPushConsumer {

    public static final String CONSUMER_GROUP = "CID_JODIE_1";
    public static final String TOPIC = "TopicTest";

    // Or use AdminTools directly: mqadmin setConsumeMode -c cluster -t topic -g group -m POP -n 8
    private static void switchPop() throws Exception {
        DefaultMQAdminExt mqAdminExt = new DefaultMQAdminExt();
        mqAdminExt.start();

        ClusterInfo clusterInfo = mqAdminExt.examineBrokerClusterInfo();
        Set<String> brokerAddrs = clusterInfo.getBrokerAddrTable().values().stream().map(BrokerData::selectBrokerAddr).collect(Collectors.toSet());

        for (String brokerAddr : brokerAddrs) {
            mqAdminExt.setMessageRequestMode(brokerAddr, TOPIC, CONSUMER_GROUP, MessageRequestMode.POP, 8, 3_000);
        }
    }

    public static void main(String[] args) throws Exception {
        switchPop();

        DefaultMQPushConsumer consumer = new DefaultMQPushConsumer(CONSUMER_GROUP);
        consumer.subscribe(TOPIC, "*");
        consumer.setConsumeFromWhere(ConsumeFromWhere.CONSUME_FROM_LAST_OFFSET);
        consumer.registerMessageListener((MessageListenerConcurrently) (msgs, context) -> {
            System.out.printf("%s Receive New Messages: %s %n", Thread.currentThread().getName(), msgs);
            return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
        });
        consumer.setClientRebalance(false);
        consumer.start();
        System.out.printf("Consumer Started.%n");
    }
}
```

### 1.3 引入 Pop 消费模式的原因

引入 Pop 消费主要的原因是由于 Push 消费的机制导致它存在一些痛点。RocketMQ 5.0 云原生化的要求催生着一种能够解决这些痛点的新消费模式诞生。

Push 消费模式的重平衡逻辑是在客户端完成的，这就导致了几个问题：

1. 客户端代码逻辑较重，要支持一种新语言的客户端就必须实现完整的重平衡逻辑，此外还需要实现拉消息、位点管理、消费失败后将消息发回 Broker 重试等逻辑。这给多语言客户端的支持造成很大的阻碍。
2. 当客户端升级或者下线时，都要进行重平衡操作，可能造成消息堆积。

 此外，Push 消费的特性是重平衡后每个消费者都分配到消费一定数量的队列，而每个队列最多只能被一个消费者消费。这就决定了消费者的横向扩展能力受到 Topic 中队列数量的限制。这里有引入了如下痛点

1. 消费者无法无限扩展，当消费者数量扩大到大于队列数量时，有的消费者将无法分配到队列。
2. 当某些消费者僵死（hang 住）时（与 Broker 的心跳未断，但是无法消费消息），会造成其消费的队列的消息堆积，迟迟无法被消费，也不会主动重平衡来解决这个问题。

---

引入 Pop 消费模式之后，可以解决 Push 消费导致的可能的消息堆积问题和横向扩展能力问题。此外，RocketMQ 5.0 中引入了的轻量化客户端就用到了 Pop 消费能力，将 Pop 消费接口用 gRPC 封装，实现了多语言轻量化客户端，而不必在客户端实现重平衡逻辑。详见该项目 [rocketmq-clients](https://github.com/apache/rocketmq-clients)。

## 2. 概要设计

Pop 消费主要的设计思想是将繁重的客户端逻辑如重平衡、消费进度提交、消费失败后发到 Broker 重试等逻辑放到 Broker 端。

客户端只需要不断发送 Pop 请求，由 Broker 端来分配每次拉取请求要拉取的队列并返回消息。这样就可以实现多个客户端同时拉取一个队列的效果，不会存在一个客户端 hang 住导致队列消息堆积，也不会存在频繁的重平衡导致消息积压。

### 2.1 Pop 消费流程

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202212130012457.png)

为了保证消费速度，Pop 消费一次请求可以拉取一批消息，拉取到的消息系统属性中有一个比较重要的属性叫做 `POP_CK`，它是该消息的句柄，ACK 时要通过句柄来定位到它。在 Broker 端会为这批消息保存一个 `CheckPoint`，它里面包含一批消息的句柄信息。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202212130025660.png)

对于长时间没有 ACK 的消息，Broker 端并非毫无办法。Pop 消费引入了消息不可见时间（invisibleTime）的机制。当 Pop 出一条消息后，这条消息对所有消费者不可见，即进入不可见时间，当它超过该时刻还没有被 ACK，Broker 将会把它放入 Pop 专门的重试 Topic（这个过程称为 Revive），这条消息重新可以被消费。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202212130013463.png)

Push 消费的重试间隔时间会随着重试次数而增加，Pop 消费也沿用了这个设计。此外，Pop 消费提供了一个接口 `changeInvisibleTime()` 来修改单条消息的不可见时间。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202212130025555.png)

从图上可以看见，本来消息会在中间这个时间点再一次的可见的，但是我们在可见之前提前使用 `changeInvisibleTime` 延长了不可见时间，让这条消息的可见时间推迟了。

当消费失败（用户业务代码返回 reconsumeLater 或者抛异常）的时候，消费者就通过 `changeInvisibleTime` 按照重试次数来修改下一次的可见时间。另外如果消费消息用时超过了 30 秒（默认值，可以修改），则 Broker 也会把消息放到重试队列。

### 2.2 客户端-服务端交互

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/12/1671126626388.png)

Pop 消费的流程与 Push 消费较为相似，这里我分为 5 个步骤。

1. 向 Broker 端发送请求，切换消息拉取模式为 Pop 模式
2. 重平衡服务执行重平衡，此时已经切换为 Pop 模式，所以是向 Broker 端发起请求，请求中带有重平衡策略，Broker 会返回重平衡的结果。
3. 重平衡完毕之后开始拉取消息，拉取消息服务发送 `POP_MESSAGE` 请求给 Broker，获取一批消息
4. 消费这批消息
5. 对成功消费的消息，发送 ACK 请求给 Broker

### 2.3 服务端实现

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202212130042984.png)

服务端收到 Pop 请求后，会先在 Queue 维度上加锁，保证同一时间只有一个消费者可以拉取该队列的消息。

随后服务端会在存储中查询一批消息，将这批消息的构建的 `CheckPoint` 保存在 Broker 中，以便与 ACK 的消息匹配。

`CheckPoint` 的存在目的是与 ACK 的消息匹配，并将没有匹配的消息重试。`CheckPoint` 的 `ReviveTime` 就是它这批消息需要被尝试重试（唤醒）的时间。

`CheckPoint`会先被保存在内存中，一般来说消息消费很快，所以在内存中就能够与 ACK 消息匹配成功后删除。如果在一段时间（默认 3s）内没有匹配成功，它将会从内存中被删除，转入磁盘等待匹配。

对于 ACK 消息也一样，它先被放入内存中匹配，如果在内存中找不到对应的 `CheckPoint`，也会放入磁盘。

---

RocketMQ 的磁盘存储实际上就是 Topic 和队列。为了避免频繁检查匹配状态，我们只在 `CheckPoint` 需要被唤醒时做检查，这里就可以用到定时消息，将 `CheckPoint` 和 ACK 消息定时到 `ReviveTime` 投递。这里 RocketMQ 将 `CheckPoint` 的投递时间提前 1s，以便能先消费到，与 ACK 消息匹配。

当定时到期，它们会被投递到 `REVIVE_TOPIC`。有个后台线程消费这个 Topic，把 `CheckPoint` 放到一个 map 中，对于 ACK 消息则从 map 中查找 `CheckPoint` 来尝试匹配，如果匹配成功则更新 `REVIVE_TOPIC` 的消费位点。对于超过 `ReviveTime` 还没有被匹配的 `CheckPoint`，查出这批消息中要重试消息对应的真实消息，并放到 Pop 消费重试 Topic 中。

Broker 端的 Pop 消费逻辑会概率性消费到重试 Topic 中的消息。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202212130045464.png)

## 3. 详细设计

### 3.1 Broker 端重平衡

Pop 消费的重平衡在 Broker 端完成，客户端的重平衡服务重平衡时会向 Broker 端发送查询请求，查询自己的分配结果。

重平衡的主要逻辑其实与在客户端重平衡类似，只不过变成了 Broker 接收客户端的参数之后根据这些参数进行重平衡，然后把重平衡结果返回给客户端。

Broker 端重平衡入口为 `QueryAssignmentProcessor#doLoadBalance()`。

对于广播模式，直接返回 Topic 下所有的队列。

对于集群模式，Pop 模式的重平衡与 Push 模式不同，它允许一个队列被多个消费者 Pop 消费。在切换 Pop 模式时引入了 `popShareQueueNum` 参数，表示允许消费者进行额外的负载获取队列的次数（可以被共享的队列数），0 表示可以消费所有队列。

所以重平衡时对每个消费者执行 `popShareQueueNum`  次重平衡策略，将多次重平衡分配到的队列都分给这个消费者消费。这样，每个队列就会被多个消费者消费。

下图为 `popShareQueueNum = 1`  时的重平衡情况，每个消费者被负载了 2 次，每个队列被 2 个消费者共享（1 + `popShareQueueNum`）。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/12/1671126626711.png)

### 3.2 Broker 端 Pop 消息

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/12/1671126626730.png)

#### 3.2.1 请求处理入口

Pop 消息的 Broker 端处理是由 `PopMessageProcessor#processRequest()` 完成。

该方法逻辑为

1. 完成请求体解析和一些参数和权限的校验
2. 生成一个 0 到 99 的随机整数，如果能被 5 整除，则先拉取重试 Topic。
3. 从重试 Topic 的每个 Queue 中 Pop 消息
4. 根据请求的队列 Pop 对应的队列的消息。如果 Pop 请求指定了队列，只会消费一个队列的消息；如果没有指定队列，则 Pop 所有队列的消息
5. 如果 Pop 的消息没有满（达到请求的最大消息数量），且之前没有拉取过重试消息，则 Pop 重试 Topic 所有队列的消息（期望填充满 Pop 请求要求的数量）
6. 判断是否 Pop 到消息，如果有则传输回客户端，如果没有则挂起轮询，直到超过请求的 timeout 参数指定的时间

#### 3.2.2 Pop 消息方法

上面的 3、4、5 都涉及到从存储中 Pop 消息，它们都调用同一个方法：`popMsgFromQueue`，它是真正查询消息的方法，下面看一下它的逻辑

1. 将需要 Pop 的队列上锁（用 `AtomicBoolean` 实现）
2. 计算 Pop 消息的起始偏移量，会返回内存中 CheckPoint 与 ACK 消息匹配后的最新位点
3. 从磁盘中根据起始偏移量查询一批消息
4. 计算队列剩余的消息数量（用作返回值）
5. 拉取的这批消息将生成一个 `CheckPoint`，存入内存和磁盘
6. 解锁队列
7. 返回 Pop 到的消息

上面方法第 5 步会将生成的 `CheckPoint` 放入内存和磁盘，注意这个 `CheckPoint` 会保存一批获取到的消息的起始偏移量和相对偏移量（相对于起始偏移量），所以一个 `CheckPoint` 在保存和匹配时都对应一批消息。

#### 3.2.3 保存 `CheckPoint` 用于匹配

1. 构造 `CheckPoint`，添加起始偏移量和所有 Pop 出的消息的相对偏移量
2. 尝试将 `CheckPoint` 添加到内存 Buffer，如果成功则直接返回。但是在内存中匹配 `CheckPoint` 和 `AckMsg` 的开关默认是关闭的，所以这里不会加入到内存，会继续后面的逻辑放入磁盘
3. 将 `CheckPoint` 构造成一个消息，数据都放到消息体中，然后这个消息定时到 `ReviveTime`（唤醒重试的时间）- 1s（为了留时间与 `AckMsg` 匹配）发送。会发送到 ReviveTopic 的一个队列。

### 3.3 Broker 端 ACK 消息

Ack 消息接口每次只允许 Ack 一条消息，入口是 `AckMessageProcessor#processRequest()`

1. 从请求头解析和构造 Ack 消息，并作一些校验
2. 顺序消息 Ack 和普通消息 Ack 分别处理，这里针对普通消息
3. 先尝试将 Ack 消息放入内存 Buffer，如果成功则直接返回。失败则有可能是内存匹配未开启。
4. 如果放入内存失败，构造一个用于存到磁盘的消息，定时到唤醒重试时间投递（到 ReviveTopic）。

### 3.4 Broker 端 `CheckPoint` 与 `AckMsg` 匹配

`CheckPoint` 和 `AckMsg` 都被设计成先尝试放入内存中匹配，然后再磁盘中匹配，因为通常情况下消息消费之后都能很快 ACK，内存匹配性能较高。如果 `CheckPoint` 在内存中停留太久没有被匹配，则会转移到磁盘中（ReviveTopic），有个线程消费这个 ReviveTopic 来匹配。到达唤醒重试时间（ReviveTime）还没有被匹配的 `CheckPoint` 里面的消息将会重试（发送到 Pop 消息重试 Topic，后面的 Pop 有概率消费到）。

#### 3.4.1 内存匹配

内存匹配逻辑由一个线程 `PopBufferMergeService` 完成，只有主节点运行该匹配线程。

Pop 消息时会先添加 `CheckPoint` 到 buffer，Ack 消息时尝试从内存 buffer 中的 `CheckPoint` 匹配。同时，它每 5ms 执行一次扫描，将不符合内存中存活条件的 `CheckPoint` 移除，放入磁盘存储。

`addCk` 方法将 `CheckPoint` 放入内存 Buffer。`CheckPoint` 中有一个码表 `BitMap`，用来表示它里面的每个条消息是否被 Ack 和被存到磁盘。用 `BitMap` 可以加速匹配。

`addAk` 方法会尝试从 buffer 中找 `CheckPoint` 来匹配。如果找到对应的 `CheckPoint`，则修改它码表的对应位，表示这条消息被 ACK。

`scan` 方法每 5ms 执行一次

1. 将已经匹配或存盘的 `CheckPoint` 移出 buffer
2. 把超时的 `CheckPoint` 存入磁盘
3. 对于匹配完成或者存盘的 `CheckPoint`，为他们提交消息偏移量

#### 3.4.2 Store 匹配和消息重试

从内存中移除保存到磁盘的 `CheckPoint` 和 `AckMsg` 都会封装成消息进行定时投递（定时到重试时间），最终投递到 `ReviveTopic`。存储中匹配也由一个线程 `PopReviveService` 完成，它消费 `ReviveTopic` 的消息进行匹配和重试。

Pop 消费由于要根据 Topic 来 Pop 消息，重试 Topic 需要针对每个 [消费组-Topic] 隔离，所以它不能用普通消息的消费组维度的重试 Topic，而是用专门的 Pop 重试 Topic `%RETRY%{消费组}_{TOPIC}`。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/12/1671126626776.png)

`PopReviveService#run` 方法是该处理线程的入口，它每秒都会调用 `consumeReviveMessage` 消费和匹配 ReviveTopic 消息，然后调用 `mergeAndRevive` 方法检查匹配的情况并对达到唤醒时间还没有成功匹配的消息重试。

这两个方法会先初始化一个 map，用于存放 `CheckPoint`，供 `AckMsg` 根据 map key 查找 `CheckPoint`。

---

`consumeReviveMessage` 会消费 2s 内的一批 ReviveTopic 消息，CK 消息放入 map，Ack 消息则从 map 中查找 CK，在码表上标记对应的消息为 Acked。

`mergeAndRevive` 方法如其名，遍历消费到的 CK 消息，对于已经到重试时间的，对没有 Ack 的消息进行重试。

重试逻辑为先从 MessageStore 查询对应的真正消息，然后将该消息发送到 Pop 重试队列。

## 4. 源码解析

### 4.1 Broker 端重平衡

#### 4.1.1 `QueryAssignmentProcessor#doLoadBalance`

```java
/**
 * Broker 端重平衡
 * Returns empty set means the client should clear all load assigned to it before, null means invalid result and the
 * client should skip the update logic
 *
 * @param topic
 * @param consumerGroup
 * @param clientId
 * @param messageModel 消费模型（广播/集群）
 * @param strategyName 重平衡策略名
 * @return the MessageQueues assigned to this client
 */
private Set<MessageQueue> doLoadBalance(final String topic, final String consumerGroup, final String clientId,
                                        final MessageModel messageModel, final String strategyName,
                                        SetMessageRequestModeRequestBody setMessageRequestModeRequestBody, final ChannelHandlerContext ctx) {
    Set<MessageQueue> assignedQueueSet = null;
    final TopicRouteInfoManager topicRouteInfoManager = this.brokerController.getTopicRouteInfoManager();

    switch (messageModel) {
        case BROADCASTING: {
            // 广播模式，返回该 Topic 下所有队列
            assignedQueueSet = topicRouteInfoManager.getTopicSubscribeInfo(topic);
            if (assignedQueueSet == null) {
                log.warn("QueryLoad: no assignment for group[{}], the topic[{}] does not exist.", consumerGroup, topic);
            }
            break;
        }
        case CLUSTERING: {
            // 集群模式
            // 获取 Topic 下所有队列
            Set<MessageQueue> mqSet = topicRouteInfoManager.getTopicSubscribeInfo(topic);
            if (null == mqSet) {
                if (!topic.startsWith(MixAll.RETRY_GROUP_TOPIC_PREFIX)) {
                    log.warn("QueryLoad: no assignment for group[{}], the topic[{}] does not exist.", consumerGroup, topic);
                }
                return null;
            }

            if (!brokerController.getBrokerConfig().isServerLoadBalancerEnable()) {
                return mqSet;
            }

            List<String> cidAll = null;
            // 获取发起请求的消费组信息
            ConsumerGroupInfo consumerGroupInfo = this.brokerController.getConsumerManager().getConsumerGroupInfo(consumerGroup);
            if (consumerGroupInfo != null) {
                cidAll = consumerGroupInfo.getAllClientId();
            }
            if (null == cidAll) {
                log.warn("QueryLoad: no assignment for group[{}] topic[{}], get consumer id list failed", consumerGroup, topic);
                return null;
            }

            List<MessageQueue> mqAll = new ArrayList<MessageQueue>();
            mqAll.addAll(mqSet);
            // 将队列和消费者客户端ID 排序
            Collections.sort(mqAll);
            Collections.sort(cidAll);
            List<MessageQueue> allocateResult = null;

            try {
                // 根据重平衡策略名称获取策略
                AllocateMessageQueueStrategy allocateMessageQueueStrategy = name2LoadStrategy.get(strategyName);
                if (null == allocateMessageQueueStrategy) {
                    log.warn("QueryLoad: unsupported strategy [{}],  {}", strategyName, RemotingHelper.parseChannelRemoteAddr(ctx.channel()));
                    return null;
                }

                if (setMessageRequestModeRequestBody != null && setMessageRequestModeRequestBody.getMode() == MessageRequestMode.POP) {
                    // POP 模式重平衡
                    allocateResult = allocate4Pop(allocateMessageQueueStrategy, consumerGroup, clientId, mqAll,
                                                  cidAll, setMessageRequestModeRequestBody.getPopShareQueueNum());

                } else {
                    // 普通重平衡
                    allocateResult = allocateMessageQueueStrategy.allocate(consumerGroup, clientId, mqAll, cidAll);
                }
            } catch (Throwable e) {
                log.error("QueryLoad: no assignment for group[{}] topic[{}], allocate message queue exception. strategy name: {}, ex: {}", consumerGroup, topic, strategyName, e);
                return null;
            }

            assignedQueueSet = new HashSet<MessageQueue>();
            if (allocateResult != null) {
                assignedQueueSet.addAll(allocateResult);
            }
            break;
        }
        default:
            break;
    }
    return assignedQueueSet;
}
```

#### 4.1.2 `QueryAssignmentProcessor#allocate4Pop`

```java
/**
 * POP 模式重平衡
 *
 * @param allocateMessageQueueStrategy 重平衡策略
 * @param consumerGroup 消费组
 * @param clientId 消费组客户端 ID
 * @param mqAll 全部消息队列
 * @param cidAll 全部客户端ID
 * @param popShareQueueNum Pop 模式下可允许被共享的队列数，0 表示无限
 * @return 该消费者负载的队列列表
 */
public List<MessageQueue> allocate4Pop(AllocateMessageQueueStrategy allocateMessageQueueStrategy,
                                       final String consumerGroup, final String clientId, List<MessageQueue> mqAll, List<String> cidAll,
                                       int popShareQueueNum) {

    List<MessageQueue> allocateResult;
    if (popShareQueueNum <= 0 || popShareQueueNum >= cidAll.size() - 1) {
        // 每个消费者能消费所有队列，返回全部队列。队列 ID 为 -1 表示 Pop 消费时消费全部队列
        //each client pop all messagequeue
        allocateResult = new ArrayList<>(mqAll.size());
        for (MessageQueue mq : mqAll) {
            //must create new MessageQueue in case of change cache in AssignmentManager
            MessageQueue newMq = new MessageQueue(mq.getTopic(), mq.getBrokerName(), -1);
            allocateResult.add(newMq);
        }

    } else {
        if (cidAll.size() <= mqAll.size()) {
            // 消费者数量小于等于队列数量，每个消费者分配 N 个队列，每个队列也会被分配给多个消费者
            //consumer working in pop mode could share the MessageQueues assigned to the N (N = popWorkGroupSize) consumer following it in the cid list
            allocateResult = allocateMessageQueueStrategy.allocate(consumerGroup, clientId, mqAll, cidAll);
            int index = cidAll.indexOf(clientId);
            if (index >= 0) {
                // 负载 popShareQueueNum 次，将每次负载的结果加入最终结果
                for (int i = 1; i <= popShareQueueNum; i++) {
                    index++;
                    index = index % cidAll.size();
                    List<MessageQueue> tmp = allocateMessageQueueStrategy.allocate(consumerGroup, cidAll.get(index), mqAll, cidAll);
                    allocateResult.addAll(tmp);
                }
            }
        } else {
            // 消费者数量大于队列数量，保证每个消费者都有队列消费
            //make sure each cid is assigned
            allocateResult = allocate(consumerGroup, clientId, mqAll, cidAll);
        }
    }

    return allocateResult;
}
```

### 4.2 Broker 端 Pop 消息

#### 4.2.1 `PopMessageProcessor#processRequest`

```java
/**
 * 处理 POP 消息请求
 *
 * @param channel
 * @param request
 * @return
 * @throws RemotingCommandException
 */
private RemotingCommand processRequest(final Channel channel, RemotingCommand request)
    throws RemotingCommandException {
    // ... 解析请求体和一系列校验

    // 生成随机数
    int randomQ = random.nextInt(100);
    int reviveQid;
    if (requestHeader.isOrder()) {
        reviveQid = KeyBuilder.POP_ORDER_REVIVE_QUEUE;
    } else {
        // 轮询选一个 Revive 队列
        reviveQid = (int) Math.abs(ckMessageNumber.getAndIncrement() % this.brokerController.getBrokerConfig().getReviveQueueNum());
    }

    int commercialSizePerMsg = this.brokerController.getBrokerConfig().getCommercialSizePerMsg();
    GetMessageResult getMessageResult = new GetMessageResult(commercialSizePerMsg);

    // 队列中剩余的消息数量
    long restNum = 0;
    // 1/5 的概率拉取重试消息
    boolean needRetry = randomQ % 5 == 0;
    long popTime = System.currentTimeMillis();
    // 拉取重试消息
    if (needRetry && !requestHeader.isOrder()) {
        TopicConfig retryTopicConfig =
            this.brokerController.getTopicConfigManager().selectTopicConfig(KeyBuilder.buildPopRetryTopic(requestHeader.getTopic(), requestHeader.getConsumerGroup()));
        if (retryTopicConfig != null) {
            for (int i = 0; i < retryTopicConfig.getReadQueueNums(); i++) {
                int queueId = (randomQ + i) % retryTopicConfig.getReadQueueNums();
                restNum = popMsgFromQueue(true, getMessageResult, requestHeader, queueId, restNum, reviveQid,
                                          channel, popTime, messageFilter,
                                          startOffsetInfo, msgOffsetInfo, orderCountInfo);
            }
        }
    }
    // 如果拉取请求没有指定队列（-1），则拉取所有队列
    if (requestHeader.getQueueId() < 0) {
        // read all queue
        for (int i = 0; i < topicConfig.getReadQueueNums(); i++) {
            int queueId = (randomQ + i) % topicConfig.getReadQueueNums();
            restNum = popMsgFromQueue(false, getMessageResult, requestHeader, queueId, restNum, reviveQid, channel, popTime, messageFilter,
                                      startOffsetInfo, msgOffsetInfo, orderCountInfo);
        }
    } else {
        // 拉取请求指定了队列，拉取对应的队列
        int queueId = requestHeader.getQueueId();
        restNum = popMsgFromQueue(false, getMessageResult, requestHeader, queueId, restNum, reviveQid, channel,
                                  popTime, messageFilter,
                                  startOffsetInfo, msgOffsetInfo, orderCountInfo);
    }
    // 如果前面拉取普通消息之后，没有满，则再拉取一次重试消息
    // if not full , fetch retry again
    if (!needRetry && getMessageResult.getMessageMapedList().size() < requestHeader.getMaxMsgNums() && !requestHeader.isOrder()) {
        TopicConfig retryTopicConfig =
            this.brokerController.getTopicConfigManager().selectTopicConfig(KeyBuilder.buildPopRetryTopic(requestHeader.getTopic(), requestHeader.getConsumerGroup()));
        if (retryTopicConfig != null) {
            for (int i = 0; i < retryTopicConfig.getReadQueueNums(); i++) {
                int queueId = (randomQ + i) % retryTopicConfig.getReadQueueNums();
                restNum = popMsgFromQueue(true, getMessageResult, requestHeader, queueId, restNum, reviveQid,
                                          channel, popTime, messageFilter,
                                          startOffsetInfo, msgOffsetInfo, orderCountInfo);
            }
        }
    }
    // 拉取消息成功
    if (!getMessageResult.getMessageBufferList().isEmpty()) {
        response.setCode(ResponseCode.SUCCESS);
        getMessageResult.setStatus(GetMessageStatus.FOUND);
        if (restNum > 0) {
            // all queue pop can not notify specified queue pop, and vice versa
            notifyMessageArriving(requestHeader.getTopic(), requestHeader.getConsumerGroup(),
                                  requestHeader.getQueueId());
        }
    } else {
        // 没有拉取到消息，长轮询
        int pollingResult = polling(channel, request, requestHeader);
        if (POLLING_SUC == pollingResult) {
            return null;
        } else if (POLLING_FULL == pollingResult) {
            response.setCode(ResponseCode.POLLING_FULL);
        } else {
            response.setCode(ResponseCode.POLLING_TIMEOUT);
        }
        getMessageResult.setStatus(GetMessageStatus.NO_MESSAGE_IN_QUEUE);
    }
    responseHeader.setInvisibleTime(requestHeader.getInvisibleTime());
    responseHeader.setPopTime(popTime);
    responseHeader.setReviveQid(reviveQid);
    responseHeader.setRestNum(restNum);
    responseHeader.setStartOffsetInfo(startOffsetInfo.toString());
    responseHeader.setMsgOffsetInfo(msgOffsetInfo.toString());
    if (requestHeader.isOrder() && orderCountInfo != null) {
        responseHeader.setOrderCountInfo(orderCountInfo.toString());
    }
    response.setRemark(getMessageResult.getStatus().name());
    // 传输消息
    return response;
}
```

#### 4.2.2 `PopMessageProcessor#popMsgFromQueue`

```java
/**
 * 从消息队列中 POP 消息
 *
 * @param isRetry 是否是重试 Topic
 * @param getMessageResult
 * @param requestHeader
 * @param queueId 消息队列 ID
 * @param restNum 队列剩余消息数量
 * @param reviveQid 唤醒队列 ID
 * @param channel Netty Channel，用于获取客户端 host，来提交消费进度
 * @param popTime Pop 时间
 * @param messageFilter
 * @param startOffsetInfo 获取 Pop 的起始偏移量
 * @param msgOffsetInfo 获取所有 Pop 的消息的逻辑偏移量
 * @param orderCountInfo
 * @return 队列剩余消息
 */
private long popMsgFromQueue(boolean isRetry, GetMessageResult getMessageResult,
                             PopMessageRequestHeader requestHeader, int queueId, long restNum, int reviveQid,
                             Channel channel, long popTime,
                             ExpressionMessageFilter messageFilter, StringBuilder startOffsetInfo,
                             StringBuilder msgOffsetInfo, StringBuilder orderCountInfo) {
    String topic = isRetry ? KeyBuilder.buildPopRetryTopic(requestHeader.getTopic(),
                                                           requestHeader.getConsumerGroup()) : requestHeader.getTopic();
    // {TOPIC}@{GROUP}@{QUEUE_ID}
    String lockKey =
        topic + PopAckConstants.SPLIT + requestHeader.getConsumerGroup() + PopAckConstants.SPLIT + queueId;
    boolean isOrder = requestHeader.isOrder();
    long offset = getPopOffset(topic, requestHeader, queueId, false, lockKey);
    // Queue 上加锁，保证同一时刻只有一个消费者可以拉取同一个 Queue 的消息
    if (!queueLockManager.tryLock(lockKey)) {
        // 返回该队列中待 Pop 的消息数量
        restNum = this.brokerController.getMessageStore().getMaxOffsetInQueue(topic, queueId) - offset + restNum;
        return restNum;
    }
    // 计算要 POP 的消息偏移量
    offset = getPopOffset(topic, requestHeader, queueId, true, lockKey);
    GetMessageResult getMessageTmpResult = null;
    try {
        // 顺序消费，阻塞
        if (isOrder && brokerController.getConsumerOrderInfoManager().checkBlock(topic,
                                                                                 requestHeader.getConsumerGroup(), queueId, requestHeader.getInvisibleTime())) {
            return this.brokerController.getMessageStore().getMaxOffsetInQueue(topic, queueId) - offset + restNum;
        }

        // 已经拉取到足够的消息
        if (getMessageResult.getMessageMapedList().size() >= requestHeader.getMaxMsgNums()) {
            restNum =
                this.brokerController.getMessageStore().getMaxOffsetInQueue(topic, queueId) - offset + restNum;
            return restNum;
        }
        // 从磁盘消息存储中根据逻辑偏移量查询消息
        getMessageTmpResult = this.brokerController.getMessageStore().getMessage(requestHeader.getConsumerGroup()
                                                                                 , topic, queueId, offset,
                                                                                 requestHeader.getMaxMsgNums() - getMessageResult.getMessageMapedList().size(), messageFilter);
        if (getMessageTmpResult == null) {
            return this.brokerController.getMessageStore().getMaxOffsetInQueue(topic, queueId) - offset + restNum;
        }
        // maybe store offset is not correct.
        if (GetMessageStatus.OFFSET_TOO_SMALL.equals(getMessageTmpResult.getStatus())
            || GetMessageStatus.OFFSET_OVERFLOW_BADLY.equals(getMessageTmpResult.getStatus())
            || GetMessageStatus.OFFSET_FOUND_NULL.equals(getMessageTmpResult.getStatus())) {
            // commit offset, because the offset is not correct
            // If offset in store is greater than cq offset, it will cause duplicate messages,
            // because offset in PopBuffer is not committed.
            POP_LOGGER.warn("Pop initial offset, because store is no correct, {}, {}->{}",
                            lockKey, offset, getMessageTmpResult.getNextBeginOffset());
            offset = getMessageTmpResult.getNextBeginOffset();
            this.brokerController.getConsumerOffsetManager().commitOffset(channel.remoteAddress().toString(), requestHeader.getConsumerGroup(), topic,
                                                                          queueId, offset);
            getMessageTmpResult =
                this.brokerController.getMessageStore().getMessage(requestHeader.getConsumerGroup(), topic,
                                                                   queueId, offset,
                                                                   requestHeader.getMaxMsgNums() - getMessageResult.getMessageMapedList().size(), messageFilter);
        }

        // 计算队列还剩下的消息数量
        restNum = getMessageTmpResult.getMaxOffset() - getMessageTmpResult.getNextBeginOffset() + restNum;
        if (!getMessageTmpResult.getMessageMapedList().isEmpty()) {
            // 更新统计数据
            this.brokerController.getBrokerStatsManager().incBrokerGetNums(getMessageTmpResult.getMessageCount());
            this.brokerController.getBrokerStatsManager().incGroupGetNums(requestHeader.getConsumerGroup(), topic,
                                                                          getMessageTmpResult.getMessageCount());
            this.brokerController.getBrokerStatsManager().incGroupGetSize(requestHeader.getConsumerGroup(), topic,
                                                                          getMessageTmpResult.getBufferTotalSize());

            if (isOrder) {
                // 顺序消费，更新偏移量
                int count = brokerController.getConsumerOrderInfoManager().update(topic,
                                                                                  requestHeader.getConsumerGroup(),
                                                                                  queueId, getMessageTmpResult.getMessageQueueOffset());
                this.brokerController.getConsumerOffsetManager().commitOffset(channel.remoteAddress().toString(),
                                                                              requestHeader.getConsumerGroup(), topic, queueId, offset);
                ExtraInfoUtil.buildOrderCountInfo(orderCountInfo, isRetry, queueId, count);
            } else {
                // 添加 CheckPoint 到内存，用于等待 ACK
                appendCheckPoint(requestHeader, topic, reviveQid, queueId, offset, getMessageTmpResult, popTime, this.brokerController.getBrokerConfig().getBrokerName());
            }
            ExtraInfoUtil.buildStartOffsetInfo(startOffsetInfo, isRetry, queueId, offset);
            ExtraInfoUtil.buildMsgOffsetInfo(msgOffsetInfo, isRetry, queueId,
                                             getMessageTmpResult.getMessageQueueOffset());
        } else if ((GetMessageStatus.NO_MATCHED_MESSAGE.equals(getMessageTmpResult.getStatus())
                    || GetMessageStatus.OFFSET_FOUND_NULL.equals(getMessageTmpResult.getStatus())
                    || GetMessageStatus.MESSAGE_WAS_REMOVING.equals(getMessageTmpResult.getStatus())
                    || GetMessageStatus.NO_MATCHED_LOGIC_QUEUE.equals(getMessageTmpResult.getStatus()))
                   && getMessageTmpResult.getNextBeginOffset() > -1) {
            // 没有拉取到消息，添加假的消息 CheckPoint 到队列
            popBufferMergeService.addCkMock(requestHeader.getConsumerGroup(), topic, queueId, offset,
                                            requestHeader.getInvisibleTime(), popTime, reviveQid, getMessageTmpResult.getNextBeginOffset(), brokerController.getBrokerConfig().getBrokerName());
            //                this.brokerController.getConsumerOffsetManager().commitOffset(channel.remoteAddress().toString(), requestHeader.getConsumerGroup(), topic,
            //                        queueId, getMessageTmpResult.getNextBeginOffset());
        }
    } catch (Exception e) {
        POP_LOGGER.error("Exception in popMsgFromQueue", e);
    } finally {
        // Pop 完后解锁
        queueLockManager.unLock(lockKey);
    }
    // 将拉取到的消息放入结果容器中
    if (getMessageTmpResult != null) {
        for (SelectMappedBufferResult mapedBuffer : getMessageTmpResult.getMessageMapedList()) {
            getMessageResult.addMessage(mapedBuffer);
        }
    }
    return restNum;
}
```

#### 4.2.3 `PopMessageProcessor#appendCheckPoint`

```java
/**
 * 在 POP 拉取消息后调用，添加 CheckPoint，等待 ACK
 *
 * @param requestHeader
 * @param topic POP 的 Topic
 * @param reviveQid Revive 队列 ID
 * @param queueId POP 的队列 ID
 * @param offset POP 消息的起始偏移量
 * @param getMessageTmpResult POP 一批消息的结果
 * @param popTime POP 时间
 * @param brokerName
 */
private void appendCheckPoint(final PopMessageRequestHeader requestHeader,
                              final String topic, final int reviveQid, final int queueId, final long offset,
                              final GetMessageResult getMessageTmpResult, final long popTime, final String brokerName) {
    // add check point msg to revive log
    final PopCheckPoint ck = new PopCheckPoint();
    // ... 构造 PopCheckPoint，赋值过程省略
    
    for (Long msgQueueOffset : getMessageTmpResult.getMessageQueueOffset()) {
        // 添加所有拉取的消息的偏移量与起始偏移量的差值
        ck.addDiff((int) (msgQueueOffset - offset));
    }

    // 将 Offset 放入内存
    final boolean addBufferSuc = this.popBufferMergeService.addCk(
        ck, reviveQid, -1, getMessageTmpResult.getNextBeginOffset()
    );

    if (addBufferSuc) {
        return;
    }

    // 放入内存匹配失败（内存匹配未开启），将 Offset 放入内存和磁盘
    this.popBufferMergeService.addCkJustOffset(
        ck, reviveQid, -1, getMessageTmpResult.getNextBeginOffset()
    );
}
```

### 4.3 Broker 端 Ack 消息

#### 4.3.1 `AckMessageProcessor#processRequest`

```java
/**
 * 处理 Ack 消息请求，每次 Ack 一条消息
 *
 * @param channel
 * @param request
 * @param brokerAllowSuspend
 * @return
 * @throws RemotingCommandException
 */
private RemotingCommand processRequest(final Channel channel, RemotingCommand request,
                                       boolean brokerAllowSuspend) throws RemotingCommandException {
    // 解析请求头
    final AckMessageRequestHeader requestHeader = (AckMessageRequestHeader) request.decodeCommandCustomHeader(AckMessageRequestHeader.class);
    MessageExtBrokerInner msgInner = new MessageExtBrokerInner();
    AckMsg ackMsg = new AckMsg();
    RemotingCommand response = RemotingCommand.createResponseCommand(ResponseCode.SUCCESS, null);
    response.setOpaque(request.getOpaque());
    // ... 校验
    
    // 拆分消息句柄字符串
    String[] extraInfo = ExtraInfoUtil.split(requestHeader.getExtraInfo());

    // 用请求头中的信息构造 AckMsg
    ackMsg.setAckOffset(requestHeader.getOffset());
    ackMsg.setStartOffset(ExtraInfoUtil.getCkQueueOffset(extraInfo));
    ackMsg.setConsumerGroup(requestHeader.getConsumerGroup());
    ackMsg.setTopic(requestHeader.getTopic());
    ackMsg.setQueueId(requestHeader.getQueueId());
    ackMsg.setPopTime(ExtraInfoUtil.getPopTime(extraInfo));
    ackMsg.setBrokerName(ExtraInfoUtil.getBrokerName(extraInfo));

    int rqId = ExtraInfoUtil.getReviveQid(extraInfo);

    this.brokerController.getBrokerStatsManager().incBrokerAckNums(1);
    this.brokerController.getBrokerStatsManager().incGroupAckNums(requestHeader.getConsumerGroup(), requestHeader.getTopic(), 1);

    if (rqId == KeyBuilder.POP_ORDER_REVIVE_QUEUE) {
        // ... 顺序消息 ACK
    }

    // 普通消息 ACK
    // 先尝试放入内存匹配，成功则直接返回。失败可能是内存匹配未开启
    if (this.brokerController.getPopMessageProcessor().getPopBufferMergeService().addAk(rqId, ackMsg)) {
        return response;
    }

    // 构造 Ack 消息
    msgInner.setTopic(reviveTopic);
    msgInner.setBody(JSON.toJSONString(ackMsg).getBytes(DataConverter.charset));
    //msgInner.setQueueId(Integer.valueOf(extraInfo[3]));
    msgInner.setQueueId(rqId);
    msgInner.setTags(PopAckConstants.ACK_TAG);
    msgInner.setBornTimestamp(System.currentTimeMillis());
    msgInner.setBornHost(this.brokerController.getStoreHost());
    msgInner.setStoreHost(this.brokerController.getStoreHost());
    // 定时消息，定时到唤醒重试时间投递
    msgInner.setDeliverTimeMs(ExtraInfoUtil.getPopTime(extraInfo) + ExtraInfoUtil.getInvisibleTime(extraInfo));
    msgInner.getProperties().put(MessageConst.PROPERTY_UNIQ_CLIENT_MESSAGE_ID_KEYIDX, PopMessageProcessor.genAckUniqueId(ackMsg));
    msgInner.setPropertiesString(MessageDecoder.messageProperties2String(msgInner.getProperties()));
    // 保存 Ack 消息到磁盘
    PutMessageResult putMessageResult = this.brokerController.getEscapeBridge().putMessageToSpecificQueue(msgInner);
    if (putMessageResult.getPutMessageStatus() != PutMessageStatus.PUT_OK
        && putMessageResult.getPutMessageStatus() != PutMessageStatus.FLUSH_DISK_TIMEOUT
        && putMessageResult.getPutMessageStatus() != PutMessageStatus.FLUSH_SLAVE_TIMEOUT
        && putMessageResult.getPutMessageStatus() != PutMessageStatus.SLAVE_NOT_AVAILABLE) {
        POP_LOGGER.error("put ack msg error:" + putMessageResult);
    }
    return response;
}
```

### 4.4 Broker 端 `CheckPoint` 与 `AckMsg` 匹配

#### 4.4.1 `PopBufferMergeService#addCk`

```java
/**
 * POP 消息后，新增 CheckPoint，放入内存 Buffer
 *
 * @param point
 * @param reviveQueueId
 * @param reviveQueueOffset
 * @param nextBeginOffset
 * @return 是否添加成功
 */
public boolean addCk(PopCheckPoint point, int reviveQueueId, long reviveQueueOffset, long nextBeginOffset) {
    // key: point.getT() + point.getC() + point.getQ() + point.getSo() + point.getPt()
    if (!brokerController.getBrokerConfig().isEnablePopBufferMerge()) {
        return false;
    }
    // 内存匹配服务是否开启
    if (!serving) {
        return false;
    }

    // 距离下次可重试 Pop 消费的时刻 < 4.5s
    long now = System.currentTimeMillis();
    if (point.getReviveTime() - now < brokerController.getBrokerConfig().getPopCkStayBufferTimeOut() + 1500) {
        if (brokerController.getBrokerConfig().isEnablePopLog()) {
            POP_LOGGER.warn("[PopBuffer]add ck, timeout, {}, {}", point, now);
        }
        return false;
    }

    if (this.counter.get() > brokerController.getBrokerConfig().getPopCkMaxBufferSize()) {
        POP_LOGGER.warn("[PopBuffer]add ck, max size, {}, {}", point, this.counter.get());
        return false;
    }

    PopCheckPointWrapper pointWrapper = new PopCheckPointWrapper(reviveQueueId, reviveQueueOffset, point, nextBeginOffset);

    if (!checkQueueOk(pointWrapper)) {
        return false;
    }

    // 将 CheckPoint 放入 Offset 队列
    putOffsetQueue(pointWrapper);
    // 将 CheckPoint 放入内存 Buffer
    this.buffer.put(pointWrapper.getMergeKey(), pointWrapper);
    this.counter.incrementAndGet();
    if (brokerController.getBrokerConfig().isEnablePopLog()) {
        POP_LOGGER.info("[PopBuffer]add ck, {}", pointWrapper);
    }
    return true;
}
```

#### 4.4.2 `PopBufferMergeService#addAk`

```java
/**
 * 消息 ACK，与内存中的 CheckPoint 匹配
 *
 * @param reviveQid
 * @param ackMsg
 * @return 是否匹配成功
 */
public boolean addAk(int reviveQid, AckMsg ackMsg) {
    // 如果未开启内存匹配，直接返回
    if (!brokerController.getBrokerConfig().isEnablePopBufferMerge()) {
        return false;
    }
    if (!serving) {
        return false;
    }
    try {
        // 根据 ACK 的消息找到内存 Buffer 中的 CheckPoint
        PopCheckPointWrapper pointWrapper = this.buffer.get(ackMsg.getTopic() + ackMsg.getConsumerGroup() + ackMsg.getQueueId() + ackMsg.getStartOffset() + ackMsg.getPopTime() + ackMsg.getBrokerName());
        if (pointWrapper == null) {
            // 找不到 CheckPoint
            if (brokerController.getBrokerConfig().isEnablePopLog()) {
                POP_LOGGER.warn("[PopBuffer]add ack fail, rqId={}, no ck, {}", reviveQid, ackMsg);
            }
            return false;
        }

        // 内存中仅保存 Offset，实际已经保存到磁盘，内存中不处理 ACK 消息的匹配，直接返回
        if (pointWrapper.isJustOffset()) {
            return false;
        }

        PopCheckPoint point = pointWrapper.getCk();
        long now = System.currentTimeMillis();

        if (point.getReviveTime() - now < brokerController.getBrokerConfig().getPopCkStayBufferTimeOut() + 1500) {
            if (brokerController.getBrokerConfig().isEnablePopLog()) {
                POP_LOGGER.warn("[PopBuffer]add ack fail, rqId={}, almost timeout for revive, {}, {}, {}", reviveQid, pointWrapper, ackMsg, now);
            }
            return false;
        }

        if (now - point.getPopTime() > brokerController.getBrokerConfig().getPopCkStayBufferTime() - 1500) {
            if (brokerController.getBrokerConfig().isEnablePopLog()) {
                POP_LOGGER.warn("[PopBuffer]add ack fail, rqId={}, stay too long, {}, {}, {}", reviveQid, pointWrapper, ackMsg, now);
            }
            return false;
        }

        // 标记该 CheckPoint 已经被 ACK
        int indexOfAck = point.indexOfAck(ackMsg.getAckOffset());
        if (indexOfAck > -1) {
            // 设置 CheckPoint 中被 Ack 消息的 bit 码表为 1
            markBitCAS(pointWrapper.getBits(), indexOfAck);
        } else {
            POP_LOGGER.error("[PopBuffer]Invalid index of ack, reviveQid={}, {}, {}", reviveQid, ackMsg, point);
            return true;
        }

        return true;
    } catch (Throwable e) {
        POP_LOGGER.error("[PopBuffer]add ack error, rqId=" + reviveQid + ", " + ackMsg, e);
    }

    return false;
}
```

#### 4.4.3 `PopBufferMergeService#scan`

```java
/**
 * 扫描内存中的 CheckPoint
 * 把已经匹配或存盘的 CheckPoint 移出 buffer
 * 把已经全部 Ack 的 CheckPoint 存盘
 */
private void scan() {
    long startTime = System.currentTimeMillis();
    int count = 0, countCk = 0;
    Iterator<Map.Entry<String, PopCheckPointWrapper>> iterator = buffer.entrySet().iterator();
    // 遍历所有内存中的 CheckPoint
    while (iterator.hasNext()) {
        Map.Entry<String, PopCheckPointWrapper> entry = iterator.next();
        PopCheckPointWrapper pointWrapper = entry.getValue();

        // 如果 CheckPoint 已经在磁盘中，或者全部消息都匹配成功，从内存中 buffer 中移除
        // just process offset(already stored at pull thread), or buffer ck(not stored and ack finish)
        if (pointWrapper.isJustOffset() && pointWrapper.isCkStored() || isCkDone(pointWrapper)
            || isCkDoneForFinish(pointWrapper) && pointWrapper.isCkStored()) {
            iterator.remove();
            counter.decrementAndGet();
            continue;
        }

        PopCheckPoint point = pointWrapper.getCk();
        long now = System.currentTimeMillis();

        // 是否要从内存中移除 CheckPoint
        boolean removeCk = !this.serving;
        // 距离 ReviveTime 时间小于阈值（默认3s）
        // ck will be timeout
        if (point.getReviveTime() - now < brokerController.getBrokerConfig().getPopCkStayBufferTimeOut()) {
            removeCk = true;
        }

        // 在内存中时间大于阈值（默认10s）
        // the time stayed is too long
        if (now - point.getPopTime() > brokerController.getBrokerConfig().getPopCkStayBufferTime()) {
            removeCk = true;
        }

        if (now - point.getPopTime() > brokerController.getBrokerConfig().getPopCkStayBufferTime() * 2L) {
            POP_LOGGER.warn("[PopBuffer]ck finish fail, stay too long, {}", pointWrapper);
        }

        // double check
        if (isCkDone(pointWrapper)) {
            continue;
        } else if (pointWrapper.isJustOffset()) {
            // just offset should be in store.
            if (pointWrapper.getReviveQueueOffset() < 0) {
                putCkToStore(pointWrapper, false);
                countCk++;
            }
            continue;
        } else if (removeCk) {
            // 将 CheckPoint 包装成消息放入磁盘，从内存中移除
            // put buffer ak to store
            if (pointWrapper.getReviveQueueOffset() < 0) {
                putCkToStore(pointWrapper, false);
                countCk++;
            }

            if (!pointWrapper.isCkStored()) {
                continue;
            }

            // 在内存中移除 CheckPoint 前，把它当中已经 Ack 的消息也作为 Ack 消息存入磁盘
            for (byte i = 0; i < point.getNum(); i++) {
                // 遍历 CheckPoint 中消息 bit 码表每一位，检查是否已经 Ack 并且没有存入磁盘
                // reput buffer ak to store
                if (DataConverter.getBit(pointWrapper.getBits().get(), i)
                    && !DataConverter.getBit(pointWrapper.getToStoreBits().get(), i)) {
                    if (putAckToStore(pointWrapper, i)) {
                        count++;
                        markBitCAS(pointWrapper.getToStoreBits(), i);
                    }
                }
            }

            if (isCkDoneForFinish(pointWrapper) && pointWrapper.isCkStored()) {
                if (brokerController.getBrokerConfig().isEnablePopLog()) {
                    POP_LOGGER.info("[PopBuffer]ck finish, {}", pointWrapper);
                }
                iterator.remove();
                counter.decrementAndGet();
                continue;
            }
        }
    }

    // 扫描已经完成的 CheckPoint，为它们提交消息消费进度
    int offsetBufferSize = scanCommitOffset();

    scanTimes++;

    if (scanTimes >= countOfMinute1) {
        counter.set(this.buffer.size());
        scanTimes = 0;
    }
}
```

---

#### 4.4.4 `PopReviveService#consumeReviveMessage`

```java
/**
 * 消费 Revive Topic 中的消息，匹配 ACK 消息和 CheckPoint
 * CK 消息放到 Map 中，ACK 消息根据 Map key 匹配 CK 消息，更新 CK 消息的码表以完成 ACK
 * 只对 CK 进行标记
 * 消费时间差 2s 内的 CK、ACK 消息，或 4s 没有消费到新消息
 *
 * @param consumeReviveObj CK 与 ACK 匹配对象，用于 Revive 需要重试 Pop 消费的消息
 */
protected void consumeReviveMessage(ConsumeReviveObj consumeReviveObj) {
    // CheckPoint 匹配 map，key = point.getTopic() + point.getCId() + point.getQueueId() + point.getStartOffset() + point.getPopTime()
    HashMap<String, PopCheckPoint> map = consumeReviveObj.map;
    long startScanTime = System.currentTimeMillis();
    long endTime = 0;
    // 查询 ReviveTopic queue 之前的消费进度
    long oldOffset = this.brokerController.getConsumerOffsetManager().queryOffset(PopAckConstants.REVIVE_GROUP, reviveTopic, queueId);
    consumeReviveObj.oldOffset = oldOffset;
    POP_LOGGER.info("reviveQueueId={}, old offset is {} ", queueId, oldOffset);
    long offset = oldOffset + 1;
    // 没有查询到消息的次数
    int noMsgCount = 0;
    long firstRt = 0;
    // offset self amend
    while (true) {
        if (!shouldRunPopRevive) {
            POP_LOGGER.info("slave skip scan , revive topic={}, reviveQueueId={}", reviveTopic, queueId);
            break;
        }
        // 查询一批 Revive Topic 中的消息（32条）
        List<MessageExt> messageExts = getReviveMessage(offset, queueId);
        if (messageExts == null || messageExts.isEmpty()) {
            long old = endTime;
            long timerDelay = brokerController.getMessageStore().getTimerMessageStore().getReadBehind();
            long commitLogDelay = brokerController.getMessageStore().getTimerMessageStore().getEnqueueBehind();
            // move endTime
            if (endTime != 0 && System.currentTimeMillis() - endTime > 3 * PopAckConstants.SECOND && timerDelay <= 0 && commitLogDelay <= 0) {
                endTime = System.currentTimeMillis();
            }
            POP_LOGGER.info("reviveQueueId={}, offset is {}, can not get new msg, old endTime {}, new endTime {}",
                            queueId, offset, old, endTime);
            // 最后一个 CK 的唤醒时间与第一个 CK 的唤醒时间差大于 2s，中断消费
            if (endTime - firstRt > PopAckConstants.ackTimeInterval + PopAckConstants.SECOND) {
                break;
            }
            noMsgCount++;
            // Fixme: why sleep is useful here?
            try {
                Thread.sleep(100);
            } catch (Throwable ignore) {
            }
            // 连续 4s 没有消费到新的消息，中断消费
            if (noMsgCount * 100L > 4 * PopAckConstants.SECOND) {
                break;
            } else {
                continue;
            }
        } else {
            noMsgCount = 0;
        }
        if (System.currentTimeMillis() - startScanTime > brokerController.getBrokerConfig().getReviveScanTime()) {
            POP_LOGGER.info("reviveQueueId={}, scan timeout  ", queueId);
            break;
        }
        // 遍历查询到的消息
        for (MessageExt messageExt : messageExts) {
            if (PopAckConstants.CK_TAG.equals(messageExt.getTags())) {
                // 如果是 CheckPoint
                String raw = new String(messageExt.getBody(), DataConverter.charset);
                if (brokerController.getBrokerConfig().isEnablePopLog()) {
                    POP_LOGGER.info("reviveQueueId={},find ck, offset:{}, raw : {}", messageExt.getQueueId(), messageExt.getQueueOffset(), raw);
                }
                PopCheckPoint point = JSON.parseObject(raw, PopCheckPoint.class);
                if (point.getTopic() == null || point.getCId() == null) {
                    continue;
                }
                // 放入 HashMap，等待 ACK 消息匹配
                map.put(point.getTopic() + point.getCId() + point.getQueueId() + point.getStartOffset() + point.getPopTime(), point);
                // 设置 reviveOffset 为 revive 队列中消息的逻辑 offset
                point.setReviveOffset(messageExt.getQueueOffset());
                if (firstRt == 0) {
                    firstRt = point.getReviveTime();
                }
            } else if (PopAckConstants.ACK_TAG.equals(messageExt.getTags())) {
                // 如果是 ACK 消息
                String raw = new String(messageExt.getBody(), DataConverter.charset);
                if (brokerController.getBrokerConfig().isEnablePopLog()) {
                    POP_LOGGER.info("reviveQueueId={},find ack, offset:{}, raw : {}", messageExt.getQueueId(), messageExt.getQueueOffset(), raw);
                }
                AckMsg ackMsg = JSON.parseObject(raw, AckMsg.class);
                PopCheckPoint point = map.get(ackMsg.getTopic() + ackMsg.getConsumerGroup() + ackMsg.getQueueId() + ackMsg.getStartOffset() + ackMsg.getPopTime());
                if (point == null) {
                    continue;
                }
                // 如果 HashMap 中有 CheckPoint，计算 ACK 的 bit 码表
                int indexOfAck = point.indexOfAck(ackMsg.getAckOffset());
                if (indexOfAck > -1) {
                    // Ack 消息 bit 码表为 1 的位 Ack 成功
                    point.setBitMap(DataConverter.setBit(point.getBitMap(), indexOfAck, true));
                } else {
                    POP_LOGGER.error("invalid ack index, {}, {}", ackMsg, point);
                }
            }
            long deliverTime = messageExt.getDeliverTimeMs();
            if (deliverTime > endTime) {
                endTime = deliverTime;
            }
        }
        offset = offset + messageExts.size();
    }
    consumeReviveObj.endTime = endTime;
}
```

#### 4.4.5 `PopReviveService#mergeAndRevive`

```java
/**
 * 匹配消费到的一批 CK 和 ACK 消息，对于没有成功 ACK 的消息，重发到重试 Topic
 */
protected void mergeAndRevive(ConsumeReviveObj consumeReviveObj) throws Throwable {
    // 获取排序后的 CheckPoint 列表
    ArrayList<PopCheckPoint> sortList = consumeReviveObj.genSortList();
	// ...
    long newOffset = consumeReviveObj.oldOffset;
    for (PopCheckPoint popCheckPoint : sortList) {
        // ...
        // 如果没有到 Revive 时间，跳过
        if (consumeReviveObj.endTime - popCheckPoint.getReviveTime() <= (PopAckConstants.ackTimeInterval + PopAckConstants.SECOND)) {
            break;
        }

        // 从 CK 中解析原 Topic 并检查该 Topic 是否存在，如果不存在则跳过
        // check normal topic, skip ck , if normal topic is not exist
        String normalTopic = KeyBuilder.parseNormalTopic(popCheckPoint.getTopic(), popCheckPoint.getCId());
        if (brokerController.getTopicConfigManager().selectTopicConfig(normalTopic) == null) {
            POP_LOGGER.warn("reviveQueueId={},can not get normal topic {} , then continue ", queueId, popCheckPoint.getTopic());
            newOffset = popCheckPoint.getReviveOffset();
            continue;
        }
        if (null == brokerController.getSubscriptionGroupManager().findSubscriptionGroupConfig(popCheckPoint.getCId())) {
            POP_LOGGER.warn("reviveQueueId={},can not get cid {} , then continue ", queueId, popCheckPoint.getCId());
            newOffset = popCheckPoint.getReviveOffset();
            continue;
        }

        // 重发 CK 中没有 Ack 的所有消息
        reviveMsgFromCk(popCheckPoint);

        newOffset = popCheckPoint.getReviveOffset();
    }
    // 匹配和重试完成后，更新 ReviveTopic 消费进度
    if (newOffset > consumeReviveObj.oldOffset) {
        if (!shouldRunPopRevive) {
            POP_LOGGER.info("slave skip commit, revive topic={}, reviveQueueId={}", reviveTopic, queueId);
            return;
        }
        this.brokerController.getConsumerOffsetManager().commitOffset(PopAckConstants.LOCAL_HOST, PopAckConstants.REVIVE_GROUP, reviveTopic, queueId, newOffset);
    }
    consumeReviveObj.newOffset = newOffset;
}
```

#### 4.4.6 `PopReviveService`: 重试消息

```java
/**
 * 重发 CK 中没有 Ack 的所有消息
 */
private void reviveMsgFromCk(PopCheckPoint popCheckPoint) throws Throwable {
    // 遍历 CK 中的所有消息
    for (int j = 0; j < popCheckPoint.getNum(); j++) {
        if (DataConverter.getBit(popCheckPoint.getBitMap(), j)) {
            continue;
        }

        // retry msg
        long msgOffset = popCheckPoint.ackOffsetByIndex((byte) j);
        // 查询 CK 消息对应的真正消息
        MessageExt messageExt = getBizMessage(popCheckPoint.getTopic(), msgOffset, popCheckPoint.getQueueId(), popCheckPoint.getBrokerName());
        if (messageExt == null) {
            POP_LOGGER.warn("reviveQueueId={},can not get biz msg topic is {}, offset is {} , then continue ",
                            queueId, popCheckPoint.getTopic(), msgOffset);
            continue;
        }
        //skip ck from last epoch
        if (popCheckPoint.getPopTime() < messageExt.getStoreTimestamp()) {
            POP_LOGGER.warn("reviveQueueId={},skip ck from last epoch {}", queueId, popCheckPoint);
            continue;
        }
        // 唤醒没有被 ACK 的消息，发到重试队列
        reviveRetry(popCheckPoint, messageExt);
    }
}

/**
 * 根据 CheckPoint 唤醒没有被 ACK 的消息，发到重试队列
 *
 * @param popCheckPoint CK
 * @param messageExt 要被重试的消息
 * @throws Exception
 */
private void reviveRetry(PopCheckPoint popCheckPoint, MessageExt messageExt) throws Exception {
    if (!shouldRunPopRevive) {
        POP_LOGGER.info("slave skip retry , revive topic={}, reviveQueueId={}", reviveTopic, queueId);
        return;
    }
    // 构造新的消息
    MessageExtBrokerInner msgInner = new MessageExtBrokerInner();
    // 唤醒的消息发到重试 Topic
    if (!popCheckPoint.getTopic().startsWith(MixAll.RETRY_GROUP_TOPIC_PREFIX)) {
        msgInner.setTopic(KeyBuilder.buildPopRetryTopic(popCheckPoint.getTopic(), popCheckPoint.getCId()));
    } else {
        msgInner.setTopic(popCheckPoint.getTopic());
    }
    msgInner.setBody(messageExt.getBody());
    msgInner.setQueueId(0);
    if (messageExt.getTags() != null) {
        msgInner.setTags(messageExt.getTags());
    } else {
        MessageAccessor.setProperties(msgInner, new HashMap<String, String>());
    }
    msgInner.setBornTimestamp(messageExt.getBornTimestamp());
    msgInner.setBornHost(brokerController.getStoreHost());
    msgInner.setStoreHost(brokerController.getStoreHost());
    // 重试次数 += 1
    msgInner.setReconsumeTimes(messageExt.getReconsumeTimes() + 1);
    msgInner.getProperties().putAll(messageExt.getProperties());
    if (messageExt.getReconsumeTimes() == 0 || msgInner.getProperties().get(MessageConst.PROPERTY_FIRST_POP_TIME) == null) {
        msgInner.getProperties().put(MessageConst.PROPERTY_FIRST_POP_TIME, String.valueOf(popCheckPoint.getPopTime()));
    }
    msgInner.setPropertiesString(MessageDecoder.messageProperties2String(msgInner.getProperties()));
    // 添加 Pop 重试 Topic
    addRetryTopicIfNoExit(msgInner.getTopic(), popCheckPoint.getCId());
    // 保存重试消息到存储
    PutMessageResult putMessageResult = brokerController.getEscapeBridge().putMessageToSpecificQueue(msgInner);
    if (brokerController.getBrokerConfig().isEnablePopLog()) {
        POP_LOGGER.info("reviveQueueId={},retry msg , ck={}, msg queueId {}, offset {}, reviveDelay={}, result is {} ",
                        queueId, popCheckPoint, messageExt.getQueueId(), messageExt.getQueueOffset(),
                        (System.currentTimeMillis() - popCheckPoint.getReviveTime()) / 1000, putMessageResult);
    }
    if (putMessageResult.getAppendMessageResult() == null || putMessageResult.getAppendMessageResult().getStatus() != AppendMessageStatus.PUT_OK) {
        throw new Exception("reviveQueueId=" + queueId + ",revive error ,msg is :" + msgInner);
    }
    // ... 更新统计数据
    if (brokerController.getPopMessageProcessor() != null) {
        brokerController.getPopMessageProcessor().notifyMessageArriving(
            KeyBuilder.parseNormalTopic(popCheckPoint.getTopic(), popCheckPoint.getCId()),
            popCheckPoint.getCId(),
            -1
        );
    }
}
```



## 参考资料

* [[RIP 19] Server side rebalance, lightweight consumer client support](https://github.com/apache/rocketmq/wiki/%5BRIP-19%5D-Server-side-rebalance,--lightweight-consumer-client-support)
* [RocketMQ 5.0 POP 消费模式探秘](https://developer.aliyun.com/article/801815)



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
