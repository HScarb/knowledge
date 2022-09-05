# Linux 下用 tc 模拟网络异常

> https://wiki.linuxfoundation.org/networking/netem

Linux Traffic Control (tc)的扩展 Network Emulation (netem)可以很方便的模拟网络不好的情况，一般新的linux内核中(>= 2.6)已经内置了这个工具，可以方便的进行测试。

本文罗列了了 `tc`的常用的模拟命令， 以备将来使用的时候查询。

主要参考了Linux基金会的官方介绍: [netem](https://wiki.linuxfoundation.org/networking/netem)

### 1. 监控网卡

首先要查看你的网卡信息，如: `eth0`，然后将这个网卡加入监控列表 `sudo tc qdisc add dev eth0 root netem`。

如果不想再监控，可以移除这个网卡 `sudo tc qdisc del dev eth0 root netem`

如果想查看监控列表， 可以使用 `tc -s qdisc`。

`qdisc`是`queueing discipline`的缩写。

### 2. 模拟网络延迟

#### 2.1 固定延迟

```bash
tc qdisc add dev eth0 root netem delay 100ms
```

每个包都固定延迟 `100`毫秒， 设置好后你可以使用`ping`命令测试。

#### 2.2 固定延迟+小随机值

```
tc qdisc change dev eth0 root netem delay 100ms 10ms
```

延迟时间变成了 `100ms ± 10ms`。

#### 2.3 固定延迟+小随机值+相关系数

```
tc qdisc change dev eth0 root netem delay 100ms 10ms 25%
```

> This causes the added delay to be 100ms ± 10ms with the next random element depending 25% on the last one. This isn't true statistical correlation, but an approximation.

#### 2.4 遵循正态分布的延迟

典型情况下延迟并不是均分分布的，而是遵循类似正态分布的规律。所以你可以使用某种分布模拟延迟。

```
tc qdisc change dev eth0 root netem delay 100ms 20ms distribution normal
```

分布为`normal`、 `pareto`、 `paretonormal`等。

### 3. 模拟丢包

随机丢弃一些包， 丢弃比率可以设置。丢失比最小为 `232 = 0.0000000232%`。

```bash
tc qdisc change dev eth0 root netem loss 0.1%
```

上述命令会随机丢弃千分之一的包。

你还可以增加一个相关参数：

```bash
tc qdisc change dev eth0 root netem loss 0.3% 25%
```

丢弃率为千分之三， 后一个的丢弃的可能性和前一个的可能性的25%相关：

Probn = .25 *Probn-1 + .75* Random

### 4. 模拟包重复

```bash
tc qdisc change dev eth0 root netem duplicate 1%
```

类似丢包的命令，上面命令产生百分之一的重复包。

### 5. 模拟错误包

模拟随机噪音(错误包)， 这个功能在 2.6.16以及以后的版本中才加入。它会在包中随机位置更改一个bit。

```bash
tc qdisc change dev eth0 root netem corrupt 0.1%
```

### 6. 模拟包乱序

#### 6.1 方式一
使用 gap。 第5th包（5、10、15、20）立即发送，其它的包会延迟10毫秒。

```bash
tc qdisc change dev eth0 root netem gap 5 delay 10ms
```

#### 6.2 方式二
方式一乱序方式是固定的，可以预测的。方式二引入随机性：

```bash
tc qdisc change dev eth0 root netem delay 10ms reorder 25% 50%
```

25%的包会立即发送， 其它的包会延迟10毫秒。相关系数为50%。

新版的netem的包延迟设置也可能导致包乱序，如果包延迟的有一定的随机性的话：

```bash
tc qdisc change dev eth0 root netem delay 100ms 75ms
```

因为延迟时间在`100ms ± 75ms`返回内， 就有可能第二包的延迟比第一个包的延迟小，先发出去。

### 7. 控制包速(带宽)

没有直接命令，需要两条命令配合使用。

```bash
# tc qdisc add dev eth0 root handle 1:0 netem delay 100ms
# tc qdisc add dev eth0 parent 1:1 handle 10: tbf rate 256kbit buffer 1600 limit 3000
# tc -s qdisc ls dev eth0
qdisc netem 1: limit 1000 delay 100.0ms
 Sent 0 bytes 0 pkts (dropped 0, overlimits 0 )
qdisc tbf 10: rate 256Kbit burst 1599b lat 26.6ms
 Sent 0 bytes 0 pkts (dropped 0, overlimits 0 )
```