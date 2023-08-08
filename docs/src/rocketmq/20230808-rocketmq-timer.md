---
title: Rocketmq 5.0 任意时间定时消息（RIP-43） 原理详解 & 源码解析
author: Scarb
date: 2023-08-08
---

原文地址：[http://hscarb.github.io/rocketmq/20230808-rocketmq-timer.html](http://hscarb.github.io/rocketmq/20230808-rocketmq-timer.html)

# Rocketmq 5.0 任意时间定时消息（RIP-43） 原理详解 & 源码解析

## 1. 背景

### 1.1 概念和应用场景

延迟消息（定时消息）即消息到达消息队列服务端后不会马上投递，而是到达某个时间才投递给消费者。它在在当前的互联网环境中有非常大的需求。

例如电商/网约车等业务中都会出现的订单场景，客户下单后并不会马上付款，但是这个订单也不可能一直开着，因为订单会占用商品/网约车资源。这时候就需要一个机制，在比如 5 分钟后进行一次回调，回调关闭订单的方法。 这个回调的触发可以用分布式定时任务来处理，，但是更好的方法可以是使用消息队列发送一个延迟消息，因为一条消息会比一个分布式定时任务轻量得多。 开启一个消费者消费订单取消 Topic 的消息，收到消息后关闭订单，简单高效。

当用户支付了订单，那么这个订单不再需要被取消，刚才发的延迟消息也不再需要被投递。当然，你可以在消费消息时判断一下订单的状态以确定是否需要关闭，但是这样做会有一次额外的数据库操作。如果可以取消定时消息，那么只要发送一条定时消息取消的命令就可以取消之前发送的定时消息投递。

除此之外，定时消息还能用于更多其他场景，如定时任务触发、等待重试、事件预订等等。

### 1.2 延迟消息与定时消息

首先需要明确延迟消息与定时消息虽然意思不同，但在体现的效果上确实相同的，都是在消息生产到 Broker 之一段时间之后才会被投递（消费者可以消费到）。只不过在使用的 API 上，延迟消息指定延迟的时间，而定时消息指定确切的投递时间。实际上它们可以实现相同的效果。

在 Rocketmq 4.x 中只支持通过设定延迟等级来支持 18 个固定延迟时间。具体的原理可以看 [RocketMQ 延迟消息（定时消息）源码解析](https://github.com/HScarb/knowledge/blob/master/rocketmq/20220313-rocketmq-scheduled-message.md)。

4.x 的延迟消息有很大的局限性，它无法支持任意时间的定时，而且最大的定时时间也只有 2 小时，它的性能也达不到普通消息（后来 4.x 的延迟消息性能被优化，详见 [RocketMQ 延迟消息（定时消息）4.9.3 版本优化 异步投递支持](https://github.com/HScarb/knowledge/blob/master/rocketmq/20220320-rocketmq-scheduled-message-4.9.3-improve.md)。

许多公司不满足于它的能力，自研了任意时间定时消息，扩展了最大定时时长。

在 Rocketmq 5.x 中终于开源了支持任意时间的定时消息（以下简称定时消息）。它与 4.x 的延迟消息是两套实现机制，互相之间几乎不影响。

### 1.2 任意时间定时消息的使用

在 Rocketmq 5.x 的客户端中，在构造消息时提供了 3 个 API 来指定延迟时间或定时时间。

```java
Message message = new Message(TOPIC, ("Hello scheduled message " + i).getBytes(StandardCharsets.UTF_8));
// 延迟 10s 后投递
message.setDelayTimeSec(10);
// 延迟 10000ms 后投递
message.setDelayTimeMs(10_000L);
// 定时投递，定时时间为当前时间 + 10000ms
message.setDeliverTimeMs(System.currentTimeMillis() + 10_000L);
// 发送消息
SendResult result = producer.send(message);
```

## 2. 概要设计

### 2.1 任意时间定时消息的难点

任意时间定时消息的实现存在一定的难点，所以 4.x 才会实现 18 个延迟等级的定时消息，作为一个折衷的方案。

任意时间定时消息的主要难点有以下几个。

#### 2.1.1 难点1：任意的定时时间

Rocketmq 4.x 的延迟消息的原理简单来说是：将延迟消息先不存到真正的 Topic，先存到一个延迟 Topic，然后周期性扫描这个 Topic 还未投递的消息是否到期，到期则投递到真正的 Topic 中。

这个方案的局限性在于扫描的每个队列的消息延迟时间必须是相同的。否则会出现先扫描的消息要后投递的情况，如下图所示：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/knowledge/2023/07/1689609879534.png)

队列中的第一个消息延迟 100s，从队列头开始扫描，需要等待第一个消息先投递，从队列中弹出，后面的消息才能投递。所以第一条消息会**阻塞**后续消息的投递。

为了避免这个问题，Rocketmq 4.x 的延迟 Topic 中包含 18 个队列，每个队列代表一个延迟等级，对应一个**固定的延迟时长**，用一个周期性任务去扫描。

但任意时间定时消息不可能无限制地增加延迟时长对应的队列数量，这是一个难点。

#### 2.1.2 难点2：定时消息的存储和老化

我们知道 Rocketmq 的消息是有老化时间的，默认时间为 3 天。这就意味着延迟时间超过 3 天的消息可能会被老化清除，永远无法投递。

让定时消息不受老化时间的限制，这也是一个难点。

#### 2.1.3 难点3：大量定时消息的极端情况

在定时消息场景下有一种极端情况，就是在同一时刻定时了超大量的消息，需要在一瞬间投递（比如在 8 点定时了 1 亿条消息）。

如果不进行流控直接写入，会把 Rocketmq 冲垮。

### 2.2 设计思路

#### 2.2.1 任意时间定时

实现任意时间的定时的要点在于知道在某一时刻需要投递哪些消息，以及破除一个队列只能保存同一个延迟等级的消息的限制。

联想 Rocketmq 的索引文件 `IndexFile`，可以通过索引文件来辅助定时消息的查询。需要建立这样的一个索引结构：Key 是时间戳，Value 表示这个时间要投递的所有定时消息。类似如下的结构：

```java
Map<Long /* 投递时间戳 */, List<Message /* 被定时的消息 */>>
```

把这个索引结构以文件的形式实现，其中的 `Message` 可以仅保存消息的存储位置，投递的时候再查出来。

---

RIP-43 中就引入了这样的两个存储文件：`TimerWheel` 和 `TimerLog`，存储结构如下图所示：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202308072300082.png)

`TimerWheel` 是时间轮的抽象，表示投递时间，它保存了 2 天（默认）内的所有时间窗。每个槽位表示一个对应的投递时间窗，并且可以调整槽位对应的时间窗长度来控制定时的精确度。

采用时间轮的好处是它可以复用，在 2 天之后无需新建时间轮文件，而是只要将当前的时间轮直接覆盖即可。

`TimerLog` 是定时消息文件，保存定时消息的索引（在`CommitLog` 中存储的位置）。它的存储结构类似 `CommitLog`，是 Append-only Log。

`TimerWheel` 中的每个槽位都可以保存一个指向 `TimerLog` 中某个元素的索引，`TimerLog` 中的元素又保存它前一个元素的索引。也就是说，`TimerLog` 呈链表结构，存储着 `TimerWheel` 对应槽位时间窗所要投递的所有定时消息。

#### 2.2.2 定时消息轮转：避免定时消息被老化删除

为了防止定时消息在投递之前就被老化删除，能想到的办法主要是两个：

1. 用单独的文件存储，不受 Rocketmq 老化时间限制
2. 在定时消息被老化之前，重新将他放入 `CommitLog`

方法 1 需要引入新的存储文件，占用磁盘空间；方法 2 则需要在消息被老化前重新将其放入 `CommitLog`，增加了处理逻辑的复杂性。

RIP-43 中选择了第二种方案，在定时消息**放入时间轮前**进行判断，如果在 2 天内要投递（在时间轮的时间窗口之内），则放入时间轮，否则重新放入 `CommitLog` 进行轮转。

#### 2.2.3 定时任务划分和解耦

RIP-43 中，将定时消息的保存和投递分为多个步骤。为每个步骤单独定义了一个服务线程来处理。

保存：

1. 从定时消息 Topic 中扫描定时消息
2. 将定时消息（偏移量）放入 `TimerLog` 和 `TimeWheel` 保存

投递：

1. 从时间轮中扫描到期的定时消息（偏移量）
2. 根据定时消息偏移量，到 `CommitLog` 中查询完整的消息体
3. 将查到的消息投递到 `CommitLog` 的目标 Topic

每两个步骤之间都使用了生产-消费模式，用一个有界的 `BlockingQueue` 作为任务的缓冲区，通过缓冲区实现每个步骤的流量控制。当队列满时，新的任务需要等待，无法直接执行。

## 3. 详细设计

### 3.1 定时消息文件设计

RIP-43 中引入了两个采用本地文件系统存储的文件：`TimerWheel` 和 `TimerLog`

#### 3.1.1 `TimerWheel` 时间轮

时间轮是对时刻表的抽象，内部实际上是一个数组，表示一段时间。每项都是一个槽位，表示时刻表上的每一秒。采用时间轮的好处在于它可以循环使用，在时间轮表示的这段时间过去之后，无需创建新的文件，直接可以表示下一段时间。

时间轮的每个槽位表示这一时刻需要投递的所有定时消息，槽位中保存了指向 `TimerLog` 的指针，与 `TimerLog` 一同构成一个链表，表示这组消息。

时间轮的槽位设计如下：

| delayed_time(8B) 延迟时间 | first_pos(8B) 首条位置 | last_pos(8B) 最后位置 | num(4B)消息条数 |
| ------------------------- | ---------------------- | --------------------- | --------------- |

* `first_pos`：TimerLog 中该时刻定时消息链表的第一个消息的物理偏移量（链表尾）

* `last_pos`：TimerLog 中该时刻定时消息链表的最后（最新）一个消息的物理偏移量（链表头）

#### 3.1.2 `TimerLog` 定时消息索引文件

`TimerLog` 与 `TimerWheel` 配合，一起表示某一时刻需要投递的定时消息集合。

它的形式是与 `CommitLog` 相似的 Append-only Log，不过每一项不需要保存消息的全量信息，只保存了消息在 `CommitLog` 上的物理偏移量，节省空间。

它与 `TimerWheel` 中的槽位组成链表结构，所以它的每一项也有一个指向该项上一项的指针。

它的每一项结构如下：

| 名称         | 大小 | 备注                                     |
| ------------ | ---- | ---------------------------------------- |
| size         | 4B   | 保存记录的大小                           |
| prev_pos     | 8B   | 前一条记录的位置                         |
| next_Pos     | 8B   | 后一条记录的位置，暂时为-1，作为保留字段 |
| magic        | 4B   | magic value                              |
| delayed_time | 4B   | 该条记录的定时时间                       |
| offset_real  | 8B   | 该条消息在commitLog中的位置              |
| size_real    | 4B   | 该条消息在commitLog中的大小              |
| hash_topic   | 4B   | 该条消息topic的hash code                 |
| varbody      |      | 存储可变的body，暂时没有为空             |

### 3.2 定时消息投递步骤

定时消息主要的逻辑可以分为**保存**和**投递**两个阶段，RIP-43 将每个节点都拆分成不同的任务（服务线程），用生产-消费模式衔接每个任务，实现任务的解耦和流控。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202308081638752.png)

