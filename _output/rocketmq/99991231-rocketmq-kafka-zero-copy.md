# RocketMQ 与 Kafka 对零拷贝的使用 源码解析

## 背景

### 用户态和内核态



## 参考资料

* [用户态和内核态：用户态线程和内核态线程有什么区别？](https://learn.lianglianglee.com/%E4%B8%93%E6%A0%8F/%E9%87%8D%E5%AD%A6%E6%93%8D%E4%BD%9C%E7%B3%BB%E7%BB%9F-%E5%AE%8C/14%20%20%E7%94%A8%E6%88%B7%E6%80%81%E5%92%8C%E5%86%85%E6%A0%B8%E6%80%81%EF%BC%9A%E7%94%A8%E6%88%B7%E6%80%81%E7%BA%BF%E7%A8%8B%E5%92%8C%E5%86%85%E6%A0%B8%E6%80%81%E7%BA%BF%E7%A8%8B%E6%9C%89%E4%BB%80%E4%B9%88%E5%8C%BA%E5%88%AB%EF%BC%9F.md)
* [磁盘I/O那些事 - 美团技术团队](https://tech.meituan.com/2017/05/19/about-desk-io.html)
* [什么是零拷贝？ - 小林coding](https://xiaolincoding.com/os/8_network_system/zero_copy.html)
* [文件 I/O 简明概述 - Spongecaptain](https://github.com/spongecaptain/SimpleClearFileIO)
* [怎么理解内存中的Buffer和Cache？ - 倪朋飞](https://time.geekbang.org/column/article/74633)
* [linux中普通文件和块设备文件的区别 - CobbLiu](https://www.cnblogs.com/cobbliu/archive/2012/03/17/2403973.html)
* [Linux内核Page Cache和Buffer Cache关系及演化历史 - lday](https://lday.me/2019/09/09/0023_linux_page_cache_and_buffer_cache/)
* [Kafka和RocketMQ底层存储之那些你不知道的事 - yes的练级攻略](https://juejin.cn/post/6854573219157196807)
* [性能之道：RocketMQ与Kafka高性能设计对比 - 丁威](https://time.geekbang.org/column/article/541813?cid=100114001)
* [Linux I/O 原理和 Zero-copy 技术全面揭秘](https://strikefreedom.top/archives/linux-io-and-zero-copy)



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
