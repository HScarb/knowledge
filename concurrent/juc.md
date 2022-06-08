# JUC 并发工具类

## Lock

并发编程领域的两大核心问题：

- 一个是**互斥**，即同一时刻只允许一个线程访问共享资源
- 另一个是**同步**，即线程之间如何通信、协作

这两大问题，**管程**（synchronized）都是能够解决的。**Java SDK并发包通过Lock和Condition两个接口来实现管程，其中Lock用于解决互斥问题，Condition用于解决同步问题**。

### 为什么再造管程？

既然Java从语言层面已经实现了管程了，那为什么还要在SDK里提供另外一种实现呢？因为 synchronized 在功能上有一些局限性。

* 无法中断一个正在等待获取锁的线程
* 在请求获取一个锁时会无限地等待下去
* 无法实现非阻塞结构地加锁规则

### 设计新的锁

* 能响应中断：阻塞状态的线程能够响应中断信号，被唤醒。
* 支持超时：在一定时间内没有获取到锁，返回一个错误。
* 非阻塞地获取锁：尝试获取锁失败，不进入阻塞状态，而是直接返回。

Lock 接口实现了这三个设计方案

```java
// 支持中断的API
void lockInterruptibly() throws InterruptedException;
// 支持超时的API
boolean tryLock(long time, TimeUnit unit) throws InterruptedException;
// 支持非阻塞获取锁的API
boolean tryLock();
```

## ReentrantLock

`ReentrantLock` 是 Java 5.0 增加的一种新的机制，并不是用来替代内置加锁的方法，而是当内置加锁机制不适用时作为一种可选择的高级功能。相对于 synchronized 它具备如下特点

* 可中断
* 可以设置超时时间
* 可以设置为公平锁
* 支持多个条件变量  

基本语法：需要注意在 finally 中释放锁

```java
// 获取锁
reentrantLock.lock();
try {
	// 临界区
} finally {
	// 释放锁
	reentrantLock.unlock();
}
```

### 与 synchronized 的选择

* 性能：
  * Java 5.0 中，ReentrantLock 比内置锁提供更好的竞争性能，有更好的吞吐量。
  * Java 6 使用了改进后的算法来管理内置锁，与在 ReentrantLock 中使用的算法类似。二者的吞吐量非常接近，ReentrantLock 略有胜出。
* ReentrantLock 提供的其他功能
  * 定时的锁等待
  * 可中断的锁等待
  * 公平性
  * 实现非块结构的加锁
* ReentrantLock 的危险性
  * 必须在 finally 块中调用 `unlock()`
* 建议
  * 当需要这些高级功能才应该使用 ReentrantLock，否则优先使用 synchronized
  * 未来更可能会提升 `synchronized` 的性能而不是 ReentrantLock。因为 synchronized 是 JVM 的内置属性，能执行一些优化

### 可重入

如果某个**线程**试图获得一个已经由它自己持有地锁，这个请求会**成功**。“重入”意味着获取锁的操作粒度是“线程”，而不是“调用”。

### 公平锁

* 公平锁：线程按照他们发出请求的顺序来获得锁，FIFO。
* 非公平锁：不提供公平保证，有可能等待时间短的线程反而先被唤醒，获得锁。

## 用管程实现异步转同步

### 定义和实现方式

调用方是否需要等待结果，如果需要等待结果，就是**同步**；如果不需要等待结果，就是**异步**。

异步的实现方式：

1. 调用方创建一个子线程，在子线程中执行方法调用，这种调用我们称为**异步调用**；
2. 方法实现的时候，创建一个新的线程执行主要逻辑，主线程直接return，这种方法我们一般称为**异步方法**。

### dubbo 中的异步转同步

```java
// 创建锁与条件变量
private final Lock lock = new ReentrantLock();
private final Condition done = lock.newCondition();
// 调用方通过该方法等待结果
Object get(int timeout){
  long start = System.nanoTime();
  lock.lock();
  try {
		while (!isDone()) {
		  done.await(timeout);
	      long cur = System.nanoTime();
		  if (isDone() || cur - start > timeout){
		    break;
		  }
		}
  } finally {
		lock.unlock();
  }
  if (!isDone()) {
		throw new TimeoutException();
  }
  return returnFromResponse();
}
// RPC结果是否已经返回
boolean isDone() {
  return response != null;
}
// RPC结果返回时调用该方法
private void doReceived(Response res) {
  lock.lock();
  try {
    response = res;
    if (done != null) {
      done.signal();
    }
  } finally {
    lock.unlock();
  }
}
```