如上图所示，带有 `enqueue` 的为定时消息保存的线程和队列，带有 `dequeue` 的为定时消息投递的线程和队列。

#### 3.2.1 定时消息保存

定时消息在被保存到 `CommitLog` 前，会检查其的属性，如果消息属性中包含定时属性，则会将真正要投递的 Topic 暂存到消息属性中，把投递的 Topic 改成 `rmq_sys_wheel_timer`。

随后等待服务线程扫描这个定时 Topic 中的消息，放入时间轮，开始定时。

为了避免瞬时保存的定时消息过多，所以采用了生产-消费模式，将保存的过程分为扫描和入轮两个步骤。

##### `TimerEnqueueGetService` 扫描定时消息

这个线程通过遍历消费队列索引的方式不断扫描定时消息 Topic 中新的定时消息。

扫描到了之后将消息从 `CommitLog` 中查出来，封装成 `TimerRequest`，放入有界阻塞队列 `enqueuePutQueue`。如果队列满，则会无限次重试等待，达到流控效果。

##### `TimerEnqueuePutService` 将定时消息放入时间轮和 `TimerLog`

不断扫描队列 `enqueuePutQueue`，取出 `TimerRequest`，并**批量**放入 `TimerLog`，再放入时间轮槽位。一批结束之后再操作下一批。

