---
title: RocketMQ 消费者（2）客户端设计和启动流程详解 & 源码解析
author: Scarb
date: 2022-08-27
---

# RocketMQ 消费者（2）客户端设计和启动流程详解 & 源码解析

## 1. 背景

本文是 RocketMQ 消费者系列的第二篇，介绍消费者相关类与调用关系，同时包含消费者启动流程。
看完本文能够对消息消费涉及到的相关类和消费流程有大体的了解。

## 2. 概要设计

### 2.1 消费者客户端设计

先看一下 RocketMQ 客户端代码中消费者相关的类图。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312698290.png)

其中 `DefaultMQPullConsumer` 和 `DefaultMQPushConsumer` 就是我们实际消费中需要新建的消费者对象。它们分别实现了消费者接口，扩展了客户端配置类。

新建 `DefaultXXXXConsumer` 对象时会在内部一个创建 `DefaultMQXXXXConsumerImpl` 对象。这里使用了代理模式，`DefaultXXXXConsumer` 对象只是一个壳，内部的大部分方法都通过调用代理 `DefaultMQXXXXConsumerImpl` 来执行。

`DefaultMQXXXXConsumerImpl` 实现类中包含了客户端实例 `MQClientInstnace` ，每个客户端进程一般只有一个这玩意。它的用处很多，比如保存路由和客户端信息，向 Broker 发送请求等。

### 2.2 消费者客户端启动

消费者的启动主要涉及上面讲到的 `DefaultMQXXXXConsumer`、`DefaultMQXXXXConsumerImpl` 和 `MQClientInstnace` 这三个类。

#### 2.2.1 新建消费者

* 新建消费者时构造 `DefaultMQXXXXConsumer` 对象，指定队列负载算法，内部构造一个 `DefaultMQXXXXConsumerImpl` 对象。

* `DefaultMQXXXXConsumerImpl` 设为刚创建状态，并新建重平衡服务 `RebalanceService`

* 在首次启动前，`DefaultMQXXXXConsumerImpl` 对象中的 `MQClientInstance` 对象还没有被创建出来。

#### 2.2.2 消费者启动

* 启动命令也是在 `DefaultMQXXXXConsumer` 调用并代理到 `DefaultMQXXXXConsumerImpl`。

* 此时  `DefaultMQXXXXConsumerImpl` 会初始化一些服务和参数，然后创建一个 `MQClientInstance` 对象。
* `MQClientInstance` 对象启动客户端的各种服务（Broker 通信、定时任务、消息拉取、重平衡……）

## 3. 详细设计

### 3.1 消费者客户端类设计

#### 3.1.1 整体类图

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312698325.png)

---

#### 3.1.2 消费者接口

由于需要支持拉和推两种消费模式，所以按通常的想法，消费者类的设计中将会有一个**消费者接口**，然后**推消费者**和**拉消费者接口**分别扩展**消费者接口**。消费者接口提供一些共用方法，拉和推消费者实现拉消费和推消费方法。RocketMQ 就是这样做的。其中 MQConsumer 即消费者接口，扩展 MQAdmin 在这显得有些多余。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202208170017865.png)

* MQAdmin 接口提供了客户端的一些基本的管理接口，生产者、消费者和命令工具都扩展了它。
* MQConsumer 接口很简单，主要提供了通过 Topic 获取读队列的方法 `Set<MessageQueue> fetchSubscribeMessageQueues(final String topic)`。

---

#### 3.1.3 拉 & 推模式消费者接口

接下来是拉消费者和推消费者接口。

如果我们自己来设计拉 & 推模式消费者接口，需要定义哪些方法？可以想象一下消费时要做的操作，就可以定义出相应的方法。

* 拉模式消费者的消费步骤为：拉取消息，执行消费逻辑，上报消费进度，如果有需要的话对于消费失败的消息还需要发回 Broker 重新消费。
* 推模式消费者消费步骤更简单，只需要订阅一个 Topic，然后指定消费回调函数，即可在收到消息时自动消费。

RocketMQ 的拉 & 推模式消费者接口就定义了这些方法，先来看一下类图：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202208170023801.png)

**MQPullConsumer**

