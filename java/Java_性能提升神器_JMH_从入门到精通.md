# Java 性能提升神器 JMH 从入门到精通

# 背景

你在写 Java 高性能程序时有没有这样的场景：

* 纠结使用 ArrayList 还是 LinkedList 哪个更快？
* 进行运算时，怎么提高效率？使用 int 还是 long？
* 读写文件时，使用 FileChannel 还是 MappedByteBuffer 更快？
* 使用锁还是 synchronized？
* 使用 AtomicLong 还是 LongAdder 更快？
* ……

特别是在写性能要求高的程序时，这些问题会更频繁地出现。有时上网查询可以找到答案，但是当遇到更复杂、独特的场景时可能就需要自己进行性能压测。

自己写一个测试方法或者 `Main` 函数固然也可以，但是有没有更【专业】的工具？我们的神器 JMH 闪亮登场

>JMH 是 OpenJDK 提供的 JVM 基准测试工具，用于测试 Java 和其他跑在 JVM 上语言程序的性能。

那么它到底神在哪里？

# 快速开始

使用 JMH 前最好先安装一下配套的 idea 插件。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204182054455.png)



# 参考资料

* [JMH - Java 微基准测试工具（自助性能测试）@Benchmark](https://blog.csdn.net/yangbindxj/article/details/122899328)
* [顶级Java才懂的，基准测试JMH！](https://juejin.cn/post/7031008727645831176)
* [JUC学习笔记 - 08JMH入门](https://juejin.cn/post/7069967034636845092)
* [基准测试神器JMH —— 详解36个官方例子](https://juejin.cn/post/6844904147674726407)
* [性能调优必备利器之 JMH](https://www.cnblogs.com/wupeixuan/p/13091381.html)