如果定时时间小于当前写 `TimerLog` 的时间，说明消息已经到期，直接加入到 `dequeuePutQueue`，准备投递到 `CommitLog`。

#### 3.2.2 定时消息投递

投递的步骤被分为三个任务：

1. 从时间轮中扫描到期的定时消息（偏移量）
2. 根据定时消息偏移量，到 `CommitLog` 中查询完整的消息体
3. 将查到的消息投递到 `CommitLog` 的目标 Topic

##### `TimerDequeueGetService` 扫描时间轮中到期的消息

这个线程的作用是：推进时间轮，将时间轮槽位对应的定时消息请求从时间轮和 `TimerLog` 中取出，加入到 `dequeueGetQueue` 中。

* 每 0.1s 执行一次，根据当前扫描时间轮的时间戳，从时间轮和 `TimerLog` 中查询出 `TimerRequest`，并分成定时请求和定时消息取消请求两类。

* 先批量将取消请求入队，等待处理完毕，再将定时消息请求入队，等待处理完毕。

* 该槽位的定时消息都处理完成后，推进时间轮扫描时间到下一槽位。

##### `TimerDequeueGetMessageService` 查询原始消息

这个线程的作用是：处理 `dequeueGetQueue` 中的 `TimerRequest`，根据索引在 `CommitLog` 中查出原始消息，放到 `dequeuePutQueue`。

* 从 `dequeueGetQueue` 中取出 `TimerRequest`
* 对取出的 `TimerRequst`，从 `CommitLog` 中查询原始消息
* 处理定时消息取消请求，查询出原始消息中要取消消息的 `UNIQ_KEY`，放入 `deleteUniqKeys` Set
* 处理普通定时消息请求
  * 如果 `DeleteUniqKeys` 中包含这个消息，则什么都不做（取消投递）
  * 否则将查出的原始消息放入 `TimerRequest`，然后将 `TimerRequest` 放入 `dequeuePutQueue`，准备投递到 `CommitLog`

##### `TimerDequeuePutMessageService` 投递定时消息

这个线程的作用是：将消息从 `dequeuePutQueue` 中取出，若已经到期，投递到 `CommitLog` 中

* 无限循环从 `dequeuePutQueue` 中取出 `TimerRequest`
* 将原始消息的 Topic 和 queueId 从消息属性中取出，用它们构造成一个新的消息
* 将消息投递到 `CommitLog`
* 如果投递失败，则需要等待{精确度 / 2}时间然后重新投递，必须保证消息投递成功。

### 3.3 其他设计

#### 3.3.1 定时消息文件的恢复

Broker 可能存在正常或者异常宕机。`TimerLog` 和 `TimerWheel` 都有做定时持久化，所以对于已经持久化的数据影响不大。

对于在内存中还未持久化的数据，可以通过 `TimerLog` 原封不动地还原出来。在 RIP-43 中设置了 `Checkpoint` 文件，以记录 `TimerLog` 中已经被 `TimerWheel` 记录的消息 offset。在重新启动时，将从该 `checkpoint` 记录的位置重新开始向后遍历 `TimerLog` 文件，并开始订正 `TimerWheel` 每一格中的头尾消息索引。

#### 3.3.2 随机读/PageCache 污染问题

在 `TimerLog` 和 `CommitLog` 中去查询定时消息，都不可避免发生随机读。若要避免这个情况，势必要对消息的写入作进一步优化：排序，或者按时间轮的定位情况写入多个文件。但是这样可能带来另一个问题：大量的随机写。

正如俗话说的，“读写难两全”。由于**定时消息对于写入更加敏感**，所以可以**牺牲一定的读性能来保障写入的速度**——当然，在性能测试中，该方案的读性能同样令人满意。

#### 3.3.3 另一种实现方案：RocksDB

RIP-43 中还提出了另一种任意时间定时消息的实现方案，即使用 RocksDB（一种 KV 本地存储）。

使用这种方式存储定时消息，将定时时间作为 Key，消息作为 Value，可以做到根据时间查询该时刻的所有定时消息。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202308081824587.png)

* Key：定时时间 + Topic + 消息 ID

* Value：定时消息数据