* `void registerMessageQueueListener(final String topic, final MessageQueueListener listener)` 方法注册消息队列变更时的回调方法。
* `PullResult pull` 从 RocketMQ 服务器拉取一批消息。
  * MessageQueue：拉取的队列
  * MessageSelector：消息过滤器
  * offset：拉取的消息在消费队列中的偏移量
  * maxNums：最大拉取消息条数
  * timeout：拉取超时时间
* `void pull` 为异步拉取方法，拉取成功后调用 `PullCallback`
* `updateConsumeOffset` 更新消息消费偏移量
* `fetchConsumeOffset` 获取消息消费偏移量
* `sendMessageBack` 对于消费失败的消息，发回 Broker 重新消费

**MQPushConsumer**

* `subscribe`：订阅主题，订阅之后可以收到来自该主题的消息。
  * topic：订阅的主题，可以多次调用该方法来订阅多个主题
  * subExpression：消息过滤表达式
  * messageSelector：消息选择器，提供了 SQL92 和 Tag 模式的过滤选择功能
* `unsubscribe`：取消订阅
* `registerMessageListener`：用来注册消费监听器，包含两种消费模式：并发消费和顺序消费

#### 3.1.4 消费者实现

 `DefaultMQXXXXConsumer` 是拉消费者接口 `MQXXXXConsumer` 的默认实现。这里用到了代理模式，将具体的方法实现都实现在 `DefaultMQXXXXConsumerImpl` 中，`DefaultMQXXXXConsumer` 保存了一个 `DefaultMQXXXXConsumerImpl` 的代理。

`DefaultMQXXXXConsumerImpl` 实现了 `MQConsumerInner` 接口，提供了消费者实现的一些公用方法。

`DefaultMQXXXXConsumerImpl` 中有一个客户端实例的引用 `MQClientInstance mqClientFactory`，用来与 Broker 通信、保存元数据。

MQClientInstnace：客户端实例，每个客户端进程一般只有一个这玩意。它的用处很多，很多操作最终都是调用它来做的。

* 保存路由信息
* 保存生产者消费者组信息
* 向 Broker 发送请求
* 启动重平衡

#### 3.1.5 推模式消费者实现

拉模式消费者需要手动拉取消息进行消费，平平无奇。推模式消费者自动监听推送过来的消息并进行消费，着重讲解。

推模式消费者实际内部也是通过拉取消息的方式进行消息拉取，只不过封装了订阅和监听器这样的对外接口，让用户在使用时感觉像 Broker 主动推送消息到消费者。

在拉消费者背后，有一个线程默默主动拉取消息，才能将拉转换为推，它就是 `PullMessageService`。此外，推消费者还支持并发消费和顺序消费，RocketMQ 定义了 `ConsumeMessageService` 接口来执行消息消费，`ConsumeMessageConcurrentlyService` 和  `ConsumeMessageOrderlyService` 分别是并发消费和顺序消费的实现。它们内部都定义了一个消费线程池 `consumeExecutor` 来执行最终的消息消费逻辑。而用户真正编写的只有最终的消费逻辑，即实现 `MessageListener` 接口的 `consumeMessage` 方法。

推模式消费者实现相关的类图如下所示：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312698381.png)

在图中，展示了消息消费整个流程的调用关系。在系列后面的文章中会详细讲解。

1. 客户端实例中的重平衡服务进行重平衡，生成一个 `PullRequest` 并调用拉消费者实现类的 `executePullRequestImmediately` 方法
2. `DefaultMQPushConsumerImpl` 调用 `PullMessageService` 线程的 `executePullRequestImmediately` 方法，
3. 该方法将 `PullRequest` 放入待执行的拉取请求队列
4. `PullMessageService` 线程阻塞等待请求队列中的拉取请求
5. 收到拉去请求 `PullRequest` 后就执行拉取消息拉取方法 `pullMessage` 从 Broker 拉取消息，拉取后执行消费消息逻辑
6. 消费消息逻辑会调用 `ConsumeMessageService` 的 `submitConsumeRequest` 方法
7. 该方法将消费消息的请求提交到消费线程池 `consumeExecutor`
8. 消费线程池执行真正的消息消费逻辑，调用 `MessageListener` 接口的 `consumeMessage` 方法
9. 拉取一批消息成功后，将拉取请求 `PullRequest` 的拉取偏移量更新后再次调用 `executePullRequestImmediately` 方法，放入拉取队列，重新拉取

### 3.2 消费者启动

由于拉模式和推模式消费者的启动流程大致相同，所以只介绍推模式消费者的启动流程。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2022/09/1662312698774.png)

