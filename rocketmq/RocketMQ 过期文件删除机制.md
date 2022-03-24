# RocketMQ 过期文件删除机制 源码剖析

# 1. 背景

RocketMQ 的存储文件主要分三种：CommitLog、ConsumeQueue、IndexFile
RocketMQ 的过期文件删除机制会定期删除已经过期的存储文件。当磁盘容量告急时，会立刻执行删除，释放磁盘空间。
目前虽然有对于 RocketMQ 过期文件删除机制的文章，但我觉得没有讲的非常完善。本文详细分析一下三种存储文件的过期删除机制，避免一些坑。

# 2. 概述

CommitLog、ConsumeQueue 和 IndexFile 的过期文件删除逻辑由一个线程统一处理。
这个线程每 10s 进行一次检查，如果符合删除条件，那么会删除这些文件。

* ConsumeQueue 和 IndexFile 的检查每 10s 都会进行，会删除 CommitLog 投递的偏移量之前的文件。
* CommitLog 的删除比较复杂，当到达每天的删除时间（4 点）或者磁盘空间告急（超过 75%）才会启动删除，平时不会启动。

# 3. 详解

## 3.1 CommitLog

CommitLog 是一个由多个 1G 大小的内存映射文件组成的文件队列。

CommitLog 每个文件有一个过期时间，由 broker.conf 文件中的 `fileReservedTime` 控制，默认是 72 小时，即 CommitLog 最后一次写入后 72 小时就过期。

CommitLog 文件删除的条件有以下几种，符合任意一种都会执行删除逻辑

1. 时间到达 Broker 机器时间的 4 点，在 4 点 ~ 5 点这一小时中每 10s 都会进行检查和删除，删除过期的文件。
> 这里的 4 点指的是 Broker 机器的时间，一些虚机的时间与现实时间不一致，或者时区不一致，导致删除时间并不是现实时间 4 点开始，需要注意。
1. 在磁盘容量达到 75% 时，开启文件删除。此时会删除过期的 CommitLog。一次最多删 10 个，如果删了之后磁盘容量小于 75%，那么等下次到达 75% 时删。
1. 磁盘容量达到 85% 时，开启强制删除，会把没有过期文件也删掉。同样一次最多删 10 个。
1. 当磁盘容量达到 90% 时，将设置磁盘为不可写，此时会拒绝写入新的消息。
1. 手动删除。设计上预留了手动删除的接口，但实际没有命令能调用。就当这一条没有吧

## 3.2 ConsumeQueue

[ConsumeQueue](RocketMQ%20ConsumeQueue%20消费队列文件.md) 是消费队列文件。每个 Topic 的每个 Queue 都会有一个消费队列（可能包含多个文件），用作保存消息在 CommitLog 中的位置以便消费。

每隔 10s，文件删除线程就会检查所有 ConsumeQueue，删除该 ConsumeQueue 已经投递过的那些文件。

## 3.3 IndexFile

[IndexFile](RocketMQ%20IndexFile%20索引文件.md)是消息索引文件，仅仅用于消息的查询。索引文件可以通过 Message Key，查询到消息在 CommitLog 中的物理偏移量，进而从 CommitLog 中查询消息。

每隔 10s，文件删除线程会检查所有的 IndexFile，比较它的最大 offset 和当前已经投递的 CommitLog offset，把消息全部已经投递的 IndexFile 删除。

