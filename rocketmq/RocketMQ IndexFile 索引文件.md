# RocketMQ IndexFile 索引文件

# 1. 概述

## 1.1 索引文件是什么

IndexFile，又可以称作索引文件，是 RocketMQ 保存在磁盘上的一种文件，属于 RocketMQ 存储的一部分。它的结构类似于类似 JDK中 HashMap。

可以通过`messageIndexEnable`属性配置打开或关闭 IndexFile 存储功能。

## 1.2 索引文件作用

索引文件的应用场景其实比较局限，是为了提供**按照 Message Key 查询消息**的能力。索引文件可以通过 Message Key，查询到消息在 CommitLog 中的物理偏移量，进而从 CommitLog 中查询消息。

# 2. 概要设计

## 2.1 索引文件结构

上面说它的逻辑结构类似 HashMap，HashMap 以 Key-Value 形式存储数据，那么索引文件的存储格式也是 Key-Value

- Key：Message Key。索引文件的 Key 其实是 Message Key 经过 hash 得到的一个 Integer，
- Value：physical offset。索引文件的 Value 主要是消息在 CommitLog 中的绝对物理偏移量。

hash冲突时，Value以链表的方式存储，越新的消息在链表越前面。

它可以包含多个文件，每个文件的大小是固定的。这就意味着每个 IndexFile 包含的最大索引数量是相同的。

## 2.2 如何构建

消息保存到 CommitLog 之后，会进行重投递。重投递消息的过程就是为了建立消息的索引文件（包括 ConsumeQueue 和 IndexFile）。

重投递线程会扫描是否有新消息被保存到 CommitLog，如果有则将这条消息查出来，执行重投递逻辑，构建该消息的索引。

## 2.3 如何查询消息

索引文件中存储着 Message Key 对应消息在 CommitLog 中的偏移量，首先查询出这些偏移量信息，然后用偏移量从 CommitLog 中查询出消息。

## 2.4 刷盘机制

索引文件的刷盘机制并不是采取定时刷盘机制，而是每写满一个索引文件时就新建一个文件，并且将上一个写满的索引文件刷盘。

# 3. 详细设计

## 3.1 索引文件结构

设计 IndexFile 最重要的是设计它的逻辑结构和文件存储结构。首先看一下 IndexFile 详细的逻辑结构

### 3.1.1 逻辑结构

上面已经提到 IndexFile 是类似 JDK 的 HashMap 的结构。