根据 Key 扫描 RocksDB 中的定时消息，如果到期则用生产-消费模式投递到 `CommitLog` 中。

---

这种方式的优点是：

1. 流程较简单。
1. 可以避免消息的滚动导致的写放大。
1. 一定程度上避免 pagecache 的污染。

缺点是：

1. 写入时需要排序，会额外消耗时间。
1. 在对 key 进行 compaction 的过程中可能会耗费额外的 CPU 资源。
1. 消息的检索需要消耗较多的计算资源。

最终没有选用这种方案的考量：

延时消息的写入速度与读取速度难以平衡。

1. 若 value 较大，大量消息的存储会导致 compaction 计算量较大。随着消息存储量的增加，**写入速度将逐渐变慢**。
1. 若采用 kv 分离以此保障写的速度，则**读消息的速度将受到较严重的影响**。


## 4. 源码解析

## 4.1 定时消息文件

#### 4.1.1 `TimerWheel`

```java
/**
 * 时间轮，用于定时消息到时
 */
public class TimerWheel {

    /**
     * 槽位总数，默认为 604,800，为 7 天内的秒数
     */
    public final int slotsTotal;
    /**
     * 定时精度，默认 1s
     */
    public final int precisionMs;
    
    /**
     * 根据时间戳获取槽位下标
     * 
     * @param timeMs 时间戳
     * @return 槽位下标
     */
    public int getSlotIndex(long timeMs) {
        // 时间除以精度，然后对槽位总数 * 2取余
        return (int) (timeMs / precisionMs % (slotsTotal * 2));
    }
    
    /**
     * 将 TimerLog 写入的消息放入时间轮槽
     *
     * @param timeMs 定时投递时间
     * @param firstPos 该定时时间的第一条消息在 TimerLog 中的物理偏移量
     * @param lastPos 该定时时间的最后（最新）一条消息在 TimerLog 中的物理偏移量
     * @param num 该定时时间的消息数量
     * @param magic
     */
    public void putSlot(long timeMs, long firstPos, long lastPos, int num, int magic) {
        localBuffer.get().position(getSlotIndex(timeMs) * Slot.SIZE);
        localBuffer.get().putLong(timeMs / precisionMs);
        localBuffer.get().putLong(firstPos);
        localBuffer.get().putLong(lastPos);
        localBuffer.get().putInt(num);
        localBuffer.get().putInt(magic);
    }
    
    /**
     * 根据时间戳获取槽位
     * 
     * @param timeMs 时间戳
     * @return 槽位
     */
    public Slot getSlot(long timeMs) {
        Slot slot = getRawSlot(timeMs);
        if (slot.timeMs != timeMs / precisionMs * precisionMs) {
            return new Slot(-1, -1, -1);
        }
        return slot;
    }

    //testable
    public Slot getRawSlot(long timeMs) {
        localBuffer.get().position(getSlotIndex(timeMs) * Slot.SIZE);
        return new Slot(localBuffer.get().getLong() * precisionMs,
            localBuffer.get().getLong(), localBuffer.get().getLong(), localBuffer.get().getInt(), localBuffer.get().getInt());
    }
}
```

#### 4.1.2 `TimerLog`

```java
public class TimerLog {
        /**
     * 将定时消息索引写入 TimerLog
     *
     * @param data
     * @param pos
     * @param len
     * @return TimerLog 写入的物理偏移量，写入失败返回 -1
     */
    public long append(byte[] data, int pos, int len) {
        MappedFile mappedFile = this.mappedFileQueue.getLastMappedFile();
        if (null == mappedFile || mappedFile.isFull()) {
            mappedFile = this.mappedFileQueue.getLastMappedFile(0);
        }
        if (null == mappedFile) {
            log.error("Create mapped file1 error for timer log");
            return -1;
        }
        if (len + MIN_BLANK_LEN > mappedFile.getFileSize() - mappedFile.getWrotePosition()) {
            ByteBuffer byteBuffer = ByteBuffer.allocate(MIN_BLANK_LEN);
            byteBuffer.putInt(mappedFile.getFileSize() - mappedFile.getWrotePosition());
            byteBuffer.putLong(0);
            byteBuffer.putInt(BLANK_MAGIC_CODE);
            if (mappedFile.appendMessage(byteBuffer.array())) {
                //need to set the wrote position
                mappedFile.setWrotePosition(mappedFile.getFileSize());
            } else {
                log.error("Append blank error for timer log");
                return -1;
            }
            mappedFile = this.mappedFileQueue.getLastMappedFile(0);
            if (null == mappedFile) {
                log.error("create mapped file2 error for timer log");
                return -1;
            }
        }
        long currPosition = mappedFile.getFileFromOffset() + mappedFile.getWrotePosition();
        // 将定时消息索引写入 TimerLog
        if (!mappedFile.appendMessage(data, pos, len)) {
            log.error("Append error for timer log");
            return -1;
        }
        return currPosition;
    }

    /**
     * 根据偏移量获取 Buffer
     * 
     * @param offsetPy TimerLog 中的物理偏移量
     * @return
     */
    public SelectMappedBufferResult getWholeBuffer(long offsetPy) {
        MappedFile mappedFile = mappedFileQueue.findMappedFileByOffset(offsetPy);
        if (null == mappedFile)
            return null;
        return mappedFile.selectMappedBuffer(0);
    }
}
```

## 4.2 定时消息投递步骤

#### 4.2.1 `TimerEnqueueGetService` 保存——扫描定时消息 