调用线程通过调用get()方法等待RPC返回结果，这个方法里面，你看到的都是熟悉的“面孔”：调用lock()获取锁，在finally里面调用unlock()释放锁；获取锁后，通过经典的在循环中调用await()方法来实现等待。

当RPC结果返回时，会调用doReceived()方法，这个方法里面，调用lock()获取锁，在finally里面调用unlock()释放锁，获取锁后通过调用signal()来通知调用线程，结果已经返回，不用继续等待了。

## Semaphore 信号量

几乎所有支持并发的语言都支持。用来限制能同时访问共享资源的线程上限。

对比 Lock：可以允许多个线程访问一个临界区

### 应用场景

可用于做流量控制，特别是公共资源优先的应用场景，如数据库连接（池）。

如需要读取几万个文件存储到数据库中，可以启动几十个线程并发读取，但数据库连接数有限，只有 10 个。此时必须控制只有 10 个线程可以同时获取数据库连接。

### 信号量模型

![信号量模型图](https://static001.geekbang.org/resource/image/6d/5c/6dfeeb9180ff3e038478f2a7dccc9b5c.png)

- init()：设置计数器的初始值。
- down()：计数器的值减1；如果此时计数器的值小于0，则当前线程将被阻塞，否则当前线程可以继续执行。
- up()：计数器的值加1；如果此时计数器的值小于或者等于0，则唤醒等待队列中的一个线程，并将其从等待队列中移除。

```java
class Semaphore {
  // 计数器
  int count;
  // 等待队列
  Queue queue;
  // 初始化操作
  Semaphore(int c) {
    this.count = c;
  }
  //
  void down() {
    this.count--;
    if (this.count < 0) {
      //将当前线程插入等待队列
      //阻塞当前线程
    }
  }
  void up() {
    this.count++;
    if (this.count <= 0) {
      //移除等待队列中的某个线程T
      //唤醒线程T
    }
  }
}
```

### 信号量的使用

在进入临界区之前执行一下 `down()` 操作，退出临界区之前执行一下 `up()` 操作就可以了。

```java
static int count;
// 初始化信号量
static final Semaphore s = new Semaphore(1);
// 用信号量保证互斥
static void addOne() {
  s.acquire();
  try {
    count += 1;
  } finally {
    s.release();
  }
}
```

应用场景：池化资源，如连接池。在同一时刻允许多个线程使用。

### 实现限流器

限流：不允许多于 N 个线程同时进入临界区

## ReadWriteLock

读写锁，适用于读多写少场景。

1. 允许多个线程同时读共享变量；
2. 只允许一个线程写共享变量；
3. 如果一个写线程正在执行写操作，此时禁止读线程读共享变量。

### ReentrantReadWriteLock 特性

* 可重入
* 读线程插队？
  * 非公平（默认）
  * 公平：等待时间最长的线程将优先获得锁。如果这个锁由读线程持有，而另一个线程请求写入锁，那么其他线程都不能获得读取锁，直到写线程使用完并且释放了写入锁。
* 降级：一个线程持有写入锁，在不释放该锁的情况下获得读取锁。支持
* 升级：一个线程持有读取锁，在不释放该锁的情况下获得写入锁。不支持

### 其他方法

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205311455656.png)

## StampedLock

JDK 1.8 加入，在读写锁的基础上进一步优化读性能。

`StampedLock`支持三种模式，分别是：**写锁**、**悲观读锁**和**乐观读**，相比 `ReadWriteLock` 多了**乐观读**。

写锁、悲观读锁的语义和`ReadWriteLock`的写锁、读锁的语义非常类似，允许多个线程同时获取悲观读锁，但是只允许一个线程获取写锁，写锁和悲观读锁是互斥的。不同的是：`StampedLock`里的写锁和悲观读锁加锁成功之后，都会返回一个`stamp`；然后解锁的时候，需要传入这个`stamp`。

