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

### 可重入

如果某个线程试图获得一个已经由它自己持有地锁，这个请求会成功。“重入”意味着获取锁的操作粒度时“线程”，而不是“调用”。

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

限流：不允许多余 N 个线程同时进入临界区

## ReadWriteLock

读写锁，适用于读多写少场景。

1. 允许多个线程同时读共享变量；
2. 只允许一个线程写共享变量；
3. 如果一个写线程正在执行写操作，此时禁止读线程读共享变量。