`DefaultMQPushConsumer` 的启动方法内部实际是调用其代理类 `DefaultMQPushConsumerImpl` 的启动方法，他本身的启动方法并没有什么逻辑。

`DefaultMQPushConsumerImpl` 的启动方法执行的动作如下：

1. 检查是否是刚创建状态，如果是才继续走启动流程
2. 检查消费者配置信息是否合法
3. 将用户的 Topic 订阅信息和重试 Topic 的订阅信息添加到 `rebalanceImpl` 中的 Map 中
4. 创建和初始化一些对象
   1. 创建或获取已经创建的客户端实例 `MQClientInstance`
   2. 初始化消费者的重平衡实现 `RebalanceImpl`
   3. 创建拉取消息接口调用包装类 `PullApiWrapper`
   4. 注册消息过滤钩子函数列表（如果有的话）
5. 初始化消费进度
   * 广播模式，消费进度保存在消费者本地 `LocalFileOffsetStore`
   * 集群模式，消费进度保存在 Broker `RemoteBrokerOffsetStore`
6. 初始化消息消费服务，消费服务内部维护一个线程池，负责消息消费
7. 将消费者注册到客户端实例对象
8. 启动客户端实例对象
9. 从 Name server 更新 Topic 路由信息（如果路由信息有变化）
10. 将客户端的信息（ID、生产者、消费者信息）上报给 Broker
11. 唤醒重平衡线程 `RebalanceService` 立即执行重平衡
12. 重平衡后调用拉取消息方法，生成拉取请求 `PullRequest` 并放入 `PullMessageService`，开始消费流程

客户端实例 `MQClientInstance` 的启动流程如下：

1. 更新 Namesrv 地址
2. 启动通信模块 `MQClientAPIImpl`
3. 启动定时任务（从 Namesrv 拉取路由、向 Broker 发送心跳等）
4. 启动拉取消息服务 `PullMessageService`
5. 启动重平衡线程 `RebalanceService`
6. 启动默认生产者（用于将消费失败的消息重新生产到 Broker）

## 4. 源码解析

### 4.1 `DefaultMQProducerImpl` 启动