```java
final StampedLock sl = new StampedLock();
// 获取/释放悲观读锁示意代码
long stamp = sl.readLock();
try {
  //省略业务相关代码
} finally {
  sl.unlockRead(stamp);
}
// 获取/释放写锁示意代码
long stamp = sl.writeLock();
try {
  //省略业务相关代码
} finally {
  sl.unlockWrite(stamp);
}
```

### 乐观读

所谓的乐观读模式，也就是若读的操作很多，写的操作很少的情况下，你可以乐观地认为，写入与读取同时发生几率很少，因此不悲观地使用完全的读取锁定，程序可以查看读取资料之后，是否遭到写入执行的变更，再采取后续的措施(重新读取变更信息，或者抛出异常) ，这一个小小改进，可大幅度提高程序的吞吐量。

**乐观读这个操作是无锁的**，所以相比较`ReadWriteLock`的读锁，**乐观读的性能更好一些**。`StampedLock`提供的**乐观读，是允许一个线程获取写锁，也就是说不是所有的写操作都被阻塞**。

```java
long stamp = lock.tryOptimisticRead();
// 判断执行读取操作期间，是否存在写操作，如果存在，则 validate 返回 false
if (!lock.validate(stamp)) {
    // 升级为悲观读锁
    stamp = lock.readLock();
    try {
        // 读
    } finally {
        lock.unlockRead(stamp);
    }
}
```

### 与 ReadWriteLock 对比

#### 功能

对于读多写少的场景`StampedLock`性能很好，简单的应用场景基本上可以替代`ReadWriteLock`，但是**StampedLock的功能仅仅是ReadWriteLock的子集**。

* `StampedLock` 不可重入
* 不支持条件变量

#### 性能

ReadWritLock相比，在一个线程情况下，是读速度其4倍左右，写是1倍。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205311511929.png)

下图是六个线程情况下，读性能是其几十倍，写性能也是近10倍左右：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205311510192.png)

### 使用模板

StampedLock读模板：

```java
final StampedLock sl = new StampedLock();
// 乐观读
long stamp = sl.tryOptimisticRead();
// 读入方法局部变量
......
// 校验stamp
if (!sl.validate(stamp)){
  // 升级为悲观读锁
  stamp = sl.readLock();
  try {
    // 读入方法局部变量
    .....
  } finally {
    //释放悲观读锁
    sl.unlockRead(stamp);
  }
}
//使用方法局部变量执行业务操作
......
```

StampedLock写模板：

```java
long stamp = sl.writeLock();
try {
  // 写共享变量
  **......
} finally {
  sl.unlockWrite(stamp);
}
```

## CountDownLatch

JDK 1.5 之后提供，允许一个或多个线程等待其他线程完成操作。类似于对多个线程的 `join()`，并且比 `join()` 的功能更多，更灵活。

### 应用场景

* 等待多个线程执行完成
* 等待位点执行完成

## CyclicBarrier

一组线程达到一个屏障（同步点）时被阻塞，直到最后一个线程到达时才会打开屏障，所有被拦截的线程继续运行。Cyclic，表示可以循环利用。计数器减到 0 后会自动重置成初始值。

### 应用场景

多线程计算数据，最后合并结算结果。

### 和 CountDownLatch 的区别

* CountDownLatch 计数器只能用一次，CyclicBarrier 计数器可以用 `reset()` 方法重置，可以处理更复杂的业务场景。
* CyclicBarrier 提供其他有用的方法。
  * `getNumberWaiting()` 获取阻塞线程数量
  * `isBroken()` 阻塞的线程是否被中断

## 并发容器

### 同步容器

将非线程安全的容器封装在对象内部，然后控制好访问路径，就可以将非线程安全的容器封装成同步容器。

