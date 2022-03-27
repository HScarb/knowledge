# RocketMQ 过期文件删除机制 源码剖析

[TOC]

# 1. 背景

RocketMQ 的存储文件主要分三种：CommitLog、ConsumeQueue、IndexFile
RocketMQ 的过期文件删除机制会定期删除已经过期的存储文件。当磁盘容量告急时，会立刻执行删除，释放磁盘空间。
目前虽然有对于 RocketMQ 过期文件删除机制的文章，但我觉得没有讲的非常完善。本文详细分析一下三种存储文件的过期删除机制，避免一些坑。

# 2. 概述

CommitLog、ConsumeQueue 和 IndexFile 的过期文件删除逻辑由一个线程统一处理。
这个线程每 10s 进行一次检查，如果符合删除条件，那么会删除这些文件。

* ConsumeQueue 和 IndexFile 的检查每 10s 都会进行，会删除 CommitLog 投递的偏移量之前的文件。
* CommitLog 的删除比较复杂，当到达每天的删除时间（4 点）或者磁盘空间告急（超过 75%）才会启动删除过期文件；磁盘空间超过 85% 时会强制删除文件，平时不会启动。

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
1. 手动删除。设计上预留了手动删除的接口，但实际没有命令能调用。

## 3.2 ConsumeQueue

[ConsumeQueue](RocketMQ%20ConsumeQueue%20消费队列文件.md) 是消费队列文件。每个 Topic 的每个 Queue 都会有一个消费队列（可能包含多个文件），用作保存消息在 CommitLog 中的位置以便消费。

每隔 10s，文件删除线程就会检查所有 ConsumeQueue，删除该 ConsumeQueue 已经投递过的那些文件。

## 3.3 IndexFile

[IndexFile](RocketMQ%20IndexFile%20索引文件.md)是消息索引文件，仅仅用于消息的查询。索引文件可以通过 Message Key，查询到消息在 CommitLog 中的物理偏移量，进而从 CommitLog 中查询消息。

每隔 10s，文件删除线程会检查所有的 IndexFile，比较它的最大 offset 和当前已经投递的 CommitLog offset，把消息全部已经投递的 IndexFile 删除。

# 4. 源码解析

清理 CommitLog 方法的类是 `DefaultMessageStore#CleanCommitLogService`，清理 ConsumeQueue 和 IndexFile 共用一个类 `DefaultMessageStore#CleanConsumeQueueService`，都是 `DefaultMessageStore` 的内部类。

`DefaultMessageStore` 启动时调用 `start()` 方法，会启动过期文件清理的定时任务

```java
private void addScheduleTask() {

    // 启动定时清理过期文件线程
    this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {
        @Override
        public void run() {
            DefaultMessageStore.this.cleanFilesPeriodically();
        }
    // 初始延迟 60s，之后默认每 10s 执行一次
    }, 1000 * 60, this.messageStoreConfig.getCleanResourceInterval(), TimeUnit.MILLISECONDS);
    // ...
}
```

其中 `run()` 方法调用 CommitLog 和 ConsumeQueue 的清理方法

```java
private void cleanFilesPeriodically() {
    this.cleanCommitLogService.run();
    this.cleanConsumeQueueService.run();
}
```

## 4.1 CommitLog

先来看一下删除 CommitLog 的条件检查逻辑，触发 CommitLog 清理的条件比较多，满足 3 个条件之一就会触发删除。

且删除分
* 非强制删除：只删除过期的文件（默认过期时间 72h，该文件最后一次写入过后 72h 过期）
* 强制删除：会删除未过期的文件

一次最多删除 10 个文件，也就是说每 10s 最多删除 10 个文件。
4 点 ~ 5 点这个小时都是删除文件的时间窗，并不是仅在 4 点删一次。