```java
/**
 * 从 commitLog 读取指定主题（TIMER_TOPIC）的定时消息，放入 enqueuePutQueue
 *
 * @param queueId 定时消息主题队列 ID，默认为 0（定时消息主题只有一个队列）
 * @return 是否取到消息
 */
public boolean enqueue(int queueId) {
    if (storeConfig.isTimerStopEnqueue()) {
        return false;
    }
    if (!isRunningEnqueue()) {
        return false;
    }
    // 获取定时消息主题的消费队列
    ConsumeQueue cq = (ConsumeQueue) this.messageStore.getConsumeQueue(TIMER_TOPIC, queueId);
    if (null == cq) {
        return false;
    }
    // 更新当前读取的队列偏移量
    if (currQueueOffset < cq.getMinOffsetInQueue()) {
        LOGGER.warn("Timer currQueueOffset:{} is smaller than minOffsetInQueue:{}", currQueueOffset, cq.getMinOffsetInQueue());
        currQueueOffset = cq.getMinOffsetInQueue();
    }
    long offset = currQueueOffset;
    SelectMappedBufferResult bufferCQ = cq.getIndexBuffer(offset);
    if (null == bufferCQ) {
        return false;
    }
    try {
        int i = 0;
        // 遍历消费队列中的索引，查询消息，封装成 TimerRequest，放入 enqueuePutQueue
        for (; i < bufferCQ.getSize(); i += ConsumeQueue.CQ_STORE_UNIT_SIZE) {
            perfs.startTick("enqueue_get");
            try {
                long offsetPy = bufferCQ.getByteBuffer().getLong();
                int sizePy = bufferCQ.getByteBuffer().getInt();
                bufferCQ.getByteBuffer().getLong(); //tags code
                MessageExt msgExt = getMessageByCommitOffset(offsetPy, sizePy);
                if (null == msgExt) {
                    perfs.getCounter("enqueue_get_miss");
                } else {
                    lastEnqueueButExpiredTime = System.currentTimeMillis();
                    lastEnqueueButExpiredStoreTime = msgExt.getStoreTimestamp();
                    long delayedTime = Long.parseLong(msgExt.getProperty(TIMER_OUT_MS));
                    // use CQ offset, not offset in Message
                    msgExt.setQueueOffset(offset + (i / ConsumeQueue.CQ_STORE_UNIT_SIZE));
                    TimerRequest timerRequest = new TimerRequest(offsetPy, sizePy, delayedTime, System.currentTimeMillis(), MAGIC_DEFAULT, msgExt);
                    // 无限次重试，直到成功放入 enqueuePutQueue，达到流控效果
                    while (true) {
                        if (enqueuePutQueue.offer(timerRequest, 3, TimeUnit.SECONDS)) {
                            break;
                        }
                        if (!isRunningEnqueue()) {
                            return false;
                        }
                    }
                }
            } catch (Exception e) {
                //here may cause the message loss
                if (storeConfig.isTimerSkipUnknownError()) {
                    LOGGER.warn("Unknown error in skipped in enqueuing", e);
                } else {
                    holdMomentForUnknownError();
                    throw e;
                }
            } finally {
                perfs.endTick("enqueue_get");
            }
            //if broker role changes, ignore last enqueue
            if (!isRunningEnqueue()) {
                return false;
            }
            // 移动消费队列下标，到下一个消费队列索引
            currQueueOffset = offset + (i / ConsumeQueue.CQ_STORE_UNIT_SIZE);
        }
        currQueueOffset = offset + (i / ConsumeQueue.CQ_STORE_UNIT_SIZE);
        return i > 0;
    } catch (Exception e) {
        LOGGER.error("Unknown exception in enqueuing", e);
    } finally {
        bufferCQ.release();
    }
    return false;
}
```

#### 4.2.2 `TimerEnqueuePutService` 保存——定时消息放入时间轮

```java
// TimerEnqueuePutService
@Override
public void run() {
    TimerMessageStore.LOGGER.info(this.getServiceName() + " service start");
    while (!this.isStopped() || enqueuePutQueue.size() != 0) {
        try {
            long tmpCommitQueueOffset = currQueueOffset;
            List<TimerRequest> trs = null;
            //collect the requests
            TimerRequest firstReq = enqueuePutQueue.poll(10, TimeUnit.MILLISECONDS);
            // 如果队列中有 TimerRequest，循环将队列中的所有 TimerRequest 都取出
            if (null != firstReq) {
                trs = new ArrayList<>(16);
                trs.add(firstReq);
                while (true) {
                    TimerRequest tmpReq = enqueuePutQueue.poll(3, TimeUnit.MILLISECONDS);
                    if (null == tmpReq) {
                        break;
                    }
                    trs.add(tmpReq);
                    if (trs.size() > 10) {
                        break;
                    }
                }
            }
            // 队列中没有 TimerRequest，更新 commitQueueOffset 和 ，直接跳过
            if (CollectionUtils.isEmpty(trs)) {
                commitQueueOffset = tmpCommitQueueOffset;
                maybeMoveWriteTime();
                continue;
            }
            while (!isStopped()) {
                // 并发将 TimerRequest 中的消息写入到 TimerLog 中
                CountDownLatch latch = new CountDownLatch(trs.size());
                for (TimerRequest req : trs) {
                    req.setLatch(latch);
                    try {
                        perfs.startTick("enqueue_put");
                        DefaultStoreMetricsManager.incTimerEnqueueCount(getRealTopic(req.getMsg()));
                        if (shouldRunningDequeue && req.getDelayTime() < currWriteTimeMs) {
                            // 如果定时时间小于当前写 TimerLog 的时间，说明消息已经到期
                            // 直接加入到 dequeuePutQueue，准备投递到 CommitLog
                            dequeuePutQueue.put(req);
                        } else {
                            // 将 TimerRequest 加入 TimerLog 和时间轮
                            boolean doEnqueueRes = doEnqueue(req.getOffsetPy(), req.getSizePy(), req.getDelayTime(), req.getMsg());
                            req.idempotentRelease(doEnqueueRes || storeConfig.isTimerSkipUnknownError());
                        }
                        perfs.endTick("enqueue_put");
                    } catch (Throwable t) {
                        LOGGER.error("Unknown error", t);
                        if (storeConfig.isTimerSkipUnknownError()) {
                            req.idempotentRelease(true);
                        } else {
                            holdMomentForUnknownError();
                        }
                    }
                }
                // 检查和等待 CountDownLatch
                checkDequeueLatch(latch, -1);
                boolean allSucc = true;
                for (TimerRequest tr : trs) {
                    allSucc = allSucc && tr.isSucc();
                }
                if (allSucc) {
                    // 全部写入成功
                    break;
                } else {
                    // 有写入失败，等待 0.05s
                    holdMomentForUnknownError();
                }
            }
            // 更新 commitQueueOffset 和 currWriteTimeMs
            commitQueueOffset = trs.get(trs.size() - 1).getMsg().getQueueOffset();
            maybeMoveWriteTime();
        } catch (Throwable e) {
            TimerMessageStore.LOGGER.error("Unknown error", e);
        }
    }
    TimerMessageStore.LOGGER.info(this.getServiceName() + " service end");
}
```

