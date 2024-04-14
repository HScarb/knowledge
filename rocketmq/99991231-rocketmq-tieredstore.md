# Rocketmq 5 分级存储 Tieredstore（RIP-57、RIP-65） 原理详解 & 源码解析

## 1. 背景

### 1.1 需求

RocketMQ 5.x 的演进目标之一是云原生化，在云原生和 Serverless 的浪潮下，需要解决 RocketMQ 存储层存在两个瓶颈。

1. 数据量膨胀过快，单体硬件无法支撑
2. 存储的低成本和速度无法兼得

众多云厂商也希望提供 Serverless 化的 RocketMQ 来降低成本，为用户提供更加极致弹性的云服务。

### 1.2 解决的问题

除了以上两个瓶颈之外，分级存储还希望解决的问题是

1. 消息仅支持保留固定的时间
2. Topic 的数据与 Broker 绑定，无法迁移。比如在 Broker 缩容的场景下，被削减的 Broker 上的历史数据无法保留。

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

### 3.1 技术架构选型

分级存储的方案中一个重要的选择是直写还是转写。

* **直写**：用高可用的存储或分布式文件系统直接替换本地块存储。优点是池化存储。
* **转写**：热数据使用本地块存储先顺序写，压缩之后转储到更廉价的存储系统中。优点是降低冷数据的长期存储成本。

最理想的终态可以是两者的结合，RocketMQ 自己来做数据转冷。因为消息系统自身对如何更好的压缩数据和加速读取的细节更了解，在转冷的过程中能够做一些消息系统内部的格式变化来加速冷数据的读取，减少 IO 次数、配置不同的 TTL 等。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202404141823483.png)

目前的分级存储方案考虑到商业和开源技术架构的一致性，选择先实现**转写**模式。具体包括以下一些考虑：

* 成本：将大部分冷数据卸载到更便宜的存储系统中后，热数据的存储成本可以显著减小，更直接的降低存储成本。
* 可移植性：直写分布式文件系统通常需要依赖特定 SDK，配合 RDMA 等技术来降低延迟，对应用不完全透明，运维、人力、技术复杂度都有一定上升。保留成熟的本地存储，只需要实现与其他存储后端的适配层就可以轻松切换多种存储后端。
* 延迟与性能：通常分布式文件系统跨可用区部署，消息写多数派成功才能被消费，存在跨可用区的延迟。直接写本地磁盘的延迟会小于跨可用区的延迟，其延迟在热数据读写的情况下也不是瓶颈。
* 可用性： 转写模式下，整个系统弱依赖二级存储，更适合开源与非公有云场景。

### 3.2 存储模型与抽象

分级存储的模型与本地存储的模型一一对应，结构上也类似。最大的区别在于分级存储模型的组织形式，其 CommitLog 不再将所有队列的消息数据都存在一起，而是按照队列的维度拆分存储。

下表展示了本地存储与分级存储模型的对应关系。

| 本地存储        | 分级存储             | 说明                                                         |
| --------------- | -------------------- | ------------------------------------------------------------ |
| MappedFile      | FileSegment          | 对应单个文件，MappedFile 是 mmap 实现的内存映射文件，FileSegment 是分级存储中文件的句柄 |
| MappedFileQueue | FlatAppendFile       | 多个 MappedFile/FileSegment 组成的链表，只有最后一个文件是可写的，前面的都是不可变的 |
| CommitLog       | FlatCommitLogFile    | MappedFileQueue/FlatAppendFile 的封装，CommitLog 是由所有队列的消息数据构成的文件，FlatCommitLogFile 存储单个队列中的消息数据 |
| ConsumeQueue    | FlatConsumeQueueFile | MappedFileQueue/FilatAppendFile 的封装，消费索引文件，保存着每个消息在 CommitLog 中的物理偏移量，用于消费每个队列的时候查询消息。本地存储的 ConsumeQueue 详解见 [这篇文章](./20220301-rocketmq-consumequeue.md) |
|                 | FlatMessageFile      | 分级存储引入的概念，表示单个队列的消息文件，组合 FlatCommitLogFile 和 FlatConsumeQueueFile，并提供一系列操作接口 |
| IndexFile       | IndexStoreFile       | 索引文件，也由一组文件构成，用于根据 Key 查询消息。本地存储的 IndexFile 类似一个 HashMap，hash 冲突时，value 是头插法构造成的一个链表。分级存储的 IndexStoreFile 最后一个文件格式与本地存储的 IndexFile 类似，但是列表前面的文件在写入完毕后会经过压缩。本地存储的 IndexFile 讲解见 [这篇文章](./20220301-rocketmq-indexfile.md) |

