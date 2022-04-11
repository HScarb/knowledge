# RocketMQ 4.9.3 版本 性能优化 源码剖析

# 概述

RocketMQ [4.9.1 版本](https://github.com/apache/rocketmq/releases/tag/rocketmq-all-4.9.1) 针对 Broker 做了一系列性能优化，提升了消息发送的 TPS。[前文曾就 4.9.1 版本的优化做了深入分析](./RocketMQ%204.9.1%20性能优化%20源码剖析.md)。

在 2022 年的 2 月底，RocketMQ [4.9.3 版本](https://github.com/apache/rocketmq/releases/tag/rocketmq-all-4.9.3) 发布，其对 Broker 做了更进一步的性能优化，本次优化中也包含了生产和消费性能的提升。

本文将会详解 4.9.3 版本中的性能优化点。在 4.9.3 版本中对延迟消息的优化已经在[另一篇文章](RocketMQ%20%E5%BB%B6%E8%BF%9F%E6%B6%88%E6%81%AF%EF%BC%88%E5%AE%9A%E6%97%B6%E6%B6%88%E6%81%AF%EF%BC%894.9.3%20%E7%89%88%E6%9C%AC%E4%BC%98%E5%8C%96%20%E5%BC%82%E6%AD%A5%E6%8A%95%E9%80%92%E6%94%AF%E6%8C%81.md)中详解。

本次和上次的性能优化主要由快手的[黄理](https://github.com/areyouok)老师提交，在 [ISSUE#3585](https://github.com/apache/rocketmq/issues/3585) 中集中记录。先来看一下本次性能优化的所有优化项

> We have some performance improvements based on 4.9.2
>
> 1. [Part A] eliminate reverse DNS lookup in MessageExt
> 2. [Part B] Improve header encode/decode performance
> 3. [Part B] Improve RocketMQSerializable performance with zero-copy
> 4. [Part C] cache result for parseChannelRemoteAddr()
> 5. [Part D] improve performance of createUniqID()
> 6. [Part E] eliminate duplicated getNamespace() call when where is no namespace
> 7. [Part F] eliminate regex match in topic/group name check
> 8. [Part G] [Work in progress] support send batch message with different topic/queue
> 9. [Part H] eliminate StringBuilder auto resize in PullRequestHoldService.buildKey() when topic length is greater than 14, this method called twice for each message.
> 10. [Part I] Avoid unnecessary StringBuffer resizing and String Formatting
> 11. [Part J] Use mmap buffer instead of FileChannel when writing consume queue and slave commit log, which greatly speed up consume tps.
> 12. [Part K](https://github.com/apache/rocketmq/pull/3659) move execution of notifyMessageArriving() from ReputMessageService thread to PullRequestHoldService thread.
>
> These commits almost eliminate bad performance methods in the cpu flame graph in producer side.

下面来逐条剖析

# 性能优化

想要优化性能，首先需要找到 RocketMQ 的 Broker 在处理消息时性能损耗的点。使用火焰图可以清晰地看出当前耗时比较多的方法，从耗时较多的方法想办法入手优化，可以更大程度上提升性能。

具体的做法是开启 Broker 的火焰图采样，然后对其进行压测（同时生产和消费），然后观察其火焰图中方法的时间占用百分比，优化占用时间高且可以优化的地方。

## A. 移除 MessageExt 中的反向 DNS 查找

> eliminate reverse DNS lookup in MessageExt

[#3586](https://github.com/apache/rocketmq/pull/3586)

![image-20220411212011338](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112120431.png)

`inetAddress.getHostName()` 方法中会有反向 DNS 查找，可能耗时较多。于是优化成没有反向 DNS 查找的 `getHostString()` 方法

（`MessageExt#getBornHostNameString()` 方法在一个异常流程中被调用，优化此方法其实对性能没有什么提升）

## B. 提高编解码性能

（该提交未合入 4.9.3 版本，当前仍未合入）

## C. 缓存 parseChannelRemoteAddr() 方法的结果

> cache the result of parseChannelRemoteAddr()

[#3589](https://github.com/apache/rocketmq/pull/3589)

### 寻找优化点

![image-20220411213226971](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112132137.png)

从火焰图中可以看到，`parseChannelRemoteAddr()` 这个方法占用了 5% 左右的总耗时。

这个方法被客户端在发送消息时调用，每次发送消息都会调用到这个方法，这也是他占用如此高 CPU 耗时百分比的原因。

那么这个方法做了什么？Netty 的 Channel 相当于一个 HTTP 连接，这个方法试图从 Channel 中获取远端的地址。

从火焰图上看出，该方法的 `toString`占用大量时间，其中主要包含了复杂的 String 拼接和处理方法。

那么想要优化这个方法最直接的方式就是——缓存其结果。

### 具体优化方法

Netty 提供了 `AttributeKey` 这个类，用于将 HTTP 连接的状态保存在 Channel 上。`AttributeKey` 相当于一个 Key-Value 对，用来存储状态。

 要使用 `AttributeKey`，需要先初始化它的 Key，这样它就可以预先计算 Key 的 HashCode，查询该 Key 的时候效率就很高了。

```java
    private static final AttributeKey<String> REMOTE_ADDR_KEY = AttributeKey.valueOf("RemoteAddr");
```

然后优化该方法，第一次调用该方法时尝试从 Channel 上获取属性`RemoteAddr`，如果获取不到，则调用原来的逻辑去获取并且缓存到该 `AttributeKey` 中。

![image-20220411215152793](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112151000.png)

修改过后在火焰图上已经几乎看不到该方法的用时。

## D. 提升 createUniqID() 的性能

> Improve performance of createUniqID().

[#3590](https://github.com/apache/rocketmq/pull/3590)

### 寻找优化点

![image-20220411222721408](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112227481.png)

`createUniqID()` 这个方法用于创建消息的全局唯一 ID，在客户端每次发送消息时会调用，为每个消息创建全局唯一 ID。

RocketMQ 中包含两个消息 ID，分别为全局唯一 ID（UNIQUE_ID，消息发送时由客户端生产）和偏移量 ID（offsetMsgId，Broker 保存消息时由保存的偏移量生成），关于这两个 ID 的生成方法和使用可以看丁威老师的 [RocketMQ msgId与offsetMsgId释疑](https://blog.csdn.net/prestigeding/article/details/104739950)。

原本生成全局 ID 的方法将客户端 IP、进程 ID 等信息组合计算生成一个字符串。方法逻辑里面包含了大量字符串和 ByteBuffer 操作，所以耗时较高。

### 优化方法

原先的方法实现中，每次调用都会创建 `StringBuilder` 、`ByteBuffer`、多个字符串……包含大量字符串操作，字符串操作的 CPU 耗时开销很大。

优化的方法主要通过字符数组运算替代字符串操作，**避免多余的字符串对象产生**；使用缓存，避免每次调用都重新计算和创建字符串对象。

1. 将原来的 `FIX_STRING` 字符串换成 `char[]` 字符数组，然后可以使用 `System.arraycopy` 替换原来的 `StringBuilder` 操作，避免多余对象产生。

   ![image-20220411221546009](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112215086.png)

2. 新增了 `void writeInt(char[] buffer, int pos, int value)`  和 `writeShort(char[] buffer, int pos, int value)` 方法，用于写入字符串数组。

   ![image-20220411222306938](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112223581.png)

   原先的 `byte2string` 方法创建了 `char[]` 对象和 `String` 对象，并且 String 对象构造时需要拷贝一遍 char[]。优化之后完全没有新对象产生。

   ![image-20220411222509675](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112225688.png)

## E. 当没有用到 namespace 时，避免其被多次调用

> eliminate duplicated getNamespace() call when where is no namespace

[#3591](https://github.com/apache/rocketmq/pull/3591)

### 寻找优化点

![image-20220411223612434](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112236704.png)

客户端在发送消息时会调用 `getNamespace` 方法。Namespace 功能在 RocketMQ 中用的很少，它在 4.5.1 版本中被引进，具体可以看 [#1120](https://github.com/apache/rocketmq/issues/1120)。它的作用是引入 Namespace 的概念，相同名称的 Topic 如果 Namespace 不同，那么可以表示不同的 Topic。

### 优化方法

由于大部分情况下都用不到 Namespace，所以可以增加一个判断，如果不用 Namespace，就不走 Namespace 的一些验证和匹配逻辑。

具体的方法很简单，在 `ClientConfig` 设一个布尔值，用来表示 Namespace 是否初始化（是否使用），如果不使用，则跳过 `getNamespace()` 方法中后面的逻辑。

![image-20220411224424160](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112244007.png)

## F. 去除 Topic/Group 名称的正则匹配检查

> eliminate regex match in topic/group name check

[#3594](https://github.com/apache/rocketmq/pull/3594)

每次发消息时，无论是客户端还是服务端都需要检查一次这个消息的 Topic/Group 是否合法。检查通过正则表达式匹配来进行，匹配规则很简单，就是检查这个名称的字符是否在一些字符范围内 `String VALID_PATTERN_STR = "^[%|a-zA-Z0-9_-]+$"`。那么就可以把这个正则表达式匹配给优化掉，使用字符来匹配，将正则匹配简化成位图查表的过程，优化性能。

因为正则表达式匹配的字符编码都在 128 范围内，所以先创建一个位图，大小为 128。

```java
public static final boolean[] VALID_CHAR_BIT_MAP = new boolean[128];
```

然后用位图匹配的方式替换正则匹配：检查的字符串的每一个字符是否在位图中。

![image-20220411231805018](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112318938.png)

注意这里有一句

```java
// 将位图从堆复制到栈里（本地变量），提高下面循环的变量访问速度
boolean[] bitMap = VALID_CHAR_BIT_MAP;
```

将静态变量位图复制到局部变量中，这样做的用意是将堆中的变量复制到栈上（因为局部变量都位于栈），提高下面循环中访问该位图的速度。

## G. 支持发送 batch 消息时支持不同的 Topic/Queue

> support send batch message with different topic/queue

该改动依赖 Part.B ，所以还未提交 PR

## H. 避免无谓的 StringBuilder 扩容

> eliminate StringBuilder auto resize in PullRequestHoldService.buildKey() when topic length is greater than 14, this method called twice for each message

[#3612](https://github.com/apache/rocketmq/pull/3612)

在 Broker 处理消息消费逻辑时，如果长轮询被启用，`PullRequestHoldService#buildKey` 每条消息会被调用 2 次。长轮询相关逻辑请移步[之前的分析](./RocketMQ%20消息消费%20轮询机制%20PullRequestHoldService.md)

该方法中初始化一个 StringBuilder，默认长度为 16。StringBuilder 会将 Topic 和 QueueId 进行拼接，如果 Topic 名称过长，会造成 StringBuilder 的扩容，内部包含字符串的拷贝。在比较坏的情况下，扩容可能会发生多次。

那么既然已经直到 Topic 的长度，为什么不在 StringBuilder 初始化的时候就设定长度呢？这就是这个优化的改动。

![image-20220411232605135](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112326976.png)

为什么这里是 `toipic.length() + 5`？因为一般 QueueId 不会超过 4 位数（一个 Topic 下面不会超过 9999 个队列），再加上一个分隔符，得到 5。

## I. 避免无谓的 StringBuffer 扩容和 String 格式化

> Avoid unnecessary StringBuffer resizing and String Formatting

[#3619](https://github.com/apache/rocketmq/pull/3619)

### 寻找优化点

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112336235.png)

从火焰图上看出，在 Broker 处理消息消费消息请求时，有许多 `String.format` 方法开销非常大，这些方法都是数据统计用的，用来拼接数据统计字典的 Key。可以想办法进行优化。

### 优化方法

首先这里面有使用 StringBuffer 拼接的逻辑，也没有预先设定长度，存在扩容可能性。这里也没有多线程的情况，所以改成 StringBuilder，并且先计算好长度，避免扩容。

![image-20220411234502755](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112345605.png)

## J. 在写 ConsumeQueue 和 从节点的 CommitLog 时，使用 MMap 而不是 FileChannel，提升消息消费 TPS

> Use MappedByteBuffer instead of FileChannel to write consume queue and slave commitlog.

[#3657](https://github.com/apache/rocketmq/pull/3657)

当消费的 Queue 数量特别多时（ 600 个），消费的 TPS 跟不上。即在 Queue 比较少时（72 个）消费速度可以跟上生产速度（20W），但是当 Queue 比较多时，消费速度只有 7W。

这个修改可以提升 Queue 特别多时的消费速度。

* 72 个 Queue，消费速度从 7W 提升到 20W
* 600 个 Queue，消费速度从 7W 提升到 11W

### 寻找优化点

对 Broker 进行采样，发现创建消费索引的 reput 线程中有较大的耗时占比。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112355747.png)

从火焰图上可以看出，FileChannel 写数据的耗时占比比较大，有没有办法来优化一下？

### 优化方法

我们知道 RocketMQ 写 CommitLog 是利用 MMap 来提升写入速度。但是在写 ConsumeQueue 时原先用的是 FileChannel 来写，于是这里改成也使用 MMap 来写入。

MappedFile.java

![image-20220411235301250](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112353096.png)

![image-20220411235759752](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112358935.png)

具体修改如上两图所示，这样修改之后会影响两个地方：ConsumeQueue （消费索引）的写入和 Slave 节点 CommitLog 的写入

![image-20220411235323472](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112353383.png)



![image-20220411235923338](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204112359113.png)

优化过后构建 ConsumeQueue 的时间占比大大减少

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204120000329.png)

# K. 将 notifyMessageArriving() 的调用从 ReputMessageService 线程移到 PullRequestHoldService 线程

> move execution of notifyMessageArriving() from ReputMessageService thread to PullRequestHoldService thread
>
> This commit speed up consume qps greatly, in our test up to 200,000 qps.

[#3659](https://github.com/apache/rocketmq/pull/3659)

（该提交未合入 4.9.3 版本，当前仍未合入）
