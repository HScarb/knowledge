# RocketMQ DLedger 日志复制 流程详解 & 源码解析

## 1. 背景

## 2. 概要设计

![](./99991231-rocketmq-dledger-log-replication.assets/dledger-entry-push-component.drawio.png)

## 3. 详细设计

| 字段名               | 所属类               | 持久化 | 含义                                                         |
| -------------------- | -------------------- | ------ | ------------------------------------------------------------ |
| writeIndex           | EntryDispatcher      | ×      | Leader 向某一 Follower 节点推送的下一 index                  |
| ledgerEndIndex       | DLedgerMmapFileStore | √      | 本地已写入存储的最大 index                                   |
| committedIndex       | DLedgerMmapFileStore | √      | 已被集群中超过半数节点确认的 index，表示已提交（可应用到状态机）的最大index |
| lastQuorumIndex      | QuorumAckChecker     | ×      | 仲裁成功的最大 index，表示已达到多数节点复制确认的最大 index |
| peerWaterMarksByTerm | DLedgerEntryPusher   | ×      | 每个 term，集群内各个节点已经确认存储的最大 index（水位线）  |

```java
lastQuorumIndex ≤ committedIndex ≤ ledgerEndIndex
```



### 3.1 Leader 日志存储

### 3.2 Leader 转发日志到 Follower

### 3.3 Follower 存储日志

### 3.4 Leader 仲裁日志复制结果

## 4. 源码解析

## 参考资料