```java
// DefaultMQProducerImpl
/**
 * Push 消费者启动
 *
 * @throws MQClientException
 */
public synchronized void start() throws MQClientException {
    switch (this.serviceState) {
            // 检查消费者状态。只有第一次启动才执行，如果二次调用 start 方法会报错
        case CREATE_JUST:
            log.info("the consumer [{}] start beginning. messageModel={}, isUnitMode={}", this.defaultMQPushConsumer.getConsumerGroup(),
                     this.defaultMQPushConsumer.getMessageModel(), this.defaultMQPushConsumer.isUnitMode());
            this.serviceState = ServiceState.START_FAILED;

            // 检查消费者配置是否合法
            this.checkConfig();

            // 将用户的 Topic 订阅信息和重试 Topic 的订阅信息添加到 RebalanceImpl 的容器中
            this.copySubscription();

            if (this.defaultMQPushConsumer.getMessageModel() == MessageModel.CLUSTERING) {
                this.defaultMQPushConsumer.changeInstanceNameToPID();
            }

            // 创建客户端实例
            this.mQClientFactory = MQClientManager.getInstance().getOrCreateMQClientInstance(this.defaultMQPushConsumer, this.rpcHook);

            // 初始化 RebalanceImpl
            this.rebalanceImpl.setConsumerGroup(this.defaultMQPushConsumer.getConsumerGroup());
            this.rebalanceImpl.setMessageModel(this.defaultMQPushConsumer.getMessageModel());
            this.rebalanceImpl.setAllocateMessageQueueStrategy(this.defaultMQPushConsumer.getAllocateMessageQueueStrategy());
            this.rebalanceImpl.setmQClientFactory(this.mQClientFactory);

            // 创建拉取消息接口调用包装类
            this.pullAPIWrapper = new PullAPIWrapper(
                mQClientFactory,
                this.defaultMQPushConsumer.getConsumerGroup(), isUnitMode());
            // 注册消息过滤钩子函数列表
            this.pullAPIWrapper.registerFilterMessageHook(filterMessageHookList);

            // 初始化消费进度
            if (this.defaultMQPushConsumer.getOffsetStore() != null) {
                this.offsetStore = this.defaultMQPushConsumer.getOffsetStore();
            } else {
                switch (this.defaultMQPushConsumer.getMessageModel()) {
                    case BROADCASTING:
                        // 广播模式，消费进度保存在消费者本地
                        this.offsetStore = new LocalFileOffsetStore(this.mQClientFactory, this.defaultMQPushConsumer.getConsumerGroup());
                        break;
                    case CLUSTERING:
                        // 集群模式，消费进度保存在 Broker
                        this.offsetStore = new RemoteBrokerOffsetStore(this.mQClientFactory, this.defaultMQPushConsumer.getConsumerGroup());
                        break;
                    default:
                        break;
                }
                this.defaultMQPushConsumer.setOffsetStore(this.offsetStore);
            }
            this.offsetStore.load();

            // 初始化消息消费服务
            if (this.getMessageListenerInner() instanceof MessageListenerOrderly) {
                this.consumeOrderly = true;
                this.consumeMessageService =
                    new ConsumeMessageOrderlyService(this, (MessageListenerOrderly) this.getMessageListenerInner());
            } else if (this.getMessageListenerInner() instanceof MessageListenerConcurrently) {
                this.consumeOrderly = false;
                this.consumeMessageService =
                    new ConsumeMessageConcurrentlyService(this, (MessageListenerConcurrently) this.getMessageListenerInner());
            }

            this.consumeMessageService.start();

            // 注册消费者到客户端实例
            boolean registerOK = mQClientFactory.registerConsumer(this.defaultMQPushConsumer.getConsumerGroup(), this);
            if (!registerOK) {
                this.serviceState = ServiceState.CREATE_JUST;
                this.consumeMessageService.shutdown(defaultMQPushConsumer.getAwaitTerminationMillisWhenShutdown());
                throw new MQClientException("The consumer group[" + this.defaultMQPushConsumer.getConsumerGroup()
                                            + "] has been created before, specify another name please." + FAQUrl.suggestTodo(FAQUrl.GROUP_NAME_DUPLICATE_URL),
                                            null);
            }

            // 启动客户端实例
            mQClientFactory.start();
            log.info("the consumer [{}] start OK.", this.defaultMQPushConsumer.getConsumerGroup());
            this.serviceState = ServiceState.RUNNING;
            break;
        case RUNNING:
        case START_FAILED:
        case SHUTDOWN_ALREADY:
            throw new MQClientException("The PushConsumer service state not OK, maybe started once, "
                                        + this.serviceState
                                        + FAQUrl.suggestTodo(FAQUrl.CLIENT_SERVICE_NOT_OK),
                                        null);
        default:
            break;
    }

    // 从 Namesrv 更新路由信息
    this.updateTopicSubscribeInfoWhenSubscriptionChanged();
    this.mQClientFactory.checkClientInBroker();
    // 将客户端信息上报给 Broker
    this.mQClientFactory.sendHeartbeatToAllBrokerWithLock();
    // 唤醒重平衡线程，立即执行重平衡
    this.mQClientFactory.rebalanceImmediately();
}
```

### 4.2 `MQClientInstance` 启动

```java
// MQClientInstance.java
/**
 * 启动客户端代理
 *
 * @throws MQClientException
 */
public void start() throws MQClientException {

    synchronized (this) {
        switch (this.serviceState) {
            case CREATE_JUST:
                this.serviceState = ServiceState.START_FAILED;
                // If not specified,looking address from name server
                if (null == this.clientConfig.getNamesrvAddr()) {
                    this.mQClientAPIImpl.fetchNameServerAddr();
                }
                // 启动通信模块
                this.mQClientAPIImpl.start();
                // 启动定时任务（从 Namesrv 拉取路由、向 Broker 发送心跳等）
                this.startScheduledTask();
                // 启动拉取消息服务
                this.pullMessageService.start();
                // 启动重平衡线程
                this.rebalanceService.start();
                // 启动默认生产者（用于将消费失败的消息重新生产到 Broker）
                this.defaultMQProducer.getDefaultMQProducerImpl().start(false);
                log.info("the client factory [{}] start OK", this.clientId);
                this.serviceState = ServiceState.RUNNING;
                break;
            case START_FAILED:
                throw new MQClientException("The Factory object[" + this.getClientId() + "] has been created before, and failed.", null);
            default:
                break;
        }
    }
}
```


---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
