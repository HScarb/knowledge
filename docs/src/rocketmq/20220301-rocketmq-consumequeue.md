---
title: RocketMQ ConsumeQueue 消费队列文件
author: Scarb
date: 2022-03-01
---

原文地址：[http://hscarb.github.io/rocketmq/20220301-rocketmq-consumequeue.html](http://hscarb.github.io/rocketmq/20220301-rocketmq-consumequeue.html)

# RocketMQ ConsumeQueue 消费队列文件

[[toc]]

## 1. 概述

### 1.1 ConsumeQueue 是什么

ConsumeQueue，又称作消费队列，是 RocketMQ 存储系统的一部分，保存在磁盘中。

该文件可以看作 CommitLog 关于消息消费的“索引”文件。

ConsumeQueue 是一个 MappedFileQueue，即每个文件大小相同的内存映射文件队列。每个文件由大小和格式相同的索引项构成。

每一个 Topic 的 Queue，都对应一个 ConsumeQueue。

### 1.2 ConsumeQueue 的作用

引入 ConsumeQueue 的目的主要是适应消息的检索需求，提高消息消费的性能。

Broker 中所有 Topic 的消息都保存在 CommitLog 中，所以同一 Topic 的消息在 CommitLog 中不是连续存储的。消费某一 Topic 消息时去遍历 CommitLog 是非常低效的，所以引入了 ConsumeQueue。

一个 ConsumeQueue 保存了一个 Topic 的某个 Queue 下所有消息在 CommitLog 中的起始物理偏移量offset，消息大小size和消息Tag的HashCode值。当需要消费这个 Topic 时，只需要找到对应的 ConsumeQueue 开始遍历，根据消息在 CommitLog 中的偏移量即可找到消息保存的位置。

## 2. 概要设计

### 2.1 文件结构

ConsumeQueue 文件保存在 store 目录下的 `consumequeue` 目录中。

会为每个 Topic 单独创建一个目录，随后为这个 Topic 中的每个 Queue 单独创建一个目录。

```
storepath
├─commitlog
│      00000000000000000000
│      00000000000000102400
│      00000000000000204800
│      00000000000000307200
│
├─consumequeue
│  └─b4b690a3-63b0-42b7-9c52-9e01a24a24d4
│      └─0
│              00000000000000000000
│              00000000000000001040
│              00000000000000002080
│              00000000000000003120
│              00000000000000004160
│              00000000000000005200
│              00000000000000006240
│              00000000000000007280
......
```

ConsumeQueue 是数量可无限扩展的映射文件，每个文件大小固定。

文件中的最小单元是索引项，包含

- 消息在 CommitLog 中的物理偏移量
- 消息大小
- 消息的 Tag Hash 码

可以把 ConsumeQueue 看作是索引项组成的数组

### 2.2 构建

消息保存到 CommitLog 之后，会进行重投递。重投递消息的过程就是为了建立消息的索引文件（包括 ConsumeQueue 和 IndexFile）。

重投递线程会扫描是否有新消息被保存到 CommitLog，如果有则将这条消息查出来，执行重投递逻辑，构建该消息的索引。

### 2.3 查询消息

由于每个索引项的大小是固定的，所以只要知道消息在 Queue 中的逻辑偏移量，可以马上算出索引在 ConsumeQueue 中的位置。

根据消费的 Topic 和 QueueId 查询出相应的 ConsumeQueue 消费队列。

然后根据位置获取 ConsumeQueue 中的索引项，其中保存有消息在 CommitLog 中的偏移量和消息大小，进而到 CommitLog 中查询出消息。

同时 ConsumeQueue 还支持通过消息存储时间来查询具体消息，内部使用二分查找算法。

### 2.4 刷盘

由一个单独的线程进行持久化，每隔 1s 进行一次判断。

当写入的索引数超过阈值，或刷盘间隔时间超过 60s，则进行一次刷盘。

### 2.5 恢复

1. Broker启动时，遍历所有ConsumeQueue目录下的文件，加载这些文件。
2. 对每个ConsumeQueue执行恢复操作。
3. 从倒数第三个文件开始往后遍历，遍历文件的每个索引项进行校验，更新最大可用偏移量。

## 3. 详细设计

### 3.1 文件结构

ConsumeQueue 的文件结构可以看作是一个可以无限扩展的数组，每个数组元素是一个索引项，其格式和大小是固定的。

![Consume queue index item structure](https://raw.githubusercontent.com/HScarb/drawio-diagrams/main/rocketmq/store/rocketmq_consume_queue_item.drawio.svg)

Consume queue index item structure

索引项的结构很简单，如上图所示。其中 Tag HashCode 用作消息过滤。

![Untitled](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203152217708.png)

上图来自[艾瑞克的技术江湖](http://mp.weixin.qq.com/profile?src=3&timestamp=1643967524&ver=1&signature=L5ju94P7rRWmLJItwD8ajYAsvtj30i4-lUs0DufOdsYPxkXVknG7rDTxRyqDi2xoVQFLKFidOz3We*H5bb5JZw==)

可以看到，对于同一个 Topic 的消息，首先保存到 CommitLog 中。每个 Topic 的 Queue 都会创建一个 ConsumeQueue，内部保存该 Queue 中所有消息的索引项。

### 3.2 构建

![https://raw.githubusercontent.com/HScarb/drawio-diagrams/main/rocketmq/store/rocketmq_consume_queue_build_sequence.drawio.svg](https://raw.githubusercontent.com/HScarb/drawio-diagrams/main/rocketmq/store/rocketmq_consume_queue_build_sequence.drawio.svg)

消息会被先保存到 CommitLog 中，随后由一个独立线程`DefaultMessageStore.ReputMessageService#doreput()`对 CommitLog 进行扫描。

当扫描到新消息被保存到 CommitLog 时，会执行 dispatch（转发） 操作，运行所有消息 Dispatcher，来构建 ConsumeQueue 和 IndexFile。

其中 `DefaultMessageStore.CommitLogDispatcherBuildConsumeQueue` 就是用来创建 ConsumeQueue 的。其 `dispatch()` 方法将刚刚保存的消息存入 ConsumeQueue 中。

内部调用了 `ConsumeQueue#putMessagePositionInfo()` 方法，写内存映射文件，将消息真正存入 ConsumeQueue。

### 3.3 查询消息

客户端发起消息消费请求，请求码为`RequestCode.PULL_MESSAGE`，对应的处理类为`PullMessageProcessor`。Broker 在收到客户端的请求之后，会根据topic和queueId定位到对应的 ConsumeQueue。然后根据这条请求传入的offset消费队列偏移量，定位到对应消息。

在存储层面查询消息的入口是 `DefaultMessageStore#getMessage()`。

```java
GetMessageResult getMessage(final String group, final String topic, final int queueId, final long offset,
    final int maxMsgNums,
    final MessageFilter messageFilter)
```

这个方法中根据`topic`和`queueId`查询相应的ConsumeQueue，然后使用`offset`从ConsumeQueue中获取相应位置的索引信息。

随后使用查出来的`phyOffset`和`size`到CommitLog中查询消息并返回。

### 3.4 刷盘

由一个单独的线程`FlushConsumeQueueService`周期性检查和刷盘，检查周期`flushIntervalConsumeQueue`可配置，默认为 1s。

执行刷盘有两个阈值

1.  `flushConsumeQueueThoroughInterval`（默认 60s）内如果没有执行过刷盘操作，则会执行一次刷盘
2. 需要刷盘的数据超过`getFlushConsumeQueueLeastPages`（默认2）个操作系统页

### 3.5 恢复

1. Broker启动时，调用`DefaultMessageStore#loadConsumeQueue()`遍历所有ConsumeQueue目录下的文件，加载这些文件。
2. 随后进行恢复操作`recoverConsumeQueue()`遍历每个ConsumeQueue执行恢复recover()。
3. 从倒数第三个文件开始往后遍历，遍历文件的每个索引项进行校验，校验成功则更新当前文件的最大可用偏移量，否则直接退出。最后更新整个队列的可用偏移量，删除多余的文件。

## 4. 源码解析

与 ConsumeQueue 相关的类有

- ConsumeQueue
- ConsumeQueueExt
- DefaultMessageStore

下面分析 ConsumeQueue 相关操作的源码实现

### 4.1 构建

ConsumeQueue 的构建入口是`ReputMessageService#doReput()`方法，它会从 CommitLog 中扫描新的消息，然后转发和构建 ConsumeQueue。

#### 4.1.1 ReputMessageService#doReput

- 当 CommitLog 可用，一直从上一条消息末尾位置开始循环扫描新消息
- 如找到消息，将消息封装成`DispatchRequest`，分发给各个处理器（`CommitLogDispatcher`）

```java
private void doReput() {
		// ...

    // CommitLog可用则一直进行循环扫描
    for (boolean doNext = true; this.isCommitLogAvailable() && doNext; ) {

        // 从上一条消息的结束位置开始获取下一条消息
        SelectMappedBufferResult result = DefaultMessageStore.this.commitLog.getData(reputFromOffset);
        if (result != null) {
            try {
                // 更新分发的偏移量为当前分发消息的起始偏移量
                this.reputFromOffset = result.getStartOffset();

                for (int readSize = 0; readSize < result.getSize() && doNext; ) {
                    // 检查消息，查询并解析消息，构建消息的DispatchRequest
                    DispatchRequest dispatchRequest =
                        DefaultMessageStore.this.commitLog.checkMessageAndReturnSize(result.getByteBuffer(), false, false);
                    int size = dispatchRequest.getBufferSize() == -1 ? dispatchRequest.getMsgSize() : dispatchRequest.getBufferSize();

                    if (dispatchRequest.isSuccess()) {
                        if (size > 0) {
                            // 将DispatchRequest分发给所有注册dispatcherList中的CommitLogDispatcher进行处理
                            DefaultMessageStore.this.doDispatch(dispatchRequest);
                            // 通知消息消费长轮询线程，有新的消息落盘，立即唤醒挂起的消息拉取请求
                            if (BrokerRole.SLAVE != DefaultMessageStore.this.getMessageStoreConfig().getBrokerRole()
                                    && DefaultMessageStore.this.brokerConfig.isLongPollingEnable()
                                    && DefaultMessageStore.this.messageArrivingListener != null) {
                                DefaultMessageStore.this.messageArrivingListener.arriving(dispatchRequest.getTopic(),
                                    dispatchRequest.getQueueId(), dispatchRequest.getConsumeQueueOffset() + 1,
                                    dispatchRequest.getTagsCode(), dispatchRequest.getStoreTimestamp(),
                                    dispatchRequest.getBitMap(), dispatchRequest.getPropertiesMap());
                            }
		// ...
}
```

#### 4.1.2 DefaultMessageStore#doDispatch

- 在`doReput`方法中被调用
- 内部遍历所有`dispatcherList`中的分发器，执行每个分发器的`dispatch`方法

```java
public void doDispatch(DispatchRequest req) {
    for (CommitLogDispatcher dispatcher : this.dispatcherList) {
        dispatcher.dispatch(req);
    }
}
```

#### 4.1.3 CommitLogDispatcherBuildConsumeQueue#dispatch

- 判断消息的事务属性
- 根据 Topic 和 queueId 查找 ConsumeQueue
- 调用 ConsumeQueue 的保存方法

```java
public void dispatch(DispatchRequest request) {
    final int tranType = MessageSysFlag.getTransactionValue(request.getSysFlag());
    switch (tranType) {
        // 非事务消息或Commit类型的事务消息才执行分发
        case MessageSysFlag.TRANSACTION_NOT_TYPE:
        case MessageSysFlag.TRANSACTION_COMMIT_TYPE:
            // 将请求分发到 ConsumeQueue
            DefaultMessageStore.this.putMessagePositionInfo(request);
            break;
        case MessageSysFlag.TRANSACTION_PREPARED_TYPE:
        case MessageSysFlag.TRANSACTION_ROLLBACK_TYPE:
            break;
    }
}
```

```java
/**
 * 将请求分发到具体的 ConsumeQueue
 *
 * @param dispatchRequest 消息的分发请求
 */
public void putMessagePositionInfo(DispatchRequest dispatchRequest) {
    ConsumeQueue cq = this.findConsumeQueue(dispatchRequest.getTopic(), dispatchRequest.getQueueId());
    cq.putMessagePositionInfoWrapper(dispatchRequest);
}
```

#### 4.1.4 ConsumeQueue#putMessagePosiitonInfo

- 被`putMessagePositionInfoWrapper`调用
- 用于往ConsumeQueue中写入索引项

该函数的大致逻辑如下

1. 将索引项的三个参数写入 ByteBuffer
2. 计算应该写入 ConsumeQueue 的物理偏移量
3. 将 ByteBuffer 中的数据写入 ConsumeQueue 文件

---

注意该函数的入参中有一个`cqOffset`，表示消息在该 ConsumeQueue 中的逻辑偏移量。那么消息索引都还没有被存入 ConsumeQueue，它在 ConsumeQueue 里的逻辑偏移量怎么已经被计算出来了？

其实这个值在消息被保存到 CommitLog 时就已经计算出来并保存到 CommitLog 中了，计算的逻辑在 `CommitLog#doAppend` 方法中。

具体的实现方法是：CommitLog 中的 `topicQueueTable` 变量保存着每个 ConsumeQueue 当前的最新逻辑偏移量。当应当保存在该 ConsumeQueue 的新消息被保存到 CommitLog，会从 topicQueueTable 获取最新的偏移量，并且将该偏移量加一。源码不在此处展示。

---

```java
/**
 * 往ConsumeQueue中写入索引项，putMessagePositionInfo只有一个线程调用，所以不需要加锁
 *
 * @param offset CommitLog offset
 * @param size 消息在CommitLog存储的大小
 * @param tagsCode 过滤tag的hashcode
 * @param cqOffset 消息在ConsumeQueue中的逻辑偏移量。在 {@link CommitLog#doAppend} 方法中已经生成并保存
 * @return 是否成功
 */
private boolean putMessagePositionInfo(final long offset, final int size, final long tagsCode,
    final long cqOffset) {

    // CommitLog offset + size 小于ConsumeQueue中保存的最大CommitLog物理偏移量，说明这个消息重复生成ConsumeQueue，直接返回
    // 多见于关机恢复的场景。关机恢复从倒数第3个CommitLog文件开始重新转发消息生成ConsumeQueue
    if (offset + size <= this.maxPhysicOffset) {
        log.warn("Maybe try to build consume queue repeatedly maxPhysicOffset={} phyOffset={}", maxPhysicOffset, offset);
        return true;
    }

    // NIO ByteBuffer 写入三个参数
    this.byteBufferIndex.flip();
    this.byteBufferIndex.limit(CQ_STORE_UNIT_SIZE);
    this.byteBufferIndex.putLong(offset);
    this.byteBufferIndex.putInt(size);
    this.byteBufferIndex.putLong(tagsCode);

    // 计算本次期望写入ConsumeQueue的物理偏移量
    final long expectLogicOffset = cqOffset * CQ_STORE_UNIT_SIZE;

    // 根据期望的偏移量找到对应的内存映射文件
    MappedFile mappedFile = this.mappedFileQueue.getLastMappedFile(expectLogicOffset);
    if (mappedFile != null) {
        // 纠正MappedFile逻辑队列索引顺序
        // 如果MappedFileQueue中的MappedFile列表被删除
        // 这时需要保证消息队列的逻辑位置和ConsumeQueue文件的起始文件的偏移量一致，要补充空的消息索引
        if (mappedFile.isFirstCreateInQueue() && cqOffset != 0 && mappedFile.getWrotePosition() == 0) {
            this.minLogicOffset = expectLogicOffset;
            this.mappedFileQueue.setFlushedWhere(expectLogicOffset);
            this.mappedFileQueue.setCommittedWhere(expectLogicOffset);
            // 填充空的消息索引
            this.fillPreBlank(mappedFile, expectLogicOffset);
            log.info("fill pre blank space " + mappedFile.getFileName() + " " + expectLogicOffset + " "
                + mappedFile.getWrotePosition());
        }

        if (cqOffset != 0) {
            // 当前ConsumeQueue被写过的物理offset = 该MappedFile被写过的位置 + 该MappedFile起始物理偏移量
            // 注意：此时消息还没从内存刷到磁盘，如果是异步刷盘，Broker断电就会存在数据丢失的情况
            // 此时消费者消费不到，所以在重要业务中使用同步刷盘确保数据不丢失
            long currentLogicOffset = mappedFile.getWrotePosition() + mappedFile.getFileFromOffset();
            
            // 如果期望写入的位置 < 当前ConsumeQueue被写过的位置，说明是重复写入，直接返回
            if (expectLogicOffset < currentLogicOffset) {
                log.warn("Build  consume queue repeatedly, expectLogicOffset: {} currentLogicOffset: {} Topic: {} QID: {} Diff: {}",
                    expectLogicOffset, currentLogicOffset, this.topic, this.queueId, expectLogicOffset - currentLogicOffset);
                return true;
            }
            
            // 期望写入的位置应该等于被写过的位置
            if (expectLogicOffset != currentLogicOffset) {
                LOG_ERROR.warn(
                    "[BUG]logic queue order maybe wrong, expectLogicOffset: {} currentLogicOffset: {} Topic: {} QID: {} Diff: {}",
                    expectLogicOffset,
                    currentLogicOffset,
                    this.topic,
                    this.queueId,
                    expectLogicOffset - currentLogicOffset
                );
            }
        }
        this.maxPhysicOffset = offset + size;
        // 将一个ConsumeQueue数据写盘，此时并未刷盘
        return mappedFile.appendMessage(this.byteBufferIndex.array());
    }
    return false;
}
```

### 4.2 查询消息

客户端发起消息消费请求，请求码为`RequestCode.PULL_MESSAGE`，对应的处理类为`PullMessageProcessor`，服务器在收到客户端的请求之后，会根据topic和queueId定位到对应的消费队列。然后根据这条请求传入的offset消费队列偏移量，定位到对应的消费队列文件。

存储层查询消息的入口是 `DefaultMessageStore#getMessage`。

#### 4.2.1 DefaultMessageStore#getMessage

该方法的调用关系如下图所示

![Untitled](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203152217709.png)

1. 根据 Topic 和 QueueId 查询 ConsumeQueue
2. 根据逻辑偏移量从 ConsumeQueue 中查出索引项
3. 使用索引项中的 CommitLog 物理 offset 和消息的 size，从 CommitLog 查询消息
4. 使用索引项中的 Tag HashCode 处理消息过滤的逻辑

```java
/**
 * 获取消息
 *
 * @param group Consumer group that launches this query. 消费者组
 * @param topic Topic to query. 主题
 * @param queueId Queue ID to query. 队列ID
 * @param offset Logical offset to start from. 消息在队列中的逻辑偏移量
 * @param maxMsgNums Maximum count of messages to query. 查询的最大消息数量
 * @param messageFilter Message filter used to screen desired messages. 消息过滤器
 * @return 查询消息结果
 */
public GetMessageResult getMessage(final String group, final String topic, final int queueId, final long offset,
    final int maxMsgNums,
    final MessageFilter messageFilter) {
		// ...
    ConsumeQueue consumeQueue = findConsumeQueue(topic, queueId);
    if (consumeQueue != null) {
       if (/*...*/) {
					// ...
        } else {
						// 根据逻辑偏移量从 ConsumeQueue 中查出索引项
            SelectMappedBufferResult bufferConsumeQueue = consumeQueue.getIndexBuffer(offset);
            if (bufferConsumeQueue != null) {
                try {
                    // ...
										// 从消费队列中读取消息，直到读完或者读到查询消息数的最大值
                    for (; i < bufferConsumeQueue.getSize() && i < maxFilterMessageCount; i += ConsumeQueue.CQ_STORE_UNIT_SIZE) {
                        long offsetPy = bufferConsumeQueue.getByteBuffer().getLong();
                        int sizePy = bufferConsumeQueue.getByteBuffer().getInt();
                        long tagsCode = bufferConsumeQueue.getByteBuffer().getLong();

                        maxPhyOffsetPulling = offsetPy;

                        // ...

                        // 消息过滤
                        if (messageFilter != null
                            && !messageFilter.isMatchedByConsumeQueue(isTagsCodeLegal ? tagsCode : null, extRet ? cqExtUnit : null)) {
                            if (getResult.getBufferTotalSize() == 0) {
                                status = GetMessageStatus.NO_MATCHED_MESSAGE;
                            }

                            continue;
                        }

                        // 根据消息的偏移量和消息的大小从 CommitLog 文件中取出一条消息
                        SelectMappedBufferResult selectResult = this.commitLog.getMessage(offsetPy, sizePy);
                        if (null == selectResult) {
                            if (getResult.getBufferTotalSize() == 0) {
                                status = GetMessageStatus.MESSAGE_WAS_REMOVING;
                            }

                            nextPhyFileStartOffset = this.commitLog.rollNextFile(offsetPy);
                            continue;
                        }
		// ...
}
```

### 4.3 刷盘

putMessagePositionInfo 中调用 MappedFile#appendMessage，但这并不表示消息会被立刻持久化到磁盘中。

持久化的过程是通过后台服务 FlushConsumeQueueService 来定时持久化的，每隔1s检查一次。

#### 4.3.1 FlushConsumeQueueService#doFlush

该方法每隔 1s 执行一次。

1. 比较上次刷盘时间与当前时间差距，如果小于等于 60s，则执行刷盘
2. 遍历 ConsumeQueue 执行刷盘，每隔 ConsumeQueue 至少刷 2 个操作系统页
3. 更新 StoreCheckpoint 中的最新刷盘时间

```java
private void doFlush(int retryTimes) {
    // 变量含义：如果大于0，则标识这次刷盘必须刷多少个page，如果=0，则有多少刷多少。
    // 默认为2，表示每次至少刷2个操作系统page
    int flushConsumeQueueLeastPages = DefaultMessageStore.this.getMessageStoreConfig().getFlushConsumeQueueLeastPages();

    // 程序退出时强制刷盘
    if (retryTimes == RETRY_TIMES_OVER) {
        flushConsumeQueueLeastPages = 0;
    }

    long logicsMsgTimestamp = 0;

    // 一定时间内未执行刷盘，会强制刷盘，默认60s
    int flushConsumeQueueThoroughInterval = DefaultMessageStore.this.getMessageStoreConfig().getFlushConsumeQueueThoroughInterval();
    long currentTimeMillis = System.currentTimeMillis();
    if (currentTimeMillis >= (this.lastFlushTimestamp + flushConsumeQueueThoroughInterval)) {
        // 当时间满足flushConsumeQueueThoroughInterval时，即使写入的数量不足flushConsumeQueueLeastPages，也进行flush
        this.lastFlushTimestamp = currentTimeMillis;
        flushConsumeQueueLeastPages = 0;
        logicsMsgTimestamp = DefaultMessageStore.this.getStoreCheckpoint().getLogicsMsgTimestamp();
    }

    ConcurrentMap<String, ConcurrentMap<Integer, ConsumeQueue>> tables = DefaultMessageStore.this.consumeQueueTable;

    // 遍历ConsumeQueue刷盘
    for (ConcurrentMap<Integer, ConsumeQueue> maps : tables.values()) {
        for (ConsumeQueue cq : maps.values()) {
            boolean result = false;
            for (int i = 0; i < retryTimes && !result; i++) {
                result = cq.flush(flushConsumeQueueLeastPages);
            }
        }
    }

    // 更新CheckPoint中ConsumeQueue最新刷盘时间
    if (0 == flushConsumeQueueLeastPages) {
        if (logicsMsgTimestamp > 0) {
            DefaultMessageStore.this.getStoreCheckpoint().setLogicsMsgTimestamp(logicsMsgTimestamp);
        }
        DefaultMessageStore.this.getStoreCheckpoint().flush();
    }
}
```

### 4.4 恢复

在Broker重新启动时会扫描ConsumeQueue的目录，尝试恢复这些文件。

#### 4.4.1 ConsumeQueue#recover

从倒数第三个文件开始往后遍历，遍历文件的每个索引项进行校验，校验成功则更新当前文件的最大可用偏移量，否则直接退出循环。

最后更新整个队列的可用偏移量，删掉不可用的部分。

```jsx
public void recover() {
    final List<MappedFile> mappedFiles = this.mappedFileQueue.getMappedFiles();
    if (!mappedFiles.isEmpty()) {
        // 从倒数第三个文件开始恢复
        int index = mappedFiles.size() - 3;
        if (index < 0)
            index = 0;

        int mappedFileSizeLogics = this.mappedFileSize;
        MappedFile mappedFile = mappedFiles.get(index);
        ByteBuffer byteBuffer = mappedFile.sliceByteBuffer();
        long processOffset = mappedFile.getFileFromOffset();
        long mappedFileOffset = 0;
        long maxExtAddr = 1;
        while (true) {
            for (int i = 0; i < mappedFileSizeLogics; i += CQ_STORE_UNIT_SIZE) {
                long offset = byteBuffer.getLong();
                int size = byteBuffer.getInt();
                long tagsCode = byteBuffer.getLong();

                // 说明当前存储单元有效
                if (offset >= 0 && size > 0) {
                    mappedFileOffset = i + CQ_STORE_UNIT_SIZE;
                    this.maxPhysicOffset = offset + size;
                    if (isExtAddr(tagsCode)) {
                        maxExtAddr = tagsCode;
                    }
                } else {
                    log.info("recover current consume queue file over,  " + mappedFile.getFileName() + " "
                        + offset + " " + size + " " + tagsCode);
                    break;
                }
            }

            // 走到文件末尾，切换至下一个文件
            if (mappedFileOffset == mappedFileSizeLogics) {
                index++;
                if (index >= mappedFiles.size()) {
                    // 当前分支不可能发生
                    log.info("recover last consume queue file over, last mapped file "
                        + mappedFile.getFileName());
                    break;
                } else {
                    mappedFile = mappedFiles.get(index);
                    byteBuffer = mappedFile.sliceByteBuffer();
                    processOffset = mappedFile.getFileFromOffset();
                    mappedFileOffset = 0;
                    log.info("recover next consume queue file, " + mappedFile.getFileName());
                }
            } else {
                log.info("recover current consume queue queue over " + mappedFile.getFileName() + " "
                    + (processOffset + mappedFileOffset));
                break;
            }
        }

        processOffset += mappedFileOffset;
        this.mappedFileQueue.setFlushedWhere(processOffset);
        this.mappedFileQueue.setCommittedWhere(processOffset);
        this.mappedFileQueue.truncateDirtyFiles(processOffset);

        if (isExtReadEnable()) {
            this.consumeQueueExt.recover();
            log.info("Truncate consume queue extend file by max {}", maxExtAddr);
            this.consumeQueueExt.truncateByMaxAddress(maxExtAddr);
        }
    }
}
```

## 5. 更多思考

### 5.1 RocketMQ 5.x 版本中新的 **Batch Consume Queue index**

在 [RIP-26](https://github.com/apache/rocketmq/wiki/RIP-26-Improve-Batch-Message-Processing-Throughput) 中为了支持 Batch Message，引入了新的 ConsumeQueue 格式。

这种 ConsumeQueue 元素更多（每个索引的大小也更大），支持了 Batch Message，且方便扩展（留了8字节的保留字段）。

![Untitled](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202203152217710.png)

不出意外的话 RocketMQ 5.0 中将采用这种 ConsumeQueue 的格式。

## 参考资料

- [1 消费队列ConsumeQueue——wuchanming.gitbook.com](https://wuchanming.gitbooks.io/rocketmq/content/brokerchu-li-xiao-fei-qing-6c4228-534129.html)
- [rocketmq源码分析_消息存储之概要设计——迦南地](https://cana.space/rocketmq%E6%BA%90%E7%A0%81%E5%88%86%E6%9E%90_%E6%B6%88%E6%81%AF%E5%AD%98%E5%82%A8%E4%B9%8B%E6%A6%82%E8%A6%81%E8%AE%BE%E8%AE%A1/#consumequeue%E5%A4%84%E7%90%86%E6%B5%81%E7%A8%8B)
- [RocketMQ 设计(design)](https://github.com/apache/rocketmq/blob/master/docs/cn/design.md)
- [RocketMQ高性能之底层存储设计](https://juejin.cn/post/6844903683382067208)


---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
