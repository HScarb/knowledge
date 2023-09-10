# Rabbitmq 内存使用分析

## 概述

运维人员需要具备分析节点内存占用的能力，比如知道内存占用的值和什么占用了最多的内存。这是系统监控的重要组成部分。

RabbitMQ 提供了一些工具，用来辅助分析节点的内存占用：

* [`rabbitmq-diagnostics memory_breakdown`](https://www.rabbitmq.com/cli.html)：内存分析命令
* [`rabbitmq-diagnostics status`](https://www.rabbitmq.com/cli.html) 包含上述内存分析命令的输出
* 基于 [Prometheus and Grafana](https://www.rabbitmq.com/prometheus.html) 的监控，能够观察内存随时间的变化
* [管理界面](https://www.rabbitmq.com/management.html) 提供了与 [`rabbitmq-diagnostics status`](https://www.rabbitmq.com/cli.html) 同样的内存分析信息
* [HTTP API](https://www.rabbitmq.com/management.html#http-api) 提供与管理页面相同的信息，对于编写监控程序来说很有用
* [rabbitmq-top](https://github.com/rabbitmq/rabbitmq-top) 和 `rabbitmq-diagnostics observer`提供了更加细粒度的类似 top 的 Erlang 进程视图

在分析节点的内存占用时，首先应该使用 `memory_breakdown`。

注意，所有这些命令提供的内存信息都是一个近似值，基于一个特定时间，由运行时或者内核返回的值，通常是表示在 5 秒时间窗口之内的值。

## 总内存计算策略

RabbitMQ 可以用不同策略来计算节点内存占用。在以前，节点从运行时获取内存的使用了多少（而不是分配了多少）。这个策略成为 `legacy`（`erlang` 的别名），它获取的内存值往往会比较低，不推荐使用。

其他更有效的内存计算策略可以使用 `vm_memory_calculation_strategy` 来配置，主要有两种：

* `rss`：使用操作系统特定的方式查询内核，去找到节点内核进程的 RSS（驻留内存大小）。这种方式是最精确的方式，在 Linux、MacOS、BSD 和 Solaris 系统中默认使用。当使用这个策略时，RabbitMQ 会每秒短暂地运行一次子进程。
* `allocated`：查询运行时内存分配器信息。它非常接近 `rss` 报告的值，在 Windows 系统上默认使用此策略。

`vm_memory_calculation_strategy`设置也影响内存分析报告，如果设置成`legacy（`erlang`）或 `allocated`，一些内存分析字段不会被返回。在本文后面有更详细的介绍。

以下配置示例使用 `rss` 策略：

```properties
vm_memory_calculation_strategy = rss
```

同样，对于 `allocated` 策略，使用：

```properties
vm_memory_calculation_strategy = allocated
```

要确定节点使用什么分配策略，请查看 [配置](../configuration/configuration.md) 这一节。

## 内存使用分析

RabbitMQ 节点可以打印它的内存使用信息。这个信息提供了一系列类别和该类别的内存占用。

