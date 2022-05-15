# RocketMQ 如何实现高性能消息读写？

[TOC]

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

### 1.1 顺序写

为了防止消息存储发生混乱，在多线程写 CommitLog 时会上锁，于是写 CommitLog 就变成了一个串行化的操作，对 CommitLog 完全是顺序写。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204101555558.png)

RocketMQ 的 ConsumeQueue 按 Topic 和 Queue 维度来保存消息在 CommitLog 中的偏移量，由 CommitLog 文件异步生成。每一个 ConsumeQueue 也是顺序写。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204101557626.png)

### 1.2 读取消息

消费消息时，先查询对应 Topic 和 Queue 的 ConsumeQueue，通过 ConsumeQueue 中保存的消息在 CommitLog 中的位置去 CommitLog 中查询消息。

对于每个 ConsumeQueue 来说，消费的过程都是顺序读。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204101649915.png)

对于 CommitLog 来说，由于它里面保存的每个 Topic 的消息不是连续的，实际上消费时是一个随机读的过程。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204101649263.png)

虽然是随机读，但整体还是从旧到新有序读，只要随机的那块区域还在Page Cache的热点范围内，还是可以充分利用Page Cache。

![Image](https://mmbiz.qpic.cn/mmbiz_png/fYn1DficteCHCsKIFkib3KdD5lKq4uZvliafv9JI9Pss2VTbGDiaGiadgpoBcoNLSKCRXrDvbgUvWDlF51mFgMHibPgA/640?wx_fmt=png&wxfrom=5&wx_lazy=1&wx_co=1)

## 2. 页缓存（Page Cache）

Page Cache 是操作系统的特性，用于加速文件 I/O。通俗地说，Page Cache 就是操作系统在内存中给磁盘上的文件建立的缓存。无论我们使用什么语言编写的程序，在调用系统的 API 读写文件的时候，并不会直接去读写磁盘上的文件，应用程序实际操作的都是 Page Cache，也就是文件在内存中缓存的副本。

Page Cache 使程序对文件的顺序读写速度几乎接近于内存，因为操作系统会将一部分物理内存用作 Page Cache。

应用程序在写入文件的时候，操作系统会先把数据写入到内存中的 Page Cache，然后通过异步的方式由 pdflush 内核线程将 Cache 内的数据刷盘至物理磁盘上。

读取文件的时候，也是从 Page Cache 中来读取数据，这时候会出现两种可能情况。

1. Page Cache 中有数据，那就直接读取，这样就节省了从磁盘上读取数据的时间
2. Page Cache 中没有数据，这时候操作系统会引发一个缺页中断，应用程序的读取线程会被阻塞，操作系统把数据从文件中复制到 Page Cache 中，然后应用程序再从 Page Cache 中继续把数据读出来，这时会真正读一次磁盘上的文件，这个读的过程就会比较慢。

用户的应用程序在使用完某块 Page Cache 后，操作系统并不会立刻就清除这个 Page Cache，而是尽可能地利用空闲的物理内存保存这些 Page Cache，除非系统内存不够用，操作系统才会清理掉一部分 Page Cache。清理的策略一般是 LRU 或它的变种算法，它保留 Page Cache 的逻辑是：优先保留最近一段时间最常使用的那些 Page Cache。

RocketMQ 充分利用了 Page Cache，它 CommitLog 和 ConsumeQueue 在整体上看都是顺序读写。这样，读和写的区域都是被OS智能Cache过的热点区域，不会产生大量缺页（Page Fault）中断而再次读取磁盘，文件的IO几乎等同于内存的IO。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204101649020.png)

在一台真实的MQ上查看网络和磁盘，即使消息端一直从MQ读取消息，也几乎看不到RMQ进程从磁盘read数据，数据直接从Page Cache经由Socket发送给了Consumer。

## 3. MMap

Page Cache 属于内核空间，在用户空间的应用程序无法直接访问，因此数据还需要从内核空间拷贝到用户空间才可以被应用程序访问。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204101648029.png)

MMap 指内存映射文件，将磁盘上的物理文件直接映射到用户态的内存地址中。使用 MMap 可以减少传统 IO 将磁盘文件数据在操作系统内核地址空间的缓冲区和用户应用程序地址空间的缓冲区之间来回进行拷贝的性能开销。

程序虚拟页面直接映射到页缓存上，这样就无需有内核态再往用户态的拷贝，而且也避免了重复数据的产生。并且也不必再通过调用`read`或`write`方法对文件进行读写，可以通过映射地址加偏移量的方式直接操作。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204101652542.png)

