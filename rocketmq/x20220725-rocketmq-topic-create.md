# RocketMQ Topic 创建 源码解析

## 1. 背景

RocketMQ 中最为重要的逻辑概念非 Topic（主题）莫属。

生产者生产消息的时候需要指定 Topic，消费者订阅的维度也是 Topic。

Topic 中包含多个 Queue（队列），队列可能分布在不同的 Broker 上。

本文将详细解析 Topic 元数据结构和 Topic 创建的流程。

## 2. 概要设计

Readqueue 和 writequeue 的作用

元数据的存储和转换

请求创建

## 3. 详细设计

