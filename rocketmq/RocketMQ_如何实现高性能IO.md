# RocketMQ 如何实现高性能IO？

# 背景

RocketMQ 是一个低延迟、金融级稳定的高性能消息队列。它的性能处于消息队列的第一梯队，拥有接近 Kafka 的性能表现，每秒可以处理数十万的消息。那么 RocketMQ 是如何做到这么高的性能的呢？

一方面，RocketMQ 借鉴了 Kafka 的实现，运用顺序读写、页缓存等方案加速了 IO 读写。另一方面，RocketMQ 也有许多不同于 Kafka 的设计，比如使用了内存映射文件的方案进行读写。

下面来详细分析一下 RocketMQ 实现高性能 IO 的几种设计和原理。

# 实现现高性能 IO 的手段

## 1. 顺序读写

磁盘的顺序读写性能要远好于随机读写。因为每次从磁盘读数据时需要先寻址，找到数据在磁盘上的物理位置。对于机械硬盘来说，就是移动磁头，会消耗时间。
顺序读写相比于随机读写省去了大部分的寻址时间，它只需要寻址一次就可以连续读写下去，所以性能比随机读写好很多。

RocketMQ 利用了这个特性。它所有的消息数据都存放在一个无限增长的文件队列 CommitLog 中，CommitLog 是由一组 1G 内存映射文件队列组成的。
写入时就从一个固定位置一直写下去，一个文件写满了就开启一个新文件顺序读写下去。

## 2. 页缓存

## 4. 零拷贝

## 3. MMap

## 5. 文件预热

## 6. 预创建文件

## 内存级读写分离 TransientStorePool

# 参考资料

* [RocketMQ 官方文档](https://github.com/apache/rocketmq/blob/master/docs/cn/design.md)
* [Kafka 和 RocketMQ 底层存储之那些你不知道的事](https://xie.infoq.cn/article/24b51de341d66de6d1e737d65)
* [消息队列高手课——Kafka如何实现高性能IO？](https://time.geekbang.org/column/article/126493)