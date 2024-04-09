# Rocketmq 5 分级存储 Tieredstore（RIP-57、RIP-65） 原理详解 & 源码解析

## 1. 背景

### 1.1 需求

RocketMQ 5.x 的演进目标之一是云原生化，在云原生和 Serverless 的浪潮下，需要解决 RocketMQ 存储层存在两个瓶颈。

1. 数据量膨胀过快，单体硬件无法支撑
2. 存储的低成本和速度无法兼得

众多云厂商也希望提供 Serverless 化的 RocketMQ 来降低成本，为用户提供更加极致弹性的云服务。

### 1.2 解决的问题

除了以上两个瓶颈之外，分级存储还能解决的问题是

1. 消息仅支持保留固定的时间
2. Topic 的数据与 Broker 绑定，无法迁移，在

### 1.3 演进过程

RocketMQ 5.1 中提出了分级存储的方案（[RIP-57](https://github.com/apache/rocketmq/wiki/RIP-57-Tiered-storage-for-RocketMQ)），但当时的版本还未达到生产可用。

[RIP-65](https://github.com/apache/rocketmq/wiki/RIP-65-Tiered-Storage-Optimization) 对之前的分级存储实现进行了重构，修改了模型抽象、线程模式、元数据管理和索引文件的实现，提升了分级存储的代码可读性。

[ISSUE #7878](https://github.com/apache/rocketmq/issues/7878) 又对分级存储的代码进行了大量重构，修复已知问题，提升性能，减少资源利用率。

经过几次重构，当前的分级存储基本已经属于可用的状态。不过官方只提供了内存和本地文件两种分级存储文件段的实现，其他存储介质分级存储的实现需要用户自行扩展来实现。

## 2. 使用

### 2.1 Broker 配置

要测试分级存储，需要在 `broker.conf` 中添加如下配置：

```ini
# tiered
messageStorePlugIn=org.apache.rocketmq.tieredstore.TieredMessageStore
tieredBackendServiceProvider=org.apache.rocketmq.tieredstore.provider.PosixFileSegment
tieredStoreFilePath=e:\\data\\rocketmq\\node\\tieredstore
tieredStorageLevel=FORCE
```

分级存储各个配置的含义表如下：

| 配置                            | 默认值                                                       | 单位 | 作用                                                         |
| ------------------------------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------ |
| messageStorePlugIn              |                                                              |      | 扩展 MessageStore 实现，如果要用分级存储，设置成`org.apache.rocketmq.tieredstore.TieredMessageStore ` |
| tieredMetadataServiceProvider   | org.apache.rocketmq.tieredstore.metadata.DefaultMetadataStore |      | 分级存储元数据存储实现                                       |
| tieredBackendServiceProvider    | org.apache.rocketmq.tieredstore.provider.MemoryFileSegment   |      | 分级存储数据存储实现                                         |
| tieredStoreFilepath             |                                                              |      | 分级存储数据文件保存位置（POSIX provider）                   |
| tieredStorageLevel              | NOT_IN_DISK                                                  |      | 分级存储读取策略，默认 NOT_IN_DISK，即只有在本地存储中不存在时才会读取分级存储。其他选项为：DISABLE，禁用分级存储；NOT_IN_MEM，消息不在内存（Page Cache）时读分级存储；FORCE，强制读取分级存储 |
| tieredStoreFileReservedTime     | 72                                                           | hour | 分级存储消息保存时间                                         |
| commitLogRollingInterval        | 24                                                           | hour | 分级存储 CommitLog 强制滚动时间                              |
| readAheadCacheEnable            | true                                                         |      | 从分级存储读取时是否启用预读缓存                             |
| readAheadMessageCountThreshold  | 4096                                                         |      | 从分级存储时每次读取消息数量阈值                             |
| readAheadMessageSizeThreshold   | 16 * 1024 * 1024                                             | byte | 从分级存储中每次读取消息的长度阈值                           |
| readAheadCacheExpireDuration    | 15000                                                        | ms   | 预读缓存过期时间，没有读写操作 15s 后过期                    |
| readAheadCacheSizeThresholdRate | 0.3                                                          | 比例 | 最大预读缓存大小，为 JVM 最大内存的一定比例                  |
| tieredStoreMaxPendingLimit      | 10000                                                        |      | 分级存储写文件最大同时写文件数量                             |

目前 RocketMQ 源码中内置了两种分级存储 FileSegment 的实现

* MemoryFileSegment：使用内存作为二级存储
* PosixFileSegment：使用磁盘文件作为二级存储

他们都是实验性的，这里选择了 `PosixFileSegment`。

要实现其他存储介质的分级存储，只需要扩展 `FileSegment` 实现一个新的 `FileSegment` 类即可。

### 2.2 数据组织结构

对启用了分级存储的 Broker 进行压测，一段时间后分级存储目录中的文件：

```
/e/data/rocketmq/node/tieredstore
`-- [   0]  212d6b50_DefaultCluster
                    `-- [   0]  broker-a
        |           `-- [   0]  rmq_sys_INDEX
        |           `-- [   0]  0
        |           `-- [   0]  INDEX
        |           `-- [572M]  cfcd208400000000000000000000
        `-- [   0]  topic-tiered
            |-- [   0]  0
            |   |-- [   0]  COMMIT_LOG
            |   |   |-- [1024M]  1f329fef00000000001073741775
            |   |   |-- [1024M]  cfcd208400000000000000000000
            |   |   `-- [707M]  dcb86ff200000000002147483550
            |   `-- [   0]  CONSUME_QUEUE
            |       |-- [ 60M]  40d473e300000000000104857600
            |       `-- [100M]  cfcd208400000000000000000000
            |-- [   0]  1
            |   |-- [   0]  COMMIT_LOG
            |   |   |-- [1024M]  1f329fef00000000001073741775
            |   |   |-- [1024M]  cfcd208400000000000000000000
            |   |   `-- [707M]  dcb86ff200000000002147483550
            |   `-- [   0]  CONSUME_QUEUE
            |       |-- [ 60M]  40d473e300000000000104857600
            |       `-- [100M]  cfcd208400000000000000000000
            |-- [   0]  2
            |   |-- [   0]  COMMIT_LOG
            |   |   |-- [1024M]  1f329fef00000000001073741775
            |   |   |-- [1024M]  cfcd208400000000000000000000
            |   |   `-- [707M]  dcb86ff200000000002147483550
            |   `-- [   0]  CONSUME_QUEUE
            |       |-- [ 60M]  40d473e300000000000104857600
            |       `-- [100M]  cfcd208400000000000000000000
            `-- [   0]  3
                |-- [   0]  COMMIT_LOG
                |   |-- [1024M]  1f329fef00000000001073741775
                |   |-- [1024M]  cfcd208400000000000000000000
                |   `-- [707M]  dcb86ff200000000002147483550
                `-- [   0]  CONSUME_QUEUE
                    |-- [ 60M]  40d473e300000000000104857600
                    `-- [100M]  cfcd208400000000000000000000
```

其中索引文件单独存放，每个 Topic 的队列都单独有 CommitLog 和 ConsumeQueue

* CommitLog 为消息数据，与本地存储不同，每个 Topic 的队列都拆分单独一组的 CommitLog 文件，每个 1G
* ConsumeQueue 为消费索引

* INDEX 为索引文件，单独目录存放

## 3. 概要设计

### 3.1 存储模型与抽象

### 3.2 分层设计

接入层

容器层

驱动层

### 3.3 写消息

### 3.4 读消息

### 3.5 索引设计

## 4. 详细设计

## 5. 源码解析

## 参考资料

* [Tiered storage README.md](https://github.com/apache/rocketmq/blob/develop/tieredstore/README.md)
* [RIP 57 Tiered storage for RocketMQ](https://github.com/apache/rocketmq/wiki/RIP-57-Tiered-storage-for-RocketMQ)
* [RIP 65 Tiered Storage Optimization](https://github.com/apache/rocketmq/wiki/RIP-65-Tiered-Storage-Optimization)
* [Refactoring and improving Tiered Storage Implementation](https://github.com/apache/rocketmq/issues/6633)
* [[RIP-65] Support efficient random index for massive messages](https://github.com/apache/rocketmq/issues/7545)
* [[Enhancement] Performance Improvement and Bug Fixes for the Tiered Storage Module](https://github.com/apache/rocketmq/issues/7878)
* [RocketMQ 多级存储设计与实现](https://blog.lv5.moe/p/introduce-tiered-storage-for-rocketmq)
* [谈谈 RocketMQ 5.0 分级存储背后一些有挑战的技术优化](https://developer.aliyun.com/article/1441642?spm=a2c6h.24874632.expert-profile.29.5f185d0693jYjN)
* [RocketMQ5源码（七）分层存储](https://juejin.cn/post/7340603873605222435)