Java NIO 中的 FileChannel 提供了 map() 方法可以实现 mmap。FileChannel (文件通道)和 mmap (内存映射) 读写性能比较可以参照[这篇文章](https://juejin.cn/post/6844903842472001550)。

RocketMQ 中，CommitLog 和 ConsumeQueue 的底层都是 `MappedFile`，内存映射文件。

```java
// MappedFile.java
private void init(final String fileName, final int fileSize) throws IOException {
    // ...

    try {
        // 创建 FileChannel
        this.fileChannel = new RandomAccessFile(this.file, "rw").getChannel();
        // 内存映射
        this.mappedByteBuffer = this.fileChannel.map(MapMode.READ_WRITE, 0, fileSize);
        TOTAL_MAPPED_VIRTUAL_MEMORY.addAndGet(fileSize);
        TOTAL_MAPPED_FILES.incrementAndGet();
        // ...
    }
    // ...
}
```

## 4. 预分配文件

每个 CommitLog 文件的大小默认是 1G，当超过大小限制的时候需要准备新的文件，而 RocketMQ 起了一个后台线程 `AllocateMappedFileService`，该线程应用了生产-消费模式，不断的消费 `AllocateRequest`。`AllocateRequest` 其实就是文件预分配的请求。

`AllocateMappedFileService` 会提前准备好下一个文件的分配，包括预热该文件。防止在消息写入的过程中分配文件，产生抖动。其每次最多预分配 2 个文件。

## 5. 文件预热

在预分配的 `MappedFile` 文件创建后，会对其进行预热。为什么需要预热该文件？
因为通过 mmap 映射，只是建立了进程虚拟内存地址与物理内存地址之间的映射关系，并没有将 Page Cache 加载至内存。读写数据时如果没有命中写 Page Cache 则发生缺页中断，从磁盘重新加载数据至内存，这样会影响读写性能。为了防止缺页异常，阻止操作系统将相关的内存页调度到交换空间（swap space），RocketMQ 通过对文件预热。

```java
// org.apache.rocketmq.store.MappedFile::warmMappedFile
public void warmMappedFile(FlushDiskType type, int pages) {
        ByteBuffer byteBuffer = this.mappedByteBuffer.slice();
        int flush = 0;
        //通过写入 1G 的字节 0 来让操作系统分配物理内存空间，如果没有填充值，操作系统不会实际分配物理内存，防止在写入消息时发生缺页异常
        for (int i = 0, j = 0; i < this.fileSize; i += MappedFile.OS_PAGE_SIZE, j++) {
            byteBuffer.put(i, (byte) 0);
            // force flush when flush disk type is sync
            if (type == FlushDiskType.SYNC_FLUSH) {
                if ((i / OS_PAGE_SIZE) - (flush / OS_PAGE_SIZE) >= pages) {
                    flush = i;
                    mappedByteBuffer.force();
                }
            }
 
            //prevent gc
            if (j % 1000 == 0) {
                Thread.sleep(0);
            }
        }
 
        //force flush when prepare load finished
        if (type == FlushDiskType.SYNC_FLUSH) {
            mappedByteBuffer.force();
        }
        ...
        // 通过jna将内存页锁定在物理内存中，防止被放入swap分区
        this.mlock();
}
 
// org.apache.rocketmq.store.MappedFile::mlock
// LibC继承自com.sun.jna.Library，通过jna方法访问一些native的系统调用
public void mlock() {
    final long beginTime = System.currentTimeMillis();
    final long address = ((DirectBuffer) (this.mappedByteBuffer)).address();
    Pointer pointer = new Pointer(address);
 
    //通过系统调用 mlock 锁定该文件的 Page Cache，防止其被交换到 swap 空间
    int ret = LibC.INSTANCE.mlock(pointer, new NativeLong(this.fileSize));
 
    //通过系统调用 madvise 给操作系统建议，说明该文件在不久的将来要被访问
    int ret = LibC.INSTANCE.madvise(pointer, new NativeLong(this.fileSize), LibC.MADV_WILLNEED);
}
```

`MappedFile.warmMappedFile()` 方法即实现文件预热的功能，每个 OS_PAGE 写入一个任意值(这里为0)，也就是说在初始化状态下，这样操作会给每个页产生恰好一次的缺页中断，这样操作系统会分配物理内存并且将物理地址与逻辑地址简历映射关系。

最后配合 jna 方法，传入 mappedByteBuffer 的地址及文件长度，告诉内核即将要访问这部分文件，希望能将这些页面都锁定在物理内存中，不换进行 swapout，从而在后续实际使用这个文件时提升读写性能。

## 6. 内存级读写分离 TransientStorePool

为了降低 Page Cache 的压力，RocketMQ 引入了 TransientStorePool 机制，实现了消息读写在内存级别的读写分离（写消息时写堆外内存，读消息时读 Page Cache）。TransientStorePool 作为一个配置开关，默认关闭，由用户配置开启。

* 默认情况下 TransientStorePool 关闭，消息读写都通过 Page Cache，这样在高并发时 Page Cache 的压力会比较大，容易出现繁忙。
* 开启 TransientStorePool 后，消息写入时将写入 `ByteBuffer.allocateDirect` 方式调用直接申请堆外内存中，由异步刷盘线程写入 fileChannel 中（Page Cache），最后进行进行刷盘。消息读取时，因为堆外内存中的数据未提交，被认为是不可信数据，所以只会从 Page Cache 读取。

这样就实现了内存级别的读写分离，写入消息时主要面对堆外内存，读取消息时主要面对 Page Cache。

* 优点
  * 因为消息是先写入堆外内存，然后异步写入 Page Cache，此时就可以实现批量化写入
  * 写数据是完全写内存，速度相较于写文件对应的 Page Cache 更快
  * 减少锁的占用，提升效率
* 缺点
  * 在 Broker 出问题，异常退出时，已经放入 Page Cache 的数据不会丢失，存储在堆外内存的数据会丢失。所以该特性增大数据丢失的风险。
# 参考资料

* [RocketMQ 官方文档](https://github.com/apache/rocketmq/blob/master/docs/cn/design.md)
* [RocketMQ高性能之底层存储设计](https://mp.weixin.qq.com/s/yd1oQefnvrG1LLIoes8QAg)
* [Kafka 和 RocketMQ 底层存储之那些你不知道的事](https://xie.infoq.cn/article/24b51de341d66de6d1e737d65)
* [消息队列高手课——Kafka如何实现高性能IO？](https://time.geekbang.org/column/article/126493)
* [RocketMQ存储实现分析](http://www.daleizhou.tech/posts/rocketmq-store-commitlog.html)
* [《RocketMQ 技术内幕：RocketMQ 架构设计与实现原理 第2版》](https://book.douban.com/subject/35626441/)

---

欢迎关注公众号【消息中间件】，更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205152338160.png)