```java
/**
 * 将 CommitLog 中的定时消息放入 TimerLog 和时间轮
 *
 * @param offsetPy 索引项在 TimerLog 中的物理偏移量
 * @param sizePy 索引项在 TimerLog 中的大小
 * @param delayedTime 定时投递时间
 * @param messageExt 索引项对应的消息
 * @return 写入 TimerLog 是否成功
 */
public boolean doEnqueue(long offsetPy, int sizePy, long delayedTime, MessageExt messageExt) {
    LOGGER.debug("Do enqueue [{}] [{}]", new Timestamp(delayedTime), messageExt);
    //copy the value first, avoid concurrent problem
    long tmpWriteTimeMs = currWriteTimeMs;
    // 判断定时消息是否需要轮转。判断依据为：定时消息是不是近 2 天内要投递，不是则需要轮转
    boolean needRoll = delayedTime - tmpWriteTimeMs >= timerRollWindowSlots * precisionMs;
    int magic = MAGIC_DEFAULT;
    if (needRoll) {
        magic = magic | MAGIC_ROLL;
        if (delayedTime - tmpWriteTimeMs - timerRollWindowSlots * precisionMs < timerRollWindowSlots / 3 * precisionMs) {
            //give enough time to next roll
            delayedTime = tmpWriteTimeMs + (timerRollWindowSlots / 2) * precisionMs;
        } else {
            delayedTime = tmpWriteTimeMs + timerRollWindowSlots * precisionMs;
        }
    }
    // 是否是取消定时消息
    boolean isDelete = messageExt.getProperty(TIMER_DELETE_UNIQKEY) != null;
    if (isDelete) {
        magic = magic | MAGIC_DELETE;
    }
    String realTopic = messageExt.getProperty(MessageConst.PROPERTY_REAL_TOPIC);
    // 获取定时消息对应的时间轮槽
    Slot slot = timerWheel.getSlot(delayedTime);
    ByteBuffer tmpBuffer = timerLogBuffer;
    tmpBuffer.clear();
    tmpBuffer.putInt(TimerLog.UNIT_SIZE); //size
    tmpBuffer.putLong(slot.lastPos); //prev pos
    tmpBuffer.putInt(magic); //magic
    tmpBuffer.putLong(tmpWriteTimeMs); //currWriteTime
    tmpBuffer.putInt((int) (delayedTime - tmpWriteTimeMs)); //delayTime
    tmpBuffer.putLong(offsetPy); //offset
    tmpBuffer.putInt(sizePy); //size
    tmpBuffer.putInt(hashTopicForMetrics(realTopic)); //hashcode of real topic
    tmpBuffer.putLong(0); //reserved value, just set to 0 now
    long ret = timerLog.append(tmpBuffer.array(), 0, TimerLog.UNIT_SIZE);
    if (-1 != ret) {
        // 写入 TimerLog 成功，将写入 TimerLog 的消息加入时间轮
        // If it's a delete message, then slot's total num -1
        // TODO: check if the delete msg is in the same slot with "the msg to be deleted".
        timerWheel.putSlot(delayedTime, slot.firstPos == -1 ? ret : slot.firstPos, ret,
            isDelete ? slot.num - 1 : slot.num + 1, slot.magic);
        addMetric(messageExt, isDelete ? -1 : 1);
    }
    return -1 != ret;
}
```

#### 4.2.3 `TimerDequeueGetService` 投递——扫描时间轮中到期的消息

