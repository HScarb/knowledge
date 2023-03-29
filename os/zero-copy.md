# 零拷贝

## 1. 背景

在接触中间件（尤其是消息队列）的过程中，经常看到如 Kafka、RocketMQ 等中间件使用零拷贝技术大大提升消息读写性能。零拷贝到底是什么？

## 2. 前置知识

### 2.1 内核空间与用户空间

### 2.2 内存管理和虚拟内存

### 2.3 Linux I/O

#### 2.3.1 I/O 缓冲区

#### 2.3.2 I/O 模式

#### 2.3.3 传统 I/O 读写

## 3. 零拷贝原理

## 4. Java 中零拷贝实现

## 5. 中间件中零拷贝的使用

### 5.1 RocketMQ

### 5.2 Kafka

## 参考资料

* 《操作系统导论》
* 《现代操作系统》
* [Linux I/O 原理和 Zero-copy 技术全面揭秘——潘少](https://strikefreedom.top/archives/linux-io-and-zero-copy)
* [深入剖析Linux IO原理和几种零拷贝机制的实现——零壹技术栈](https://zhuanlan.zhihu.com/p/83398714)
* [简述 Linux I/O 原理及零拷贝——冯志明](https://xie.infoq.cn/article/34df6603f70c94dc4172c9474)
* [Linux内核Page Cache和Buffer Cache关系及演化历史——lday](https://lday.me/2019/09/09/0023_linux_page_cache_and_buffer_cache/)
* [聊聊page cache与Kafka之间的事儿——LittleMagic](https://www.jianshu.com/p/92f33aa0ff52)