```java
private void deleteExpiredFiles() {
    // 本次删除的文件数量
    int deleteCount = 0;
    // 文件保留时间，默认72h。如果超出该时间，则认为是过期文件，可以被删除
    long fileReservedTime = DefaultMessageStore.this.getMessageStoreConfig().getFileReservedTime();
    // 删除物理文件的时间间隔，默认100ms。在一次删除过程中，删除两个文件的间隔时间
    int deletePhysicFilesInterval = DefaultMessageStore.this.getMessageStoreConfig().getDeleteCommitLogFilesInterval();
    // 第一次拒绝删除之后能保留文件的最大时间，默认120s。
    // 在删除文件时，如果该文件被其他线程占用，会阻止删除，同时在第一次试图删除该文件时记录当前时间戳。
    // 在保留时间内，文件可以拒绝删除，超过该时间后，会将引用次数设置为负数，文件将被强制删除。
    int destroyMapedFileIntervalForcibly = DefaultMessageStore.this.getMessageStoreConfig().getDestroyMapedFileIntervalForcibly();

    // 是满足删除文件的时间（4点）
    boolean timeup = this.isTimeToDelete();
    // 磁盘空间是否不足（75%）
    boolean spacefull = this.isSpaceToDelete();
    // 手动删除是否被触发（触发则会设manualDeleteFileSeveralTimes为20，每执行一次删除方法减少一次）
    boolean manualDelete = this.manualDeleteFileSeveralTimes > 0;

    // 满足下列条件之一将继续删除
    // 1. 到了设置的每天固定删除时间（4点）
    // 2. 磁盘空间不充足，默认为75%
    // 3. executeDeleteFilesManually方法被调用，手工删除文件
    if (timeup || spacefull || manualDelete) {

        if (manualDelete)
            this.manualDeleteFileSeveralTimes--;

        // 是否立即强制删除文件（磁盘空间大于85%为true）
        boolean cleanAtOnce = DefaultMessageStore.this.getMessageStoreConfig().isCleanFileForciblyEnable() && this.cleanImmediately;

        log.info("begin to delete before {} hours file. timeup: {} spacefull: {} manualDeleteFileSeveralTimes: {} cleanAtOnce: {}",
            fileReservedTime,
            timeup,
            spacefull,
            manualDeleteFileSeveralTimes,
            cleanAtOnce);

        // 文件保留时间，默认 72，这里转换成小时
        fileReservedTime *= 60 * 60 * 1000;

        // 删除成功的文件数量
        deleteCount = DefaultMessageStore.this.commitLog.deleteExpiredFile(fileReservedTime, deletePhysicFilesInterval,
            destroyMapedFileIntervalForcibly, cleanAtOnce);
        if (deleteCount > 0) {
        // 危险情况：磁盘满了，但是又无法删除文件
        } else if (spacefull) {
            log.warn("disk space will be full soon, but delete file failed.");
        }
    }
}
```

其中 `commitLog.deleteExpiredFile()` 方法调用了 `MappedFileQueue#deleteExpiredFileByTime()` 方法

```java
/**
 * 根据文件过期时间来删除文件
 *
 * @param expiredTime 文件过期时间（过期后保留的时间）
 * @param deleteFilesInterval 删除两个文件的间隔
 * @param intervalForcibly 上次关闭时间间隔超过该值则强制删除
 * @param cleanImmediately 是否强制删除文件
 * @return 删除文件数量
 */
public int deleteExpiredFileByTime(final long expiredTime,
    final int deleteFilesInterval,
    final long intervalForcibly,
    final boolean cleanImmediately) {
    Object[] mfs = this.copyMappedFiles(0);

    if (null == mfs)
        return 0;

    int mfsLength = mfs.length - 1;
    int deleteCount = 0;
    List<MappedFile> files = new ArrayList<MappedFile>();
    if (null != mfs) {
        for (int i = 0; i < mfsLength; i++) {
            MappedFile mappedFile = (MappedFile) mfs[i];
            // 计算文件应该被删除的时间，等于文件最后修改的时间 + 文件过期时间
            long liveMaxTimestamp = mappedFile.getLastModifiedTimestamp() + expiredTime;
            // 如果文件过期，或开启强制删除，则删除文件
            if (System.currentTimeMillis() >= liveMaxTimestamp || cleanImmediately) {
                if (mappedFile.destroy(intervalForcibly)) {
                    files.add(mappedFile);
                    deleteCount++;

                    // 一次最多删除10个文件
                    if (files.size() >= DELETE_FILES_BATCH_MAX) {
                        break;
                    }

                    // 每个文件删除间隔
                    if (deleteFilesInterval > 0 && (i + 1) < mfsLength) {
                        try {
                            Thread.sleep(deleteFilesInterval);
                        } catch (InterruptedException e) {
                        }
                    }
                } else {
                    break;
                }
            } else {
                //avoid deleting files in the middle
                break;
            }
        }
    }

    // 将删除的文件从mappedFiles中移除
    deleteExpiredFile(files);

    return deleteCount;
}
```

