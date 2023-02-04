# 基于 AMQP 实现的 golang 消息队列 MaxQ

## **背景**

饿厂此前一直是重度 rabbitmq 使用者，在使用的过程中遭遇了大量的问题，性能问题、故障排查问题等。Rabbitmq 是用 erlang 开发的，该语言过于小众，实在无力在其之上再做运维和开发。痛定思痛，我们于是决定自研一个消息队列，为了降低业务层的接入难度，所以该消息队列需要兼容 AMQP 协议，这样就可以在业务层完全无感知的情况下接入 MaxQ。

## **什么是 AMQP 协议？**

AMQP(Advanced Message Queuing Protocol)，是一套消息队列的七层应用协议标准，由摩根大通和 iMatrix 在 2004 年开始着手制定，于 2006 年发布规范，目前最新版是 AMQP 1.0，MaxQ 基于 AMQP 0.9.1 实现。相比 zeroMQ 这类无 Broker 的模型，AMQP 是一种有 Broker 的协议模型，也就是需要运行单独 AMQP 中间件服务，生产者客户端和消费者客户端通过 AMQP SDK 与 AMQP 中间件服务通讯。像 kafka、JMS 这类以 topic 为核心的 Broker，生产者发送 key 和数据到 Broker，由 Broker 比较 key 之后决定给那个消费者；而 AMQP 中淡化了 topic 的概念，引入了 Exchange 模型，生产者发送 key 和数据到 Exchange，Exchange 根据消费者订阅 queue 的路由规则路由到对应的 queue，也就是 AMQP 解耦了 key 和 queue，即解藕了生产者和消费者，使得生产者和消费者之间的关系更灵活，消费者可自由控制消费关系。另外，AMQP 是同时支持消息 Push 和 Pull 的模型，对于 Push 模型，消费者还可通过设置 Qos 达到流控的目的。

下图是 AMQP 0.9.1 规范中给出的 AMQP 架构模型图：