### 3.3 分层设计

分级存储的实现分为 3 层，从上至下分别是**接入层**、**容器层**、**驱动层**。

* **驱动层**最为底层，负责实现逻辑文件到具体的分级存储系统的映射。实现 `FileSegment` 接口，目前提供了内存和本地磁盘的实现。
* **容器层**为上面提到的存储模型除了 `FileSegment` 以外的其他分级存储抽象。
* **接入层**作为操作分级存储数据的入口，包含整个分级存储的 `MessageStore`，以及从分级存储读数据的 Fetcher 和写数据的 Dispatcher。

![](../assets/rocketmq-tiered-store/hierarchy.drawio.png)

### 3.4 写消息

写消息经过一次重构，由原来的实时上传改为**攒批**，纯**异步**上传。在相同流量下性能提升了 3 倍以上。

写消息逻辑由**消息分发器**处理，它是一个服务线程，每 20s 进行一次扫描，依次扫描所有的队列，决定是否要上传消息。

触发上传的条件有两个：距离上次提交达到一定时间（默认 30s），或者等待上传的消息超过一定数量（默认 4096）。

上传的过程是：

1. 先将等待上传的这部分消息放入刷盘缓冲区
2. 为这些消息创建消费队列，也是将消费队列数据放入刷盘缓冲区
3. 用一个专门的消息上传线程池异步上传已被放入缓冲区的消息。
4. 上传的过程中，先批量上传消息数据，上传成功后再批量上传消费索引数据（最后如果开启索引构建的话，再构建索引）

### 3.5 读消息

#### 3.5.1 读取策略

在分级存储的情况下，随着时间的推移，消息的存储位置也会经历 内存（Page Cache）-> 本地存储 -> 二级存储 这样的转变。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202404150040404.png)

RocketMQ 分级存储把读取策略抽象了出来，供用户自行配置，默认是 `NOT_IN_DISK`。

* DISABLE：禁用分级存储，所有 fetch 请求都将由本地消息存储处理。
* NOT_IN_DISK：只有 offset 不在本地存储中的 fetch 请求才会由分级存储处理。
* NOT_IN_MEM：只有 offset 不在内存中的 fetch 请求才会由分级存储处理。
* FORCE：所有 fetch 请求都将由分级存储处理。

#### 3.5.2 读取流程

为了加速从二级存储读取的速度和减少整体上对二级存储的请求次数，引入了预读缓存的设计。

* 首先根据读取策略，查询已提交二级存储的 offset 和消息是否在内存中这些信息来判断是否要走二级存储读取。

* 优先从预读缓存读取消息。（如果开启预读缓存功能）
* 如果从缓存中读到消息，直接返回。如果没有读到消息，立即从二级存储中拉取消息，拉取到后放入缓存，然后返回。
  * 从二级存储读取消息的过程：先读取消费队列数据，然后用消费队列数据查询消息数据，确定要读取消息数据的长度，最后从分级存储中读取消息数据并返回。

### 3.6 索引设计

#### 3.6.1 索引重排

[索引文件](./20220301-rocketmq-indexfile.md) 是为了根据 Key 查询消息而创建的。它的组织结构近似一个 HashMap，Key 为消息的 Key 进行 hash 之后的值，Value 包含了消息物理偏移量等信息。

当发生哈希冲突时（消息 Key 经过 hash 之后可能相同），采用链表的形式处理冲突，将新插入的 Value 插入 hash 槽的开头（头插法）。这样，每个 hash 槽就对应了一条按照插入时间倒序排列的链表。