其中，真正删除文件是调用了 `MappedFile#destroy()` 方法

这个方法会先释放 `MappedFile` 上的引用，再关闭内存映射，然后关闭 `fileChannel`，最后才能删除该文件。

## 4.2 ConsumeQueue

`CleanConsumeQueueService` 处理 ConsumeQueue 文件的过期删除

先查出当前 CommitLog 的投递 Offset，然后遍历每个 ConsumeQueue，删除小于该 Offset 的 文件。

```java
private void deleteExpiredFiles() {
    int deleteLogicsFilesInterval = DefaultMessageStore.this.getMessageStoreConfig().getDeleteConsumeQueueFilesInterval();

    long minOffset = DefaultMessageStore.this.commitLog.getMinOffset();
    if (minOffset > this.lastPhysicalMinOffset) {
        this.lastPhysicalMinOffset = minOffset;

        // 删除逻辑队列文件
        ConcurrentMap<String, ConcurrentMap<Integer, ConsumeQueue>> tables = DefaultMessageStore.this.consumeQueueTable;

        for (ConcurrentMap<Integer, ConsumeQueue> maps : tables.values()) {
            for (ConsumeQueue logic : maps.values()) {
                int deleteCount = logic.deleteExpiredFile(minOffset);

                if (deleteCount > 0 && deleteLogicsFilesInterval > 0) {
                    try {
                        Thread.sleep(deleteLogicsFilesInterval);
                    } catch (InterruptedException ignored) {
                    }
                }
            }
        }

        // 清理 IndexFile
        // ...
    }
}

```

## 4.3 IndexFile

IndexFile 的过期文件清理也由 `CleanConsumeQueueService` 处理，删除 CommitLog 偏移量 offset 之前的所有 IndexFile 文件

```java
private void deleteExpiredFiles() {
    int deleteLogicsFilesInterval = DefaultMessageStore.this.getMessageStoreConfig().getDeleteConsumeQueueFilesInterval();

    long minOffset = DefaultMessageStore.this.commitLog.getMinOffset();
    if (minOffset > this.lastPhysicalMinOffset) {
        // 清理 ConsumeQueue
        // ...

        // 清理 IndexFile
        DefaultMessageStore.this.indexService.deleteExpiredFile(minOffset);
    }
}
```

```java
/**
    * 删除消息CommitLog偏移量offset之前的所有IndexFile文件
    *
    * @param offset CommitLog偏移量
    */
public void deleteExpiredFile(long offset) {
    Object[] files = null;
    try {
        this.readWriteLock.readLock().lock();
        if (this.indexFileList.isEmpty()) {
            return;
        }

        // 比较第一个 IndexFile 的最大 offset， 如果小于 offset，说明不需要删除任何文件
        long endPhyOffset = this.indexFileList.get(0).getEndPhyOffset();
        if (endPhyOffset < offset) {
            files = this.indexFileList.toArray();
        }
    } catch (Exception e) {
        log.error("destroy exception", e);
    } finally {
        this.readWriteLock.readLock().unlock();
    }

    // 有文件需要被删除，遍历所有文件，删除所有最大 offset 小于 CommitLog offset 的文件
    if (files != null) {
        List<IndexFile> fileList = new ArrayList<IndexFile>();
        for (int i = 0; i < (files.length - 1); i++) {
            IndexFile f = (IndexFile) files[i];
            if (f.getEndPhyOffset() < offset) {
                fileList.add(f);
            } else {
                break;
            }
        }

        this.deleteExpiredFile(fileList);
    }
}
```