![img](https://pic2.zhimg.com/v2-3ec63e2a92022b32cd85265b935c1635_r.jpg)

下面简单介绍下 AMQP 中的一些基本概念：

- Broker：接收和分发消息的应用，MaxQ 就是基于 AMQP 协议实现的 Message Broker。
- Connection：publisher / consumer 和 broker 之间的 TCP 连接。断开连接的操作只会在 client 端进行，Broker 不会断开连接，除非出现网络故障或 broker 服务出现问题。
- Channel：如果客户端每次和 Broker 通信都需要建议一条连接，在并大量连接并发的情况下建立 TCP Connection 的开销将是巨大的，效率也较低。于是，AMQP 引入了 channel 的概念，channel 是 connection 之上应用层建立的逻辑连接，Broker 在实现中可创建单独的 thread / 协程来实现 channel 的并发，AMQP method 包含了 channel id 帮助客户端和 message broker 识别 channel，所以 channel 之间是完全隔离的。Channel 作为轻量级的 Connection 极大减少了操作系统建立 TCP connection 的开销。
- Virtual host：出于多租户和安全因素设计的，把 AMQP 的基本组件划分到一个虚拟的分组中，类似于网络中的 namespace 概念。当多个不同的用户使用同一个 Broker 提供的服务时，可以划分出多个 vhost，每个用户在自己的 vhost 创建 exchange / queue 等。
- Exchange：message 到达 broker 的第一站，根据分发规则，匹配查询表中的 routing key，分发消息到 queue 中去。常用的类型有：direct (point-to-point), topic (publish-subscribe) and fanout (multicast)。
- Queue：消息最终会落到 queue 里，消息会由 Broker push 给消费者，或者消费者主动去 pull queue 上的消息；一个 message 可以被同时分发到多个 queue 中。
- Binding：exchange 和 queue 之间的消息路由策略，binding 中可以包含 routing key。Binding 信息被保存到 exchange 中的路由表中，用于 message 的分发依据。

## **MaxQ - AMQP 实现架构**

![img](https://pic3.zhimg.com/v2-6acb1e89ebb50e8a4707d3cca2bac1be_r.jpg)

MaxQ 对 AMQP 协议的实现，主要做了以下几件事：

**按照协议 spec 自动生产 frame encode/decode，这里采用了 golang 的 text/template 包，将 AMQP spec 抽象成固定的 json 和对应的代码模版，如：**

```json
{
    "id": 50,
    "methods": [{"id": 10,
                 "arguments": [{"type": "short", "name": "ticket", "default-value": 0},
                   {"type": "shortstr", "name": "queue", "default-value": ""},
                               {"type": "bit", "name": "passive", "default-value": false},
                               {"type": "bit", "name": "durable", "default-value": false},
                               {"type": "bit", "name": "exclusive", "default-value": false},
                               {"type": "bit", "name": "auto-delete", "default-value": false},
                               {"type": "bit", "name": "nowait", "default-value": false},
                               {"type": "table", "name": "arguments", "default-value": {}}],
                 "name": "declare",
                 "synchronous" : true},
                {"id": 11,
                 "arguments": [{"type": "shortstr", "name": "queue"},
                               {"type": "long", "name": "message-count"},
                               {"type": "long", "name": "consumer-count"}],
                 "name": "declare-ok"},
                {"id": 20,
                 "arguments": [{"type": "short", "name": "ticket", "default-value": 0},
                               {"type": "shortstr", "name": "queue", "default-value": ""},
                               {"type": "shortstr", "name": "exchange"},
                               {"type": "shortstr", "name": "routing-key", "default-value": ""},
                               {"type": "bit", "name": "nowait", "default-value": false},
                               {"type": "table", "name": "arguments", "default-value": {}}],
                 "name": "bind",
                 "synchronous" : true},
                {"id": 21,
                 "arguments": [],
                 "name": "bind-ok"},
                {"id": 30,
                 "arguments": [{"type": "short", "name": "ticket", "default-value": 0},
                               {"type": "shortstr", "name": "queue", "default-value": ""},
                               {"type": "bit", "name": "nowait", "default-value": false}],
                 "name": "purge",
                 "synchronous" : true},
                {"id": 31,
                 "arguments": [{"type": "long", "name": "message-count"}],
                 "name": "purge-ok"},
                {"id": 40,
                 "arguments": [{"type": "short", "name": "ticket", "default-value": 0},
                               {"type": "shortstr", "name": "queue", "default-value": ""},
                               {"type": "bit", "name": "if-unused", "default-value": false},
                               {"type": "bit", "name": "if-empty", "default-value": false},
                               {"type": "bit", "name": "nowait", "default-value": false}],
                 "name": "delete",
                 "synchronous" : true},
                {"id": 41,
                 "arguments": [{"type": "long", "name": "message-count"}],
                 "name": "delete-ok"},
                {"id": 50,
                 "arguments": [{"type": "short", "name": "ticket", "default-value": 0},
                               {"type": "shortstr", "name": "queue", "default-value": ""},
                               {"type": "shortstr", "name": "exchange"},
                               {"type": "shortstr", "name": "routing-key", "default-value": ""},
                               {"type": "table", "name": "arguments", "default-value": {}}],
                 "name": "unbind",
                 "synchronous" : true},
                {"id": 51,
                 "arguments": [],
                 "name": "unbind-ok"}
                ],
    "name": "queue"
},
```

代码生成模版：

```
type {{$struct}} struct {
    {{range .Fields}}
        {{.Literal}} {{$.TypeOfFieldLiteral .}}
    {{end}}
    {{if .Content}}
        // Content
        properties *Properties
        body []byte
    {{end}}
}
// Name returns the string representation of the Method, implements
// Method.Name().
func (m *{{$struct}}) Name() string {
    return "{{.NameLiteral $class.Name}}"
}
// ID returns the AMQP index number of the Method, implements Method.ID().
func (m *{{$struct}}) ID() uint16 {
    return {{.ID}}
}
// Class returns a instance of the Class of this method, implements Method.Class().
func (m *{{$struct}}) Class() Class {
    return &{{$classStruct}}{}
}
// String returns the string representation for the Method.
func (m *{{$struct}}) String() string {
    return {{.StringLiteral $class.Name}}
}
```

**Vhost API 实现：**

```go
func (v *VHost) QueueDeclare(node, name string, durable, exclusive, autoDelete bool, args amqp.Table) ...
func (v *VHost) QueueInspect(name string) ...
func (v *VHost) QueueBind(name, key, exchange string, args amqp.Table) ...
func (v *VHost) QueueUnbind(name, key, exchange string, args amqp.Table) ...
func (v *VHost) QueuePurge(name string) ...
func (v *VHost) QueueDelete(name string, ifUnused, ifEmpty bool) ...
func (v *VHost) ExchangeDeclare(name string, exType string, durable bool, autoDelete bool, internal bool, arguments amqp.Table)
func (v *VHost) ExchangeDelete(name string, ifUnused bool) ...
func (v *VHost) ExchangeBind(destination, key, source string, args amqp.Table) ...
func (v *VHost) ExchangeUnbind(destination, key, source string, args amqp.Table) ...
func (v *VHost) Publish(exchange, key string, mandatory, immediate bool, props *amqp.Properties, body []byte) 
```

**Exchange 接口化，实现 4 种 Exchange 路由模式**

```go
// Exchange publisher
type publisher interface {
    bind(b *Binding) (exists bool)
    unbind(b *Binding)
    bindingsCount() int
    allBindings() []*Binding
    publish(msg *Message, routingKey string) (count int, err error)
}
 
type directPublisher struct {
 ...
}
  
type fanoutPublisher struct {
 ...
}
  
type topicPublisher struct {
 ...
}
  
type headersPublisher struct {
 ...
}
```

**Queue 接口化——MaxQ 集群**

- Normal Queue: queue 功能的具体实现，包括 Publish、Consume、Cancel、Ack、Get 等，单机版 MaxQ 会实例化此 queue。
- Master Queue: Normal Queue 的超集，集群模式下会实例化此 queue，在 HA 镜像策略下会与 Slave Queue 同步消息。
- Virtual Queue: 负责远程调用 Master Queue 的 API，主要是用作消息转发。
- Slave Queue: Virtual Queue 的超集，除了消息转发，还和 Master Queue 进行消息同步，在 Master Queue down 掉后，会被选取为新的 Master Queue。

## **MaxQ - 生产实现架构**

![img](https://pic2.zhimg.com/v2-761e794dcd16459d282dbd43b497cce5_r.jpg)

如果要将 MaxQ 应用到生产，还需要更多工作要做：

1. MaxQ 集群化，集群间的元数据通过 zookeeper 存储和同步，消息通过 grpc 进行通信。
2. 通过四层 Proxy，生产者或消费者客户端可以采用官方或第三方的 AMQP SDK 与 MaxQ 集群通讯。
3. 集群管理，由于集群信息和元数据信息都存储在 zookeeper 上，因此通过 zookeeper 可以实现集群节点管理、扩容缩容和集群切换；

同时 MaxQ 本身提供了 HTTP API 管理和统计接口，因此可对集群进行监控统计、资源分配等。

## **MaxQ 相关特性**

### 1. 消息可靠性

- Publishing 可靠性，生产者设置 confirm 服务端确认机制，确认服务端成功接收到生产者消息。
- 消息 Routing 可靠性，生产者设置 Publish mandatory，确认消息路由到 queue。
- Consuming 可靠性，消费者设置手工 Ack，服务端在收到消息 Ack 后才清除本地消息。
- Persisting 可靠性， 采用 RAID1 存储持久化消息；
- 分布式下的可靠性，设置 queue 的镜像模式，启动 Slave Queue，与 Master Queue 进行消息同步，在 aster Queue down 掉后，Slave Queue 可被选举为 Master Queue。

### 2. 容错性

- **zookeeper 不可用**

![img](https://pic1.zhimg.com/v2-21ac4b478b38c5417eda6fdcf1c717bc_r.jpg)

1. 元数据已缓存在内存中，不会有任何影响，生产方和消费方仍可正常生产和消费

2. 服务会自动降级，元数据不可变更

3. zookeeper 恢复，服务自愈

- **节点故障**

![img](https://pic4.zhimg.com/v2-d991f545d508615f818719e628225b2f_r.jpg)

通过 zookeeper 进行 Master Queue 选举：

1. NodeA 和 NodeB 收到 NodeC 挂掉的事件，NodeA 和 NodeB 成为 Master queue 的候选节点

2. NodeA 和 NodeB 各自上报同步的 offset 到 zookeeper

3. NodeA 和 NodeB 各自决策，offset 最新的 NodeA 选为 Master queue

4. NodeA 将 Master 信息同步至 zookeeper

5. NodeB 更新新的 Master 信息，并同步数据

6. NodeC 恢复，成为 Slave queue，并与新的 Master 同步数据

- **网络分区**

![img](https://pic2.zhimg.com/v2-27ac4bb4763a13cb8c42edaa9bfdba51_r.jpg)

### 3. 扩展性

![img](https://pic2.zhimg.com/v2-3544b38a13337e996d651c986a8c8609_r.jpg)

1. HA、Exchange 和 Queue 动态扩展属性参数
2. Exchange、Binding、Queue 支持自定义扩展, 如：x-message-ttl、x-expires、x-max-length、x-dead-letter-exchange

## **使用场景和案例**

下面介绍下 MaxQ 作为消息队列的经典三种使用场景和使用案例：

### **1. 异步解耦**

![img](https://pic3.zhimg.com/v2-21df86ddde578b5415bb1b12b9bed80a_r.jpg)

订单系统与消息通知系统解耦

1. 用户订单支付成功，直接向 MaxQ 推送下单成功通知，主流程迅速返回

2. 消息通知系统异步接收通知消息, 发送短信通知或应用通知

### **2. 削峰填谷**

![img](https://pic1.zhimg.com/v2-d9639aa473b173f81a3129f97688c3ac_r.jpg)

SQL-autoreview 系统分析优化 SQL 语句，并将结果落 DB，属于慢消费， 生产高峰期处理能力不够，可利用 MaxQ 的堆积能力，匀速消费和处理。

### **3. 发布订阅**

DC 数据变更发布和订阅

1.DRC 将 DC 的数据变更记录发布至 MaxQ

2. 各业务系统订阅相关的数据变更，并进一步做业务处理

## **未来的展望**

1. Sharding Queue 支持 Queue 的水平扩展，让单 Queue 的性能不再成为瓶颈；

2. 支持消息巨量堆积，让消息堆积不再成为问题；

3. 延时队列，支持按单消息延时，让消息延时变的简单，无需再通过 ttl＋deadletter exchange 做延时推送；

4. 历史消息 trace，追溯查询已经消费掉的消息，让生产方和消费方不再因消息是否生产了或消费了而发生扯皮。

## **作者介绍：*

张培培，2015 年加入饿了么，现任饿了么框架工具部架构师，负责饿了么消息队列 MaxQ。

## **参考文档**

1. [AMQP 0.9.1 官方协议](https://link.zhihu.com/?target=http%3A//www.amqp.org/specification/0-9-1/amqp-org-download)

2. [RabbitMQ 与 AMQP 协议详解](https://link.zhihu.com/?target=http%3A//www.cnblogs.com/frankyou/p/5283539.html)