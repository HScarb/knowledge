# RocketMQ 与 Kafka 对零拷贝的使用 源码解析



## 参考资料

* [磁盘I/O那些事 - 美团技术团队](https://tech.meituan.com/2017/05/19/about-desk-io.html)
* [什么是零拷贝？ - 小林coding](https://xiaolincoding.com/os/8_network_system/zero_copy.html)
* [文件 I/O 简明概述 - Spongecaptain](https://github.com/spongecaptain/SimpleClearFileIO)
* [怎么理解内存中的Buffer和Cache？ - 倪朋飞](https://time.geekbang.org/column/article/74633)
* [linux中普通文件和块设备文件的区别 - CobbLiu](https://www.cnblogs.com/cobbliu/archive/2012/03/17/2403973.html)
* [Linux内核Page Cache和Buffer Cache关系及演化历史 - lday](https://lday.me/2019/09/09/0023_linux_page_cache_and_buffer_cache/)
* [Kafka和RocketMQ底层存储之那些你不知道的事 - yes的练级攻略](https://juejin.cn/post/6854573219157196807)
* [性能之道：RocketMQ与Kafka高性能设计对比 - 丁威](https://time.geekbang.org/column/article/541813?cid=100114001)