```java
SafeArrayList<T> {
  //封装ArrayList
  List<T> c = new ArrayList<>();
  //控制访问路径
  synchronized T get(int idx){
    return c.get(idx);
  }
  synchronized void add(int idx, T t) {
    c.add(idx, t);
  }
  synchronized boolean addIfNotExist(T t){
    if(!c.contains(t)) {
      c.add(t);
      return true;
    }
    return false;
  }
}
```

`Collections` 提供了接口，将非线程安全的类包装成线程安全的类。

```java
List list = Collections.synchronizedList(new ArrayList());
Set set = Collections.synchronizedSet(new HashSet());
Map map = Collections.synchronizedMap(new HashMap());
```

需要注意的是**组合操作**和**迭代器操作**，这些操作不具备原子性

### 并发容器

#### List

`List` 只有一个实现类：`CopyOnWriteArrayList`。

* 它内部维护了一个数组，读操作都是基于数据进行的。

* 在写的时候会将共享变量重新复制一份出来，这样读操作完全无锁。写完之后将新的变量赋值回去。

![执行增加元素的内部结构图](https://static001.geekbang.org/resource/image/b8/89/b861fb667e94c4e6ea0ca9985e63c889.png)

注意事项：

1. CopyOnWriteArrayList 仅适用于**写操作非常少**的场景，而且**能够容忍读写的短暂不一致**。因为写入的新元素并不能立刻被遍历到。
2. CopyOnWriteArrayList **迭代器**是只读的，不支持增删改。因为迭代器遍历的仅仅是一个快照，而对快照进行增删改是没有意义的。

#### Map

![https://static001.geekbang.org/resource/image/6d/be/6da9933b6312acf3445f736262425abe.png](https://static001.geekbang.org/resource/image/6d/be/6da9933b6312acf3445f736262425abe.png)

此外，`ConcurrentHashMap` 的 key 是无序的，而 `ConcurrentSkipListMap` 的 key 是有序的。

`ConcurrentSkipListMap` 里面的 `SkipList` 本身就是一种数据结构，中文一般都翻译为“跳表”。跳表插入、删除、查询操作平均的时间复杂度是 O(log n)，理论上和并发线程数没有关系，所以在并发度非常高的情况下，若你对 `ConcurrentHashMap` 的性能还不满意，可以尝试一下 `ConcurrentSkipListMap`。

**跳表**

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202206071834887.png)

#### Set

Set 接口的两个实现是 `CopyOnWriteArraySet` 和 `ConcurrentSkipListSet` ，使用场景可以参考前面讲述的 `CopyOnWriteArrayList` 和`ConcurrentSkipListMap`

#### Queue

1. **阻塞与非阻塞**，所谓阻塞指的是当队列已满时，入队操作阻塞；当队列已空时，出队操作阻塞。
2. **单端与双端**，单端指的是只能队尾入队，队首出队；而双端指的是队首队尾皆可入队出队。

阻塞队列都用Blocking关键字标识，单端队列使用Queue标识，双端队列使用Deque标识

1. **单端阻塞队列**： `ArrayBlockingQueue`、`LinkedBlockingQueue`、`SynchronousQueue`、`LinkedTransferQueue`、`PriorityBlockingQueue` 和`DelayQueue`

   内部一般会持有一个队列，这个队列可以是数组（其实现是ArrayBlockingQueue）也可以是链表（其实现是LinkedBlockingQueue）；甚至还可以不持有队列（其实现是SynchronousQueue），此时生产者线程的入队操作必须等待消费者线程的出队操作。而LinkedTransferQueue融合LinkedBlockingQueue和SynchronousQueue的功能，性能比LinkedBlockingQueue更好；PriorityBlockingQueue支持按照优先级出队；DelayQueue支持延时出队。

   ![单端阻塞队列示意图](https://static001.geekbang.org/resource/image/59/83/5974a10f5eb0646fa94f7ba505bfcf83.png)

2. **双端阻塞队列**：其实现是 `LinkedBlockingDeque`

   ![双端阻塞队列示意图](https://static001.geekbang.org/resource/image/1a/96/1a58ff20f1271d899b93a4f9d54ce396.png)

3. **单端非阻塞队列**：`ConcurrentLinkedQueue`

4. **双端非阻塞队列**：`ConcurrentLinkedDeque`
