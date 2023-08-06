# RocketMQ Netty 写缓冲区水位配置 NettyServerConfig#writeBufferHighWaterMark

RocketMQ 4.9.3 版本中，[Issue#3651](https://github.com/apache/rocketmq/issues/3651) 新增了 Netty 缓冲区高低水位的配置。

该改动在服务端`NettyServerConfig`和客户端配置`NettyClientConfig`中新增了如下配置项：

```java
// NettySystemConfig.java

    public static int writeBufferHighWaterMark =
        Integer.parseInt(System.getProperty(COM_ROCKETMQ_REMOTING_WRITE_BUFFER_HIGH_WATER_MARK_VALUE, "4194304"));//4M
    public static int writeBufferLowWaterMark =
        Integer.parseInt(System.getProperty(COM_ROCKETMQ_REMOTING_WRITE_BUFFER_LOW_WATER_MARK, "1048576")); //1MB
```

一开始的默认低水位为 1M，高水位为 4M，[Issue#3825](https://github.com/apache/rocketmq/issues/3825) 将默认值改为 0。支持在配置文件中进行修改。

---

这两个配置是 netty channel 的配置，原来的默认值分别为 32K 和 64K

```java
// WriteBufferWaterMark.java
private static final int DEFAULT_LOW_WATER_MARK = 32 * 1024;
private static final int DEFAULT_HIGH_WATER_MARK = 64 * 1024;

public static final WriteBufferWaterMark DEFAULT =
        new WriteBufferWaterMark(DEFAULT_LOW_WATER_MARK, DEFAULT_HIGH_WATER_MARK, false);
```

根据 Netty 的文档，这两个参数含义如下

> WriteBufferWaterMark 用于设置写缓冲区的低水位线和高水位线。 
>
> 如果在写缓冲区中排队的字节数超过了高水位线，`Channel.isWritable()` 将开始返回 false。 
>
> 如果在写缓冲区中排队的字节数先超过了高水位线，然后下降到低水位线以下，Channel.isWritable() 将再次开始返回 true。

再看 `Channel.isWritable()` 的文档

> 当且仅当I/O线程将立即执行所请求的写操作时返回 true。在此方法返回 false 时提交的写请求将被放入队列，直到I/O线程准备好处理队列中的写请求。

---

https://www.liaoxuefeng.com/discuss/1279869501571105/1450880018677794

### WRITE_BUFFER_WATER_MARK

控制 Netty 中 Write Buffer 的**水位线**

要理解水位线 (wrter mark) 的概念，还要从 Netty 的 channel.write(...) 讲起。

首先先来根据下面这张图来观察 write 的大致流程

![img](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202308061642878.png)

首先，我们对一个 Channel 写入的时候，会先将需要 write 的对象封装为任务放入 Queue

然后，同时 I/O 线程会定时将任务从 Queue 取出来，然后再经过 Pipeline 中各个处理器处理（图中未画出），再将处理结果写入到 Netty Buffer，然后到达操作系统的底层的 TCP 的发送缓冲区。

最后，TCP 发送缓冲区中的数据会分包发送给对端，就是在这里的对面的 Client 的 TCP 接收缓冲区。

需要注意的是，如果只是调用 channel.write(..) 方法是，该数据只会暂时存储到 Netty Buffer。在 channel.flush() 被调用后，则会发送信息 flush （即上图中标记为 "F" 的包），在 Netty Buffer 收到了 flush 控制包，才会将 Buffer 冲刷到 TCP Buffer。

其中，TCP 连接的数据发送一方中的 TCP Buffer (发送缓冲区) 的大小由 SO_SNDBUF 控制，而 Netty Buffer 是"无界"的，且它的位置在堆外内存（Direct Buffer）。

我们在一开始提到的水位线，则是标记当前 Netty Buffer 所使用的大小的一个值。当 Netty Buffer 的大小到达这个值后，调用 chanel.isWriteable 则会返回 false，且会通过调用业务 handler 的 writabilityChanged 方法来通知上层应用。

同时水位线还分为高水位线和低水位线，到达高水位线后调用 chanel.isWriteable 则会返回 false ，直到下降到低水位线，调用时才会返回为 true 。

不过，水位线只是一个警示，并不是实际上限，到达水位线后 Netty Buffer 仍然可以被写入，写入后会在由 Netty 维护的内部缓冲区进行排队。

> 顺带一提，在之前的 netty 版本中，高水位线通过 WRITE_BUFFER_HIGH_WATER_MARK 设置，低水位线通过 WRITE_BUFFER_LOW_WATER_MARK，但现在已经被标记为 Deprecated，取而代之则是上文介绍的 WRITE_BUFFER_WATER_MARK，通过下列样式进行配置 .option(ChannelOption.WRITE_BUFFER_WATER_MARK, **new** WriteBufferWaterMark(10000, 20000))

> 上面提到的 Netty Buffer 的在 Netty 中的类名为 ChannelOutboundBuffer；TCP Buffer 也叫 socket 发送缓冲区

---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