但是这样的结构组成文件之后，读取一个 hash 槽对应的链表时，由于每个 Value 插入时间不是连续的，它们会分布在文件的不同位置，这样查询时就存在多次随机读。

冷存储的 IOPS 代价是十分昂贵的，所以在分级存储中面向查询进行优化，如下图所示。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202404150137847.png)

新的索引文件将每个 hash 槽所对应的 Value 重新排列，在文件中连续存储和读取，不再使用非连续的链表形式。这样可以让查询时的多次随机 IO 变成一次 IO。

#### 3.6.2 索引构建流程

分级存储的索引文件分为三个状态：

1. **UNSEALED**：初始状态，**类似**主存索引文件格式（顺序写），存储在本地磁盘上，正在被写入。一般只有最后一个索引文件处于该状态。路径为 `{storePath}/tiered_index_file/{时间戳}`
2. **SEALED**：已经或正在被压缩成新格式的索引文件，还未上传到外部存储。路径为 `{storePath}/tiered_index_file/compacting/{时间戳}`
3. **UPLOAD**：已经上传到二级存储。



索引文件在消息上传到二级存储后开始构建，每次写入只会写入文件列表最后一个处于 `UNSEALED` 状态的文件。当一个索引文件写满后，把它改为 `SEALED` 状态，并新建一个 `UNSEALED` 的索引文件。

索引文件服务启动一个线程，每 10s 扫描一次，找到创建时间**最早**的处于 `SEALED` 状态的索引文件，**压缩**并上传到二级存储。

**压缩**的过程会在 `compacting` 目录创建一个新格式的索引文件，然后遍历老索引文件，将内容重新排列后写入新的索引文件，最后将新索引文件内容上传到二级存储。上传完成之后会删掉处于本地的新老索引文件。

## 4. 详细设计

## 5. 源码解析

### 5.1 分级存储接入



### 5.2 写消息

#### 5.2.1 MessageStoreDispatcherImpl