```java
/**
 * 获取时间轮一个槽位中对应的 TimerLog 定时消息请求列表，放入 dequeueGetQueue 中处理
 *
 * @return 0：当前读取的时间轮槽为空 no message，1：处理成功，2：处理失败
 * @throws Exception
 */
public int dequeue() throws Exception {
    if (storeConfig.isTimerStopDequeue()) {
        return -1;
    }
    if (!isRunningDequeue()) {
        return -1;
    }
    if (currReadTimeMs >= currWriteTimeMs) {
        return -1;
    }

    // 根据当前时间轮扫描的时间戳，获取时间轮当前槽
    Slot slot = timerWheel.getSlot(currReadTimeMs);
    if (-1 == slot.timeMs) {
        // 如果当前槽为空，推进时间轮并返回
        moveReadTime();
        return 0;
    }
    try {
        //clear the flag
        dequeueStatusChangeFlag = false;

        // 获取 TimerLog 中的物理偏移量
        long currOffsetPy = slot.lastPos;
        Set<String> deleteUniqKeys = new ConcurrentSkipListSet<>();
        // 普通定时消息请求栈
        LinkedList<TimerRequest> normalMsgStack = new LinkedList<>();
        // 定时消息取消请求栈
        LinkedList<TimerRequest> deleteMsgStack = new LinkedList<>();
        // TimerLog Buffer 队列
        LinkedList<SelectMappedBufferResult> sbrs = new LinkedList<>();
        SelectMappedBufferResult timeSbr = null;
        // 从 TimerLog 链表中一个一个读取索引项，放入请求栈
        //read the timer log one by one
        while (currOffsetPy != -1) {
            perfs.startTick("dequeue_read_timerlog");
            if (null == timeSbr || timeSbr.getStartOffset() > currOffsetPy) {
                timeSbr = timerLog.getWholeBuffer(currOffsetPy);
                if (null != timeSbr) {
                    sbrs.add(timeSbr);
                }
            }
            if (null == timeSbr) {
                break;
            }
            // TimerLog 链表前一个索引项的物理偏移量
            long prevPos = -1;
            try {
                int position = (int) (currOffsetPy % timerLogFileSize);
                timeSbr.getByteBuffer().position(position);
                timeSbr.getByteBuffer().getInt(); //size
                prevPos = timeSbr.getByteBuffer().getLong();
                int magic = timeSbr.getByteBuffer().getInt();
                long enqueueTime = timeSbr.getByteBuffer().getLong();
                long delayedTime = timeSbr.getByteBuffer().getInt() + enqueueTime;
                long offsetPy = timeSbr.getByteBuffer().getLong();
                int sizePy = timeSbr.getByteBuffer().getInt();
                // 读取 TimerLog 索引项，构造出 TimerRequest
                TimerRequest timerRequest = new TimerRequest(offsetPy, sizePy, delayedTime, enqueueTime, magic);
                timerRequest.setDeleteList(deleteUniqKeys);
                if (needDelete(magic) && !needRoll(magic)) {
                    // 取消定时请求
                    deleteMsgStack.add(timerRequest);
                } else {
                    // 普通定时消息请求
                    normalMsgStack.addFirst(timerRequest);
                }
            } catch (Exception e) {
                LOGGER.error("Error in dequeue_read_timerlog", e);
            } finally {
                // 读取 TimerLog 链表中前一项
                currOffsetPy = prevPos;
                perfs.endTick("dequeue_read_timerlog");
            }
        }
        if (deleteMsgStack.size() == 0 && normalMsgStack.size() == 0) {
            LOGGER.warn("dequeue time:{} but read nothing from timerlog", currReadTimeMs);
        }
        for (SelectMappedBufferResult sbr : sbrs) {
            if (null != sbr) {
                sbr.release();
            }
        }
        if (!isRunningDequeue()) {
            return -1;
        }
        // 分批将定时消息删除请求放入 dequeueGetQueue 去处理
        CountDownLatch deleteLatch = new CountDownLatch(deleteMsgStack.size());
        //read the delete msg: the msg used to mark another msg is deleted
        for (List<TimerRequest> deleteList : splitIntoLists(deleteMsgStack)) {
            for (TimerRequest tr : deleteList) {
                tr.setLatch(deleteLatch);
            }
            dequeueGetQueue.put(deleteList);
        }
        // 等待定时消息删除请求处理（放入 dequeuePutQueue）
        //do we need to use loop with tryAcquire
        checkDequeueLatch(deleteLatch, currReadTimeMs);

        // 分批将定时消息请求放入 dequeueGetQueue 去处理
        CountDownLatch normalLatch = new CountDownLatch(normalMsgStack.size());
        //read the normal msg
        for (List<TimerRequest> normalList : splitIntoLists(normalMsgStack)) {
            for (TimerRequest tr : normalList) {
                tr.setLatch(normalLatch);
            }
            dequeueGetQueue.put(normalList);
        }
        // 等待定时消息请求处理（放入 dequeuePutQueue）
        checkDequeueLatch(normalLatch, currReadTimeMs);
        // if master -> slave -> master, then the read time move forward, and messages will be lossed
        if (dequeueStatusChangeFlag) {
            return -1;
        }
        if (!isRunningDequeue()) {
            return -1;
        }
        // 推进时间轮
        moveReadTime();
    } catch (Throwable t) {
        LOGGER.error("Unknown error in dequeue process", t);
        if (storeConfig.isTimerSkipUnknownError()) {
            moveReadTime();
        }
    }
    return 1;
}
```

#### 4.2.4 `TimerDequeueGetMessageService` 投递——查询原始消息

