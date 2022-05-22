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