```java
/**
 * 定时任务，每隔 20 秒为每个队列执行一次分发
 */
@Override
public void run() {
    log.info("{} service started", this.getServiceName());
    while (!this.isStopped()) {
        flatFileStore.deepCopyFlatFileToList().forEach(this::dispatchWithSemaphore);
        this.waitForRunning(Duration.ofSeconds(20).toMillis());
    }
    log.info("{} service shutdown", this.getServiceName());
}

/**
 * 分发消息，将消息写入到 {@link FlatMessageFile} 文件中
 *
 * @param flatFile
 * @param force true: 等待直到获取锁成功，false: 获取锁失败时直接返回
 * @return
 */
@Override
public CompletableFuture<Boolean> doScheduleDispatch(FlatFileInterface flatFile, boolean force) {
    if (stopped) {
        return CompletableFuture.completedFuture(true);
    }

    String topic = flatFile.getMessageQueue().getTopic();
    int queueId = flatFile.getMessageQueue().getQueueId();

    // 获取分级存储文件锁，写消息。force 为 true 时，会待直到获取锁成功
    // For test scenarios, we set the 'force' variable to true to
    // ensure that the data in the cache is directly committed successfully.
    force = !storeConfig.isTieredStoreGroupCommit() || force;
    if (force) {
        flatFile.getFileLock().lock();
    } else {
        if (!flatFile.getFileLock().tryLock()) {
            return CompletableFuture.completedFuture(false);
        }
    }

    try {
        // 如果 Topic 被过滤，则直接销毁文件
        if (topicFilter != null && topicFilter.filterTopic(flatFile.getMessageQueue().getTopic())) {
            flatFileStore.destroyFile(flatFile.getMessageQueue());
            return CompletableFuture.completedFuture(false);
        }

        // 已经提交到缓冲区的 ConsumeQueue offset
        long currentOffset = flatFile.getConsumeQueueMaxOffset();
        // 已经刷盘的 ConsumeQueue offset
        long commitOffset = flatFile.getConsumeQueueCommitOffset();
        long minOffsetInQueue = defaultStore.getMinOffsetInQueue(topic, queueId);
        long maxOffsetInQueue = defaultStore.getMaxOffsetInQueue(topic, queueId);

        // 如果 ConsumeQueue 的 FileSegment 文件完全没有初始化，则初始化文件
        // If set to max offset here, some written messages may be lost
        if (!flatFile.isFlatFileInit()) {
            currentOffset = Math.max(minOffsetInQueue,
                maxOffsetInQueue - storeConfig.getTieredStoreGroupCommitSize());
            flatFile.initOffset(currentOffset);
            return CompletableFuture.completedFuture(true);
        }

        // 如果上一次刷盘失败（已刷盘 offset 小于提交到缓冲区的 offset，说明没有全部刷盘成功），立即重试上次刷盘
        // If the previous commit fails, attempt to trigger a commit directly.
        if (commitOffset < currentOffset) {
            this.commitAsync(flatFile);
            return CompletableFuture.completedFuture(false);
        }

        // 如果当前 offset 小于最小 offset，则销毁文件，重新创建文件
        if (currentOffset < minOffsetInQueue) {
            log.warn("MessageDispatcher#dispatch, current offset is too small, " +
                    "topic={}, queueId={}, offset={}-{}, current={}",
                topic, queueId, minOffsetInQueue, maxOffsetInQueue, currentOffset);
            flatFileStore.destroyFile(flatFile.getMessageQueue());
            flatFileStore.computeIfAbsent(new MessageQueue(topic, brokerName, queueId));
            return CompletableFuture.completedFuture(true);
        }

        if (currentOffset > maxOffsetInQueue) {
            log.warn("MessageDispatcher#dispatch, current offset is too large, " +
                    "topic: {}, queueId: {}, offset={}-{}, current={}",
                topic, queueId, minOffsetInQueue, maxOffsetInQueue, currentOffset);
            return CompletableFuture.completedFuture(false);
        }

        // 如果超过滚动时间（24h），则滚动文件
        long interval = TimeUnit.HOURS.toMillis(storeConfig.getCommitLogRollingInterval());
        if (flatFile.rollingFile(interval)) {
            log.info("MessageDispatcher#dispatch, rolling file, " +
                    "topic: {}, queueId: {}, offset={}-{}, current={}",
                topic, queueId, minOffsetInQueue, maxOffsetInQueue, currentOffset);
        }

        if (currentOffset == maxOffsetInQueue) {
            return CompletableFuture.completedFuture(false);
        }

        long bufferSize = 0L;
        long groupCommitSize = storeConfig.getTieredStoreGroupCommitSize();
        long groupCommitCount = storeConfig.getTieredStoreGroupCommitCount();
        // 计算目标 offset，为当前以提交到缓冲区的 ConsumeQueue offset 加上单次提交的消息数阈值
        long targetOffset = Math.min(currentOffset + groupCommitCount, maxOffsetInQueue);

        // 判断是否需要立即提交，还是继续攒批
        // 取出最后 append 到缓冲区的一条消息
        ConsumeQueueInterface consumeQueue = defaultStore.getConsumeQueue(topic, queueId);
        CqUnit cqUnit = consumeQueue.get(currentOffset);
        SelectMappedBufferResult message =
            defaultStore.selectOneMessageByOffset(cqUnit.getPos(), cqUnit.getSize());
        // 超时：上次提交到当前时间是否超过分级存储存储的提交时间阈值（30s）
        boolean timeout = MessageFormatUtil.getStoreTimeStamp(message.getByteBuffer()) +
            storeConfig.getTieredStoreGroupCommitTimeout() < System.currentTimeMillis();
        // 缓冲区满：当前队列等待提交的消息数量超过阈值（4096）
        boolean bufferFull = maxOffsetInQueue - currentOffset > storeConfig.getTieredStoreGroupCommitCount();

        if (!timeout && !bufferFull && !force) {
            // 如果没有到提交时间阈值、缓冲区没有满、没有强制刷盘，则不进行刷盘，继续攒批
            log.debug("MessageDispatcher#dispatch hold, topic={}, queueId={}, offset={}-{}, current={}, remain={}",
                topic, queueId, minOffsetInQueue, maxOffsetInQueue, currentOffset, maxOffsetInQueue - currentOffset);
            return CompletableFuture.completedFuture(false);
        } else {
            // 如果到提交时间阈值或者缓冲区满或者强制刷盘，则进行刷盘
            if (MessageFormatUtil.getStoreTimeStamp(message.getByteBuffer()) +
                TimeUnit.MINUTES.toMillis(5) < System.currentTimeMillis()) {
                log.warn("MessageDispatcher#dispatch behind too much, topic={}, queueId={}, offset={}-{}, current={}, remain={}",
                    topic, queueId, minOffsetInQueue, maxOffsetInQueue, currentOffset, maxOffsetInQueue - currentOffset);
            } else {
                log.info("MessageDispatcher#dispatch, topic={}, queueId={}, offset={}-{}, current={}, remain={}",
                    topic, queueId, minOffsetInQueue, maxOffsetInQueue, currentOffset, maxOffsetInQueue - currentOffset);
            }
        }
        message.release();

        // 准备提交，先将消息放入缓冲区
        // 对于目标偏移量之前的每个偏移量，从消费队列中获取消费队列单元，然后根据其从本地存储中查询消息
        // 将消息追加到 CommitLog 缓冲区，并将分发请求追加到 ConsumeQueue 缓冲区
        long offset = currentOffset;
        for (; offset < targetOffset; offset++) {
            cqUnit = consumeQueue.get(offset);
            bufferSize += cqUnit.getSize();
            if (bufferSize >= groupCommitSize) {
                break;
            }
            message = defaultStore.selectOneMessageByOffset(cqUnit.getPos(), cqUnit.getSize());

            // 将消息追加到分级存储 CommitLog 缓冲区
            ByteBuffer byteBuffer = message.getByteBuffer();
            AppendResult result = flatFile.appendCommitLog(message);
            if (!AppendResult.SUCCESS.equals(result)) {
                break;
            }

            long mappedCommitLogOffset = flatFile.getCommitLogMaxOffset() - byteBuffer.remaining();
            Map<String, String> properties = MessageFormatUtil.getProperties(byteBuffer);

            DispatchRequest dispatchRequest = new DispatchRequest(topic, queueId, mappedCommitLogOffset,
                cqUnit.getSize(), cqUnit.getTagsCode(), MessageFormatUtil.getStoreTimeStamp(byteBuffer),
                cqUnit.getQueueOffset(), properties.getOrDefault(MessageConst.PROPERTY_KEYS, ""),
                properties.getOrDefault(MessageConst.PROPERTY_UNIQ_CLIENT_MESSAGE_ID_KEYIDX, ""),
                0, 0, new HashMap<>());
            dispatchRequest.setOffsetId(MessageFormatUtil.getOffsetId(byteBuffer));

            // 提交一个 DispatchRequest 到分级存储 ConsumeQueue
            result = flatFile.appendConsumeQueue(dispatchRequest);
            if (!AppendResult.SUCCESS.equals(result)) {
                break;
            }
        }

        // 如果等待提交的消息数量超过阈值（4096），立即进行下一次提交
        // If there are many messages waiting to be uploaded, call the upload logic immediately.
        boolean repeat = timeout || maxOffsetInQueue - offset > storeConfig.getTieredStoreGroupCommitCount();

        // 如果 FlatMessageFile 中待分发的 ConsumeQueue 请求不为空，则将缓冲区中的数据刷到二级存储
        if (!flatFile.getDispatchRequestList().isEmpty()) {
            Attributes attributes = TieredStoreMetricsManager.newAttributesBuilder()
                .put(TieredStoreMetricsConstant.LABEL_TOPIC, topic)
                .put(TieredStoreMetricsConstant.LABEL_QUEUE_ID, queueId)
                .put(TieredStoreMetricsConstant.LABEL_FILE_TYPE, FileSegmentType.COMMIT_LOG.name().toLowerCase())
                .build();
            TieredStoreMetricsManager.messagesDispatchTotal.add(offset - currentOffset, attributes);

            this.commitAsync(flatFile).whenComplete((unused, throwable) -> {
                    if (repeat) {
                        // 如果等待提交的消息数量超过阈值（4096），立即进行下一次提交
                        storeExecutor.commonExecutor.submit(() -> dispatchWithSemaphore(flatFile));
                    }
                }
            );
        }
    } finally {
        flatFile.getFileLock().unlock();
    }
    return CompletableFuture.completedFuture(false);
}

/**
 * 执行 CommitLog 刷盘，再执行 ConsumeQueue 的刷盘，再执行 Index 构建（如果开启 Index）
 *
 * @param flatFile
 * @return
 */
public CompletableFuture<Void> commitAsync(FlatFileInterface flatFile) {
    return flatFile.commitAsync().thenAcceptAsync(success -> {
        if (success) {
            if (storeConfig.isMessageIndexEnable()) {
                flatFile.getDispatchRequestList().forEach(
                    request -> constructIndexFile(flatFile.getTopicId(), request));
            }
            flatFile.release();
        }
    }, MessageStoreExecutor.getInstance().bufferCommitExecutor);
}
```

