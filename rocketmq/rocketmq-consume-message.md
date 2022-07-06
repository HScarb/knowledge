# RocketMQ 消息消费设计和原理详解 源码解析

[TOC]

## 1. 背景

## 2. 概述

### 2.1 消费组概念与消费模式

#### 2.1.1 

### 2.2 消息传输方式

#### 2.2.1 Pull 方式

#### 2.2.2 Push 方式

#### 2.2.3 Pop 方式

### 2.3 消费端高可靠

#### 2.3.1 重试-死信机制

#### 2.3.2 队列负载机制与重平衡

### 2.4 并发消费与顺序消费

### 2.5 消费进度反馈机制

## 3. 详细设计

## 4. 源码解析

## 参考资料

* [官方文档——设计](https://github.com/apache/rocketmq/blob/master/docs/cn/design.md#42-consumer%E7%9A%84%E8%B4%9F%E8%BD%BD%E5%9D%87%E8%A1%A1)
* [RocketMQ 实战与进阶——丁威](http://learn.lianglianglee.com/%E4%B8%93%E6%A0%8F/RocketMQ%20%E5%AE%9E%E6%88%98%E4%B8%8E%E8%BF%9B%E9%98%B6%EF%BC%88%E5%AE%8C%EF%BC%89/08%20%E6%B6%88%E6%81%AF%E6%B6%88%E8%B4%B9%20API%20%E4%B8%8E%E7%89%88%E6%9C%AC%E5%8F%98%E8%BF%81%E8%AF%B4%E6%98%8E.md)
* [RocketMQ消费消息——白云鹏](https://www.baiyp.ren/RocketMQ%E6%B6%88%E8%B4%B9%E6%B6%88%E6%81%AF.htm)
* [消息中间件—RocketMQ消息消费（一）——癫狂侠](https://www.jianshu.com/p/f071d5069059)
* [RocketMQ 消息接受流程——赵坤](https://kunzhao.org/docs/rocketmq/rocketmq-message-receive-flow/)
* [RocketMQ 消息消费——贝贝猫](https://zhuanlan.zhihu.com/p/360911990)
* [RocketMQ 5.0 POP 消费模式探秘](https://juejin.cn/post/7028940161635319838)
* [RocketMQ消息消费源码分析](https://www.jianshu.com/p/4757079f871f)
* [Rocketmq消费消息原理——服务端技术栈](https://blog.csdn.net/daimingbao/article/details/120231289)
* [RocketMQ——4. Consumer 消费消息——Kong](http://47.100.139.123/blog/article/89)