- Key：由 `IndexService#buildKey(String topic, String key)`构建而成，具体为 `topic + "#" + messageKey` 经过hash（`IndexFile#indexKeyHashMethod(String Key)`）得到。
    
    > 注意：这里存在 Hash 冲突的可能，两个 Topic 和 Key 不同的消息可能得到相同的 Hash 值，会导致查询结果错误。社区已经提出这个错误 [ISSUE#3613](https://github.com/apache/rocketmq/issues/3613)，但目前还并未解决。
    > 
    > 
    > ![Untitled](RocketMQ%20I%20312db/Untitled.png)
    > 
- Value：Hash 冲突时变成链表结构，包含：
    - 消息在 CommitLog 中的物理偏移量，用于到 CommitLog 中查询消息
    - `IndexFile#indexKeyHashMethod(String Key)`得到的整数 Hash 值
    - 消息保存时间与索引文件最早消息保存时间的差值，用于搜索时间范围内的消息
    - 指向下一条消息位置的指针（在时间上是前一条，越晚到达的消息在链表越前面）

### 3.1.2 存储结构

索引文件底层使用 RocketMQ 的 MappedFile 来存储，索引文件可以有多个，可以无限扩展。

每个索引文件以其创建的时间命名，举例：`20211209174133951`

每个索引文件被设计为定长的，最多可以保存 500万个 Hash 槽和 2000万个索引项。当保存的数据超过上限时，会创建一个新的索引文件来保存。这就意味着同样 Hash 值的消息可能会被保存到不同的索引文件当中。

RocketMQ的存储文件都遵循一种通用的数据存储格式定义实践：**Header + Body**，通常 **Header 部分是定长**的，存放一些基本信息，Body 存放数据。

具体存储结构和内容如图所示：

![Untitled](RocketMQ%20I%20312db/Untitled%201.png)

- **Header** 固定大小，包含一些基本信息
    - beginTimestamp：最早的消息存储时间（消息存储到 CommitLog 的时间）
    - endTimestamp：最晚的消息存储时间
    - beginPhyoffset：存储的消息的最小物理偏移量（在 CommitLog 中的偏移量）
    - endPhyoffset：存储的消息的最大物理偏移量
    - hashSlotCount：最大可存储的 hash 槽个数
    - indexCount：当前已经使用的索引条目个数。注意这个值是从 1 开始的
- **Hash Slot** 部分存储固定数量的 Message Key hash槽（500万个，该数值可以通过 Broker 配置项 `maxHashSlotNum` 来配置）
    - 存储的每个值是在索引文件中 索引的逻辑下标。因为索引文件的 Header 和 Hash Slot 部分长度都是固定的，每个索引的长度也是固定的，所以可以通过逻辑下标计算出索引项在索引文件中的绝对偏移量
- **Index Item** 部分存储固定数量的索引项（2000万个，该数值可以通过 Broker 配置项 `maxIndexNum` 来配置）。每个索引项包含如下信息
    - Key Hash：消息的 Topic 和 Message Key 经过哈希得到的整数
    - Commit Log Offset：消息在 CommitLog 中的物理偏移量，用于到 CommitLog 中查询消息
    - Time Diff：从该索引文件到消息保存时间的时间差（精确到秒），用于根据时间范围查询消息
    - Next Index Offset：链表下一项的逻辑下标（这里的逻辑下标的含义跟 Hash Slot 中存储的逻辑下标含义相同）
        - 每次插入新的消息，都会从链表的头部插入。链表越往后，消息越老。因为一般来说消息队列会更关心新的消息。

## 3.2 索引文件涉及到的类

### IndexService

索引服务，用于管理和控制所有索引文件。包括索引文件的加载、创建、刷盘、删除等。是索引文件操作的入口。

- `private final ArrayList<IndexFile> indexFileList`：索引文件列表。
- `buildIndex(DispatchRequest req)`：根据消息分发请求构建索引。注意这里会创建 msgId 的索引和消息 Key 的索引
    1. 创建或获取最新的索引文件
    2. 调用该索引文件的 `IndexFile#putKey` 方法创建索引
- `queryOffset(String topic, String key, int maxNum, long begin, long end)`：根据topic和message key，从IndexFile中查找消息。按时间查询：查询保存时间在 begin 到 end 内的消息
    1. 从后往前遍历 `indexFileList` 列表中的索引文件，查找索引对应的 message 符合时间的 IndexFile（[beginTimestamp, endTimestamp] 与 [begin, end] 有交集的索引文件）
    2. 调用符合条件的索引文件 `IndexFile#selectPhyOffset()` 方法查找所有 offset
- `retryGetAndCreateIndexFile()`：获取最新的索引文件，如果不存在，则创建一个新的索引文件。
    - 调用 `getAndCreateLastIndexFile()` 方法创建或者获取最新的索引文件
    - 创建新索引文件时如果创建失败，会重试创建3次
- `getAndCreateLastIndexFile()`：获取最后一个索引文件。如果没有索引文件或者最后一个索引文件满了，那么创建一个新的文件
    1. 检查索引文件列表最后一个文件是否存在以及是否满
    2. 如果不存在或者已经满了，创建新的文件，并且把上一个索引文件**异步刷盘**
    3. 如果最后一个文件存在并且未满，直接返回该文件
- `flush()`：将一个索引文件强制刷盘，并且刷新 checkpoint 文件中的 indexMsgTimestamp，checkpoint文件刷盘。
    - 如果开启 `MessageStoreConfig#messageIndexSafe` 配置项，那么下次 Broker 异常恢复时，会从 checkpoint 保存的 indexMsgTimestamp 即索引文件记录的强制刷盘时间来恢复。
    - 当一个索引文件写满后创建新索引文件时调用，强制将写满的文件刷盘
    
    ![Untitled](RocketMQ%20I%20312db/Untitled%202.png)
    

### IndexFile

索引文件，包含索引文件的存储结构和一系列操作。

底层使用内存映射文件 MappedFile 存储。

- `MappedFile mappedFile`：底层存储实现
- `putKey(final String key, final long phyOffset, final long storeTimestamp)`：添加一个索引到索引文件
- `selectPhyOffset(final List<Long> phyOffsets, final String key, final int maxNum, final long begin, final long end, boolean lock)`：从该索引文件中根据 Key 查找索引对应的 offset

# 4. 源码解析

## 4.1 IndexService

### 4.1.1 创建

- **load：重新加载索引文件**

```java
/**
 * 重新加载索引文件
 *
 * @param lastExitOK 上次是否是正常退出
 * @return 加载是否成功
 */
public boolean load(final boolean lastExitOK) {
    File dir = new File(this.storePath);
    File[] files = dir.listFiles();
    if (files != null) {
        // ascending order, 将索引文件按照创建时间升序排序
        Arrays.sort(files);
        for (File file : files) {
            // 依次加载每个索引文件
            try {
                IndexFile f = new IndexFile(file.getPath(), this.hashSlotNum, this.indexNum, 0, 0);
                f.load();
                // 如果上一次是异常退出，则删除check point之后的所有索引文件
                if (!lastExitOK) {
                    if (f.getEndTimestamp() > this.defaultMessageStore.getStoreCheckpoint().getIndexMsgTimestamp()) {
                        f.destroy(0);
                        continue;
                    }
                }

                this.indexFileList.add(f);
            } catch 
              // ...
        }
    }
    return true;
}
```

---

- getAndCreateLastIndexFile()：获取最后一个索引文件，如果集合为空或者最后一个文件写满了，则新建一个文件
    1. 先判断文件是否存在、是否写满
    2. 如果不存在或者最后一个文件写满，则创建一个文件
    3. 如果存在，直接返回该文件
    4. 如果创建了新文件，启动一个线程将前一个写满的文件异步刷盘。
        - 刷盘线程会将该文件刷盘
        - 然后更新 `StoreCheckpoint#indexMsgTimestamp` 为该写满的索引文件中 indexHeader 的 endTimestamp

```java
/**
 * 获取最后一个索引文件，如果集合为空或者最后一个文件写满了，则新建一个文件<br>
 * 只有一个线程调用，所以不存在写竟争问题
 */
public IndexFile getAndCreateLastIndexFile() {
    IndexFile indexFile = null;
    IndexFile prevIndexFile = null;
    long lastUpdateEndPhyOffset = 0;
    long lastUpdateIndexTimestamp = 0;
    // 先尝试使用读锁
    {
        this.readWriteLock.readLock().lock();
        // 判断文件列表是否为空
        if (!this.indexFileList.isEmpty()) {
            IndexFile tmp = this.indexFileList.get(this.indexFileList.size() - 1);
            // 判断最后一个文件是否写满
            if (!tmp.isWriteFull()) {
                indexFile = tmp;
            } else {
                lastUpdateEndPhyOffset = tmp.getEndPhyOffset();
                lastUpdateIndexTimestamp = tmp.getEndTimestamp();
                prevIndexFile = tmp;
            }
        }

        this.readWriteLock.readLock().unlock();
    }

    // 如果文件列表为空或者最后一个文件写满了，使用写锁创建文件
    if (indexFile == null) {
        try {
            String fileName =
                this.storePath + File.separator
                    + UtilAll.timeMillisToHumanString(System.currentTimeMillis());
            indexFile =
                new IndexFile(fileName, this.hashSlotNum, this.indexNum, lastUpdateEndPhyOffset,
                    lastUpdateIndexTimestamp);
            this.readWriteLock.writeLock().lock();
            this.indexFileList.add(indexFile);
        } catch (Exception e) {
            log.error("getLastIndexFile exception ", e);
        } finally {
            this.readWriteLock.writeLock().unlock();
        }

        // 每创建一个新文件，前一个文件异步刷盘
        if (indexFile != null) {
            final IndexFile flushThisFile = prevIndexFile;
            Thread flushThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    IndexService.this.flush(flushThisFile);
                }
            }, "FlushIndexFileThread");

            flushThread.setDaemon(true);
            flushThread.start();
        }
    }

    return indexFile;
}
```

### 4.1.2 插入和查询

- `buildIndex(DispatchRequest req)`：根据消息分发请求构建索引。注意这里会创建 msgId 的索引和消息 Key 的索引
    1. 创建或获取最新的索引文件
    2. 调用该索引文件的 `IndexFile#putKey` 方法创建索引
        1. 获取 uniqKey（也就是 msgId），创建索引
        2. 获取消息的所有 key，分别创建索引

```java
/**
 * 根据 DispatchRequest 构建索引
 *
 * @param req 消息存入CommitLog之后重新分发到Index文件的 DispatchRequest
 */
public void buildIndex(DispatchRequest req) {
    IndexFile indexFile = retryGetAndCreateIndexFile();
    if (indexFile != null) {
        long endPhyOffset = indexFile.getEndPhyOffset();
        DispatchRequest msg = req;
        String topic = msg.getTopic();
        String keys = msg.getKeys();
        if (msg.getCommitLogOffset() < endPhyOffset) {
            return;
        }

        // 如果是事务消息的回滚消息，不需要创建索引，直接返回
        final int tranType = MessageSysFlag.getTransactionValue(msg.getSysFlag());
        switch (tranType) {
            case MessageSysFlag.TRANSACTION_NOT_TYPE:
            case MessageSysFlag.TRANSACTION_PREPARED_TYPE:
            case MessageSysFlag.TRANSACTION_COMMIT_TYPE:
                break;
            case MessageSysFlag.TRANSACTION_ROLLBACK_TYPE:
                return;
        }

        if (req.getUniqKey() != null) {
            // 创建UniqueKey的索引，也就是msgId的索引
            indexFile = putKey(indexFile, msg, buildKey(topic, req.getUniqKey()));
            if (indexFile == null) {
                log.error("putKey error commitlog {} uniqkey {}", req.getCommitLogOffset(), req.getUniqKey());
                return;
            }
        }

        // 创建消息key的索引，这里key可以有多个
        if (keys != null && keys.length() > 0) {
            String[] keyset = keys.split(MessageConst.KEY_SEPARATOR);
            for (int i = 0; i < keyset.length; i++) {
                String key = keyset[i];
                if (key.length() > 0) {
                    indexFile = putKey(indexFile, msg, buildKey(topic, key));
                    if (indexFile == null) {
                        log.error("putKey error commitlog {} uniqkey {}", req.getCommitLogOffset(), req.getUniqKey());
                        return;
                    }
                }
            }
        }
    } else {
        log.error("build index error, stop building index");
    }
}
```

- `queryOffset(String topic, String key, int maxNum, long begin, long end)`：根据topic和message key，从IndexFile中查找消息

```java
/**
     * 根据topic和message key，从IndexFile中查找消息
     *
     * @param topic
     * @param key
     * @param maxNum 最大查找消息数量
     * @param begin 查找消息最小时间
     * @param end 查找消息最大时间
     * @return
     */
    public QueryOffsetResult queryOffset(String topic, String key, int maxNum, long begin, long end) {
        List<Long> phyOffsets = new ArrayList<Long>(maxNum);

        long indexLastUpdateTimestamp = 0;
        long indexLastUpdatePhyoffset = 0;
        maxNum = Math.min(maxNum, this.defaultMessageStore.getMessageStoreConfig().getMaxMsgsNumBatch());
        try {
            this.readWriteLock.readLock().lock();
            if (!this.indexFileList.isEmpty()) {
                // 从后往前遍历IndexFile，查找索引对应的message符合时间的IndexFile
                for (int i = this.indexFileList.size(); i > 0; i--) {
                    IndexFile f = this.indexFileList.get(i - 1);
                    boolean lastFile = i == this.indexFileList.size();
                    if (lastFile) {
                        indexLastUpdateTimestamp = f.getEndTimestamp();
                        indexLastUpdatePhyoffset = f.getEndPhyOffset();
                    }

                    if (f.isTimeMatched(begin, end)) {
                        // 最后一个文件需要加锁
                        f.selectPhyOffset(phyOffsets, buildKey(topic, key), maxNum, begin, end, lastFile);
                    }

                    // 再往前遍历时间更不符合
                    if (f.getBeginTimestamp() < begin) {
                        break;
                    }

                    if (phyOffsets.size() >= maxNum) {
                        break;
                    }
                }
            }
        } catch (Exception e) {
            log.error("queryMsg exception", e);
        } finally {
            this.readWriteLock.readLock().unlock();
        }

        return new QueryOffsetResult(phyOffsets, indexLastUpdateTimestamp, indexLastUpdatePhyoffset);
    }
```

### 4.1.3 过期删除

- `deleteExpiredFile(long offset)`：删除消息CommitLog偏移量offset之前的所有IndexFile文件

### 4.1.4 刷盘

- `flush()`：强制刷盘，会把内存映射文件中的数据强制写到磁盘。在一个索引文件写满后调用

```java
/**
 * 索引文件刷盘，在一个文件写满后调用
 * 
 * @param f 需要刷盘的索引文件
 */
public void flush(final IndexFile f) {
    if (null == f)
        return;

    long indexMsgTimestamp = 0;

    if (f.isWriteFull()) {
        indexMsgTimestamp = f.getEndTimestamp();
    }

    // 索引文件刷盘
    f.flush();

    // checkpoint文件刷盘
    if (indexMsgTimestamp > 0) {
        this.defaultMessageStore.getStoreCheckpoint().setIndexMsgTimestamp(indexMsgTimestamp);
        this.defaultMessageStore.getStoreCheckpoint().flush();
    }
}
```

## 4.2 IndexFile

- `putKey(final String key, final long phyOffset, final long storeTimestamp)`：向索引文件插入新的索引项
1. 根据 key 的 Hash 值计算出 hash槽绝对位置 `absSlotPos`
2. 获取当前 hash槽的值，为该 hash槽对应的最新的索引的逻辑下标
3. 在 hash槽对应的链表头部插入索引
4. hash槽指向最新创建的索引的逻辑下标
5. 更新文件头

```java
/**
 * 向索引文件插入新的索引项
 * 如果返回false，表示需要创建新的索引文件
 */
public boolean putKey(final String key, final long phyOffset, final long storeTimestamp) {
    // 判断当前索引数量是否小于最大索引数量，如果小于则直接退出，说明需要创建新的索引文件
    if (this.indexHeader.getIndexCount() < this.indexNum) {
        // 计算key的hash值
        int keyHash = indexKeyHashMethod(key);
        // 获取hash槽位置（下标）。通过 keyHash % hashSlotNum 的方式再次哈希，这里会加大查询消息错误的概率。
        int slotPos = keyHash % this.hashSlotNum;
        // 通过hash槽下表计算出hash槽的绝对位置
        int absSlotPos = IndexHeader.INDEX_HEADER_SIZE + slotPos * hashSlotSize;

        FileLock fileLock = null;

        try {

            // fileLock = this.fileChannel.lock(absSlotPos, hashSlotSize,
            // false);
            // 通过hash槽绝对位置，获取hash槽的值，如果有值说明这个hash key已经存在，如果不存在则需要填入
            int slotValue = this.mappedByteBuffer.getInt(absSlotPos);
            if (slotValue <= invalidIndex || slotValue > this.indexHeader.getIndexCount()) {
                slotValue = invalidIndex;
            }

            long timeDiff = storeTimestamp - this.indexHeader.getBeginTimestamp();

            timeDiff = timeDiff / 1000;

            if (this.indexHeader.getBeginTimestamp() <= 0) {
                timeDiff = 0;
            } else if (timeDiff > Integer.MAX_VALUE) {
                timeDiff = Integer.MAX_VALUE;
            } else if (timeDiff < 0) {
                timeDiff = 0;
            }

            // 计算放置索引的绝对偏移量
            int absIndexPos =
                IndexHeader.INDEX_HEADER_SIZE + this.hashSlotNum * hashSlotSize
                    + this.indexHeader.getIndexCount() * indexSize;

            // 在链表头部插入最新的索引项
            // 将索引存入文件，最后一个是指针，指向下一个链表元素
            this.mappedByteBuffer.putInt(absIndexPos, keyHash);
            this.mappedByteBuffer.putLong(absIndexPos + 4, phyOffset);
            this.mappedByteBuffer.putInt(absIndexPos + 4 + 8, (int) timeDiff);
            this.mappedByteBuffer.putInt(absIndexPos + 4 + 8 + 4, slotValue);

            // 写入hash槽，每个hash槽的值是最新写入的索引文件的逻辑下标
            this.mappedByteBuffer.putInt(absSlotPos, this.indexHeader.getIndexCount());

            if (this.indexHeader.getIndexCount() <= 1) {
                this.indexHeader.setBeginPhyOffset(phyOffset);
                this.indexHeader.setBeginTimestamp(storeTimestamp);
            }

            if (invalidIndex == slotValue) {
                this.indexHeader.incHashSlotCount();
            }
            // 更新索引文件头，索引项个数+1
            this.indexHeader.incIndexCount();
            this.indexHeader.setEndPhyOffset(phyOffset);
            this.indexHeader.setEndTimestamp(storeTimestamp);

            return true;
        } catch (Exception e) {
            log.error("putKey exception, Key: " + key + " KeyHashCode: " + key.hashCode(), e);
        } finally {
            if (fileLock != null) {
                try {
                    fileLock.release();
                } catch (IOException e) {
                    log.error("Failed to release the lock", e);
                }
            }
        }
    } else {
        log.warn("Over index file capacity: index count = " + this.indexHeader.getIndexCount()
            + "; index max num = " + this.indexNum);
    }

    return false;
}
```

---

- `selectPhyOffset(final List<Long> phyOffsets, final String key, final int maxNum, final long begin, final long end, boolean lock)`：从该索引文件中根据 Key 查找索引对应的 offset
    1. 根据 key 的 Hash值计算 hash槽的绝对位置
    2. 通过 hash槽中存储的索引逻辑下标，找到索引链表绝对位置
    3. 遍历索引链表中的每个索引，获取索引数据，比较时间信息
    4. 将时间信息符合搜索条件的索引加入到结果列表中

```java
/**
 * 从该索引文件中根据key查找offsets
 *
 * @param phyOffsets offsets结果列表
 * @param key 查找的key
 * @param maxNum 最大返回结果数量
 * @param begin 查找消息的开始时间
 * @param end 查找消息的结束时间
 * @param lock 查找时是否加锁（已废弃）
 */
public void selectPhyOffset(final List<Long> phyOffsets, final String key, final int maxNum,
    final long begin, final long end, boolean lock) {
    if (this.mappedFile.hold()) {
        // 根据key的hash值计算hash槽的绝对位置
        int keyHash = indexKeyHashMethod(key);
        int slotPos = keyHash % this.hashSlotNum;
        int absSlotPos = IndexHeader.INDEX_HEADER_SIZE + slotPos * hashSlotSize;

        FileLock fileLock = null;
        try {
            if (lock) {
                // fileLock = this.fileChannel.lock(absSlotPos,
                // hashSlotSize, true);
            }

            // 获取hash槽的值
            int slotValue = this.mappedByteBuffer.getInt(absSlotPos);
            // if (fileLock != null) {
            // fileLock.release();
            // fileLock = null;
            // }
            // 如果该hash槽的值有效则查找，否则查找失败
            if (slotValue <= invalidIndex || slotValue > this.indexHeader.getIndexCount()
                || this.indexHeader.getIndexCount() <= 1) {
            } else {
                for (int nextIndexToRead = slotValue; ; ) {
                    if (phyOffsets.size() >= maxNum) {
                        break;
                    }

                    int absIndexPos =
                        IndexHeader.INDEX_HEADER_SIZE + this.hashSlotNum * hashSlotSize
                            + nextIndexToRead * indexSize;

                    int keyHashRead = this.mappedByteBuffer.getInt(absIndexPos);
                    long phyOffsetRead = this.mappedByteBuffer.getLong(absIndexPos + 4);

                    long timeDiff = (long) this.mappedByteBuffer.getInt(absIndexPos + 4 + 8);
                    int prevIndexRead = this.mappedByteBuffer.getInt(absIndexPos + 4 + 8 + 4);

                    if (timeDiff < 0) {
                        break;
                    }

                    timeDiff *= 1000L;

                    long timeRead = this.indexHeader.getBeginTimestamp() + timeDiff;
                    boolean timeMatched = (timeRead >= begin) && (timeRead <= end);

                    if (keyHash == keyHashRead && timeMatched) {
                        phyOffsets.add(phyOffsetRead);
                    }

                    if (prevIndexRead <= invalidIndex
                        || prevIndexRead > this.indexHeader.getIndexCount()
                        || prevIndexRead == nextIndexToRead || timeRead < begin) {
                        break;
                    }

                    nextIndexToRead = prevIndexRead;
                }
            }
        } catch (Exception e) {
            log.error("selectPhyOffset exception ", e);
        } finally {
            if (fileLock != null) {
                try {
                    fileLock.release();
                } catch (IOException e) {
                    log.error("Failed to release the lock", e);
                }
            }

            this.mappedFile.release();
        }
    }
```

# 参考资料

- [RocketMQ 文档：设计](https://github.com/apache/rocketmq/blob/master/docs/cn/design.md)
- [RocketMQ存储篇——IndexFile和IndexService](https://blog.csdn.net/meilong_whpu/article/details/76921583)