```java
@Override
public void run() {
    setState(AbstractStateService.START);
    TimerMessageStore.LOGGER.info(this.getServiceName() + " service start");
    while (!this.isStopped()) {
        try {
            setState(AbstractStateService.WAITING);
            // 取出到期的 TimerRequest
            List<TimerRequest> trs = dequeueGetQueue.poll(100 * precisionMs / 1000, TimeUnit.MILLISECONDS);
            if (null == trs || trs.size() == 0) {
                continue;
            }
            setState(AbstractStateService.RUNNING);
            // 遍历 TimerRequest
            for (int i = 0; i < trs.size(); ) {
                TimerRequest tr = trs.get(i);
                boolean doRes = false;
                try {
                    long start = System.currentTimeMillis();
                    // 从 CommitLog 中查询原始消息
                    MessageExt msgExt = getMessageByCommitOffset(tr.getOffsetPy(), tr.getSizePy());
                    if (null != msgExt) {
                        if (needDelete(tr.getMagic()) && !needRoll(tr.getMagic())) {
                            // 删除消息请求
                            if (msgExt.getProperty(MessageConst.PROPERTY_TIMER_DEL_UNIQKEY) != null && tr.getDeleteList() != null) {
                                tr.getDeleteList().add(msgExt.getProperty(MessageConst.PROPERTY_TIMER_DEL_UNIQKEY));
                            }
                            // 处理删除消息请求成功，CountDownLatch -1
                            tr.idempotentRelease();
                            doRes = true;
                        } else {
                            // 普通消息请求
                            String uniqkey = MessageClientIDSetter.getUniqID(msgExt);
                            if (null == uniqkey) {
                                LOGGER.warn("No uniqkey for msg:{}", msgExt);
                            }
                            if (null != uniqkey && tr.getDeleteList() != null && tr.getDeleteList().size() > 0 && tr.getDeleteList().contains(uniqkey)) {
                                // 定时消息取消，什么都不做
                                doRes = true;
                                // 处理定时消息请求成功，CountDownLatch -1
                                tr.idempotentRelease();
                                perfs.getCounter("dequeue_delete").flow(1);
                            } else {
                                // 将查出的原始消息放入 TimerRequest，然后放入 dequeuePutQueue，准备投递到 CommitLog
                                tr.setMsg(msgExt);
                                while (!isStopped() && !doRes) {
                                    doRes = dequeuePutQueue.offer(tr, 3, TimeUnit.SECONDS);
                                }
                            }
                        }
                        perfs.getCounter("dequeue_get_msg").flow(System.currentTimeMillis() - start);
                    } else {
                        //the tr will never be processed afterwards, so idempotentRelease it
                        tr.idempotentRelease();
                        doRes = true;
                        perfs.getCounter("dequeue_get_msg_miss").flow(System.currentTimeMillis() - start);
                    }
                } catch (Throwable e) {
                    LOGGER.error("Unknown exception", e);
                    if (storeConfig.isTimerSkipUnknownError()) {
                        tr.idempotentRelease();
                        doRes = true;
                    } else {
                        holdMomentForUnknownError();
                    }
                } finally {
                    // 本 TimerRequest 求处理成功，处理下一个 TimerRequest，否则重新处理本 TimerRequest
                    if (doRes) {
                        i++;
                    }
                }
            }
            trs.clear();
        } catch (Throwable e) {
            TimerMessageStore.LOGGER.error("Error occurred in " + getServiceName(), e);
        }
    }
    TimerMessageStore.LOGGER.info(this.getServiceName() + " service end");
    setState(AbstractStateService.END);
}
```

#### 4.2.5 `TimerDequeuePutMessageService` 投递——投递定时消息

```java
@Override
public void run() {
    setState(AbstractStateService.START);
    TimerMessageStore.LOGGER.info(this.getServiceName() + " service start");
    while (!this.isStopped() || dequeuePutQueue.size() != 0) {
        try {
            setState(AbstractStateService.WAITING);
            TimerRequest tr = dequeuePutQueue.poll(10, TimeUnit.MILLISECONDS);
            if (null == tr) {
                continue;
            }
            setState(AbstractStateService.RUNNING);
            // 投递结果是否成功
            boolean doRes = false;
            boolean tmpDequeueChangeFlag = false;
            try {
                while (!isStopped() && !doRes) {
                    if (!isRunningDequeue()) {
                        dequeueStatusChangeFlag = true;
                        tmpDequeueChangeFlag = true;
                        break;
                    }
                    try {
                        perfs.startTick("dequeue_put");
                        DefaultStoreMetricsManager.incTimerDequeueCount(getRealTopic(tr.getMsg()));
                        addMetric(tr.getMsg(), -1);
                        // 将原始定时消息的 Topic 和 QueueId 等信息复原，构造一个新的消息
                        MessageExtBrokerInner msg = convert(tr.getMsg(), tr.getEnqueueTime(), needRoll(tr.getMagic()));
                        // 投递到 CommitLog
                        doRes = PUT_NEED_RETRY != doPut(msg, needRoll(tr.getMagic()));
                        while (!doRes && !isStopped()) {
                            // 如果投递失败需要重试，等待{精确度 / 2}时间然后重新投递
                            if (!isRunningDequeue()) {
                                dequeueStatusChangeFlag = true;
                                tmpDequeueChangeFlag = true;
                                break;
                            }
                            doRes = PUT_NEED_RETRY != doPut(msg, needRoll(tr.getMagic()));
                            Thread.sleep(500 * precisionMs / 1000);
                        }
                        perfs.endTick("dequeue_put");
                    } catch (Throwable t) {
                        LOGGER.info("Unknown error", t);
                        if (storeConfig.isTimerSkipUnknownError()) {
                            doRes = true;
                        } else {
                            holdMomentForUnknownError();
                        }
                    }
                }
            } finally {
                tr.idempotentRelease(!tmpDequeueChangeFlag);
            }

        } catch (Throwable e) {
            TimerMessageStore.LOGGER.error("Error occurred in " + getServiceName(), e);
        }
    }
    TimerMessageStore.LOGGER.info(this.getServiceName() + " service end");
    setState(AbstractStateService.END);
}
```

## 参考资料

* [PR: [RIP-43] Support Timing Messages with Arbitrary Time Delay](https://github.com/apache/rocketmq/pull/4642/files)
* [RIP-43 Support timing messages with arbitrary time delay](https://shimo.im/docs/gXqme9PKKpIeD7qo/read)
* [社区在讨论什么？《Support Timing Messages with Arbitrary Time Delay》](https://mp.weixin.qq.com/s/iZL8M88gF7s5NmW7DYyYDQ)


---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
