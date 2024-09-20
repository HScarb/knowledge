# [深入理解Netty---从偶现宕机看Netty流量控制](https://www.cnblogs.com/vivotech/p/15346786.html)

https://www.cnblogs.com/vivotech/p/15346786.html

# 1. 业务背景

目前移动端的使用场景中会用到大量的消息推送，push消息可以帮助运营人员更高效地实现运营目标（比如给用户推送营销活动或者提醒APP新功能）。

对于推送系统来说需要具备以下两个特性：

- 消息秒级送到用户，无延时，支持每秒百万推送，单机百万长连接。
- 支持通知、文本、自定义消息透传等展现形式。正是由于以上原因，对于系统的开发和维护带来了挑战。下图是推送系统的简单描述（API->推送模块->手机）。

![img](https://static001.geekbang.org/infoq/11/117dd15057362c0201d7016f490af8cb.png)

# 2. 问题背景

推送系统中长连接集群在稳定性测试、压力测试阶运行一段时间后随机会出现一个进程挂掉的情况，概率较小（频率为一个月左右发生一次），这会影响部分客户端消息送到的时效。

推送系统中的长连接节点（Broker系统）是基于Netty开发，此节点维护了服务端和手机终端的长连接，线上问题出现后，添加Netty内存泄露监控参数进行问题排查，观察多天但并未排查出问题。

由于长连接节点是Netty开发，为便于读者理解，下面简单介绍一下Netty。

# 3. Netty介绍

Netty是一个高性能、异步事件驱动的NIO框架，基于Java NIO提供的API实现。它提供了对TCP、UDP和文件传输的支持，作为当前最流行的NIO框架，Netty在互联网领域、大数据分布式计算领域、游戏行业、通信行业等获得了广泛的应用，HBase，Hadoop，Bees，Dubbo等开源组件也基于Netty的NIO框架构建。

# 4. 问题分析

## 4.1 猜想

最初猜想是长连接数导致的，但经过排查日志、分析代码，发现并不是此原因造成。

长连接数：39万，如下图：

![img](https://static001.geekbang.org/infoq/fc/fc26e2c74862a8d8652ae0b6f9a81415.png)

每个channel字节大小1456, 按40万长连接计算，不致于产生内存过大现象。

## 4.2 查看GC日志

查看GC日志，发现进程挂掉之前频繁full GC（频率5分钟一次），但内存并未降低，怀疑堆外内存泄露。

## 4.3 分析heap内存情况

ChannelOutboundBuffer对象占将近5G内存，泄露原因基本可以确定：ChannelOutboundBuffer的entry数过多导致，查看ChannelOutboundBuffer的源码可以分析出，是ChannelOutboundBuffer中的数据。

没有写出去，导致一直积压；ChannelOutboundBuffer内部是一个链表结构。

![img](https://static001.geekbang.org/infoq/88/88ecab754f3b108f08c82263b4acb641.png)

## 4.4 从上图分析数据未写出去，为什么会出现这种情况？

代码中实际有判断连接是否可用的情况（Channel.isActive），并且会对超时的连接进行关闭。从历史经验来看，这种情况发生在连接半打开（客户端异常关闭）的情况比较多---双方不进行数据通信无问题。

按上述猜想，测试环境进行重现和测试。

> 1）模拟客户端集群，并与长连接服务器建立连接，设置客户端节点的防火墙，模拟服务器与客户端网络异常的场景（即要模拟Channel.isActive调用成功，但数据实际发送不出去的情况）。
>
> 2）调小堆外内存，持续发送测试消息给之前的客户端。消息大小（1K左右）。
>
> 3）按照128M内存来计算，实际上调用9W多次就会出现。

![img](https://static001.geekbang.org/infoq/4d/4d35ebb8b4134364e106dcb03b7766f4.png)

# 5. 问题解决

## 5.1 启用autoRead机制

当channel不可写时，关闭autoRead；

```java
public void channelReadComplete(ChannelHandlerContext ctx) throws Exception {
    if (!ctx.channel().isWritable()) {
        Channel channel = ctx.channel();
        ChannelInfo channelInfo = ChannelManager.CHANNEL_CHANNELINFO.get(channel);
        String clientId = "";
        if (channelInfo != null) {
            clientId = channelInfo.getClientId();
        }

        LOGGER.info("channel is unwritable, turn off autoread, clientId:{}", clientId);
        channel.config().setAutoRead(false);
    }
}
```

当数据可写时开启autoRead；

```java
@Override
public void channelWritabilityChanged(ChannelHandlerContext ctx) throws Exception
{
    Channel channel = ctx.channel();
    ChannelInfo channelInfo = ChannelManager.CHANNEL_CHANNELINFO.get(channel);
    String clientId = "";
    if (channelInfo != null) {
        clientId = channelInfo.getClientId();
    }
    if (channel.isWritable()) {
        LOGGER.info("channel is writable again, turn on autoread, clientId:{}", clientId);
        channel.config().setAutoRead(true);
    }
}
```

**说明：**

![img](https://static001.geekbang.org/infoq/2c/2c5429fdaad85846d7121405cfd0ec96.png)

autoRead的作用是更精确的速率控制，如果打开的时候Netty就会帮我们注册读事件。当注册了读事件后，如果网络可读，则Netty就会从channel读取数据。那如果autoread关掉后，则Netty会不注册读事件。

这样即使是对端发送数据过来了也不会触发读事件，从而也不会从channel读取到数据。当recv_buffer满时，也就不会再接收数据。

## 5.2 设置高低水位

```java
serverBootstrap.option(ChannelOption.WRITE_BUFFER_WATER_MARK, new WriteBufferWaterMark(1024 * 1024, 8 * 1024 * 1024));
```

> 注：高低水位配合后面的isWritable使用

## 5.3 增加channel.isWritable()的判断

channel是否可用除了校验channel.isActive()还需要加上channel.isWrite()的判断，isActive只是保证连接是否激活，而是否可写由isWrite来决定。

```java
private void writeBackMessage(ChannelHandlerContext ctx, MqttMessage message) {
    Channel channel = ctx.channel();
    //增加channel.isWritable()的判断
    if (channel.isActive() && channel.isWritable()) {
        ChannelFuture cf = channel.writeAndFlush(message);
        if (cf.isDone() && cf.cause() != null) {
            LOGGER.error("channelWrite error!", cf.cause());
            ctx.close();
        }
    }
}
```

> 注：isWritable可以来控制ChannelOutboundBuffer，不让其无限制膨胀。其机制就是利用设置好的channel高低水位来进行判断。

## 5.4 问题验证

修改后再进行测试，发送到27W次也并不报错；

![img](https://static001.geekbang.org/infoq/93/93b007077ec2fdbef55dab52ab88d6df.png)

# 6. 解决思路分析

一般Netty数据处理流程如下：将读取的数据交由业务线程处理，处理完成再发送出去（整个过程是异步的），Netty为了提高网络的吞吐量，在业务层与socket之间增加了一个ChannelOutboundBuffer。

在调用channel.write的时候，所有写出的数据其实并没有写到socket，而是先写到ChannelOutboundBuffer。当调用channel.flush的时候才真正的向socket写出。因为这中间有一个buffer，就存在速率匹配了，而且这个buffer还是无界的（链表），也就是你如果没有控制channel.write的速度，会有大量的数据在这个buffer里堆积，如果又碰到socket写不出数据的时候（isActive此时判断无效）或者写得慢的情况。

很有可能的结果就是资源耗尽，而且如果ChannelOutboundBuffer存放的是DirectByteBuffer，这会让问题更加难排查。

流程可抽象如下：

![img](https://static001.geekbang.org/infoq/84/8413825327fe8f1a3727e57d36da1524.png)

从上面的分析可以看出，步骤一写太快（快到处理不过来）或者下游发送不出数据都会造成问题，这实际是一个速率匹配问题。

# 7. Netty源码说明

**超过高水位**

当ChannelOutboundBuffer的容量超过高水位设定阈值后，isWritable()返回false，设置channel不可写（setUnwritable），并且触发fireChannelWritabilityChanged()。

```java
private void incrementPendingOutboundBytes(long size, boolean invokeLater) {
    if (size == 0) {
        return;
    }

    long newWriteBufferSize = TOTAL_PENDING_SIZE_UPDATER.addAndGet(this, size);
    if (newWriteBufferSize > channel.config().getWriteBufferHighWaterMark()) {
        setUnwritable(invokeLater);
    }
}
private void setUnwritable(boolean invokeLater) {
    for (;;) {
        final int oldValue = unwritable;
        final int newValue = oldValue | 1;
        if (UNWRITABLE_UPDATER.compareAndSet(this, oldValue, newValue)) {
            if (oldValue == 0 && newValue != 0) {
                fireChannelWritabilityChanged(invokeLater);
            }
            break;
        }
    }
}
```

**低于低水位**

当ChannelOutboundBuffer的容量低于低水位设定阈值后，isWritable()返回true，设置channel可写，并且触发fireChannelWritabilityChanged()。

```java
private void decrementPendingOutboundBytes(long size, boolean invokeLater, boolean notifyWritability) {
    if (size == 0) {
        return;
    }

    long newWriteBufferSize = TOTAL_PENDING_SIZE_UPDATER.addAndGet(this, -size);
    if (notifyWritability && newWriteBufferSize < channel.config().getWriteBufferLowWaterMark()) {
        setWritable(invokeLater);
    }
}
private void setWritable(boolean invokeLater) {
    for (;;) {
        final int oldValue = unwritable;
        final int newValue = oldValue & ~1;
        if (UNWRITABLE_UPDATER.compareAndSet(this, oldValue, newValue)) {
            if (oldValue != 0 && newValue == 0) {
                fireChannelWritabilityChanged(invokeLater);
            }
            break;
        }
    }
}
```

# 8. 总结

当ChannelOutboundBuffer的容量超过高水位设定阈值后，isWritable()返回false，表明消息产生堆积，需要降低写入速度。

当ChannelOutboundBuffer的容量低于低水位设定阈值后，isWritable()返回true，表明消息过少，需要提高写入速度。通过以上三个步骤修改后，部署线上观察半年未发生问题出现。