#### 5.2.2 FileSegment#commitAsync

```java
/**
 * 将 {@link #bufferList} 中的数据写入分级存储文件中
 *
 * @return
 */
@SuppressWarnings("NonAtomicOperationOnVolatileField")
public CompletableFuture<Boolean> commitAsync() {
    if (closed) {
        return CompletableFuture.completedFuture(false);
    }

    if (!needCommit()) {
        return CompletableFuture.completedFuture(true);
    }

    // acquire lock
    if (commitLock.drainPermits() <= 0) {
        return CompletableFuture.completedFuture(false);
    }

    // 处理上次提交的错误（如果 fileSegmentInputStream 不为空）
    // handle last commit error
    if (fileSegmentInputStream != null) {
        long fileSize = this.getSize();
        if (fileSize == GET_FILE_SIZE_ERROR) {
            log.error("FileSegment correct position error, fileName={}, commit={}, append={}, buffer={}",
                this.getPath(), commitPosition, appendPosition, fileSegmentInputStream.getContentLength());
            releaseCommitLock();
            return CompletableFuture.completedFuture(false);
        }
        if (correctPosition(fileSize)) {
            fileSegmentInputStream = null;
        }
    }

    // 计算要提交数据的大小，并创建一个 FileSegmentInputStream 自定义输入流
    int bufferSize;
    if (fileSegmentInputStream != null) {
        // 上次提交失败，重置输入流，重新提交
        fileSegmentInputStream.rewind();
        bufferSize = fileSegmentInputStream.available();
    } else {
        // 上次提交成功，用 bufferList 中的 ByteBuffer 创建新的输入流
        List<ByteBuffer> bufferList = this.borrowBuffer();
        bufferSize = bufferList.stream().mapToInt(ByteBuffer::remaining).sum();
        if (bufferSize == 0) {
            // 没有数据要提交，释放提交锁
            releaseCommitLock();
            return CompletableFuture.completedFuture(true);
        }
        fileSegmentInputStream = FileSegmentInputStreamFactory.build(
            fileType, this.getCommitOffset(), bufferList, null, bufferSize);
    }

    // 调用 commit0 方法执行实际提交操作
    boolean append = fileType != FileSegmentType.INDEX;
    return flightCommitRequest =
        this.commit0(fileSegmentInputStream, commitPosition, bufferSize, append)
            // 处理提交操作结果
            .thenApply(result -> {
                if (result) {
                    // 提交成功，更新 commit offset，清空 fileSegmentInputStream
                    commitPosition += bufferSize;
                    fileSegmentInputStream = null;
                    return true;
                } else {
                    // 提交失败，重置 fileSegmentInputStream
                    fileSegmentInputStream.rewind();
                    return false;
                }
            })
            .exceptionally(this::handleCommitException)
            .whenComplete((result, e) -> releaseCommitLock());
}
```


### 5.3 读消息

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