# Arthas 笔记

## Arthas idea plugin 文档

https://www.yuque.com/wangji-yunque/rk4eks/ruradh

## 执行静态方法和 Spring 对象方法

https://hicode.club/articles/2022/03/30/1648606091635.html

### Spring

设置输出内容为json

```bash
options json-format true
```

找到 `org.springframework.boot.loader.LaunchedURLClassLoader` 的 hash

```bash
classloader -l
```

找到 spring 对象并执行方法

```bash
# 执行无参数
vmtool -c f2c488 --action getInstances \
--className org.springframework.context.ApplicationContext \
--express 'instances[0].getBean("globalCtxManager").obtGlobalStatistics()'

# 执行带参数的方法，其中参数是普通变量
vmtool -c f2c488 --action getInstances \
--className org.springframework.context.ApplicationContext \
--express 'instances[0].getBean("globalCtxManager").obtUserAliveStatus(1156083311884992513L)'

# 执行带参数的方法，其中参数是对象。如果需要构建对象，可以参考：
# https://juejin.cn/post/6844904013859651597#heading-16
vmtool -c f2c488 --action getInstances \
--className org.springframework.context.ApplicationContext \
--express 'instances[0].getBean("liveCoreService").searchLiveInfo((#demo=new com.uewell.ubirth.bus.live.bo.live.LiveInfoParam(), #demo.setId('12345L'),#demo))'
```

### 直接执行静态方法

```bash
ognl  -c 54acff7d '@io.netty.buffer.PooledByteBufAllocator@DEFAULT'
ognl  -c f2c488 '@io.netty.util.internal.PlatformDependent@DIRECT_BUFFER_PREFERRED'
```

## 使用Arthas显式执行代码，避免重启应用，10倍提升本地研发效率

https://github.com/alibaba/arthas/issues/1823

### 前提

本方法最适用于 Spring Boot 项目。

### 谁拖垮了效率？

本地开发时有两个操作最耗时：

1. 每次代码变更都要重启一次项目，重启的时间相对较长。
2. 代码深层次的一个方法，也需要有类似 HTTP 的触发入口一层一层调用过来，这是非常麻烦的事。

所以我在寻找一种可以不停机的开发方法，所有变更都能随时生效，代码随写随测。

### 探索

代码热变更方面，我使用了久负盛名的 IDEA 插件 JRebel。该插件可以做到绝大部分的新增/修改代码，安装使用方式可以在网上搜索。

但有了 JRebel 之后，我发现仍然很难调用看到的方法，如果通过 HTTP 接口调用过来很麻烦，过程很长，并且前后的一些操作的结果也是我不想要的。再比如写着写着突然对某个资源的响应内容不确定。
我希望能随时调用看到的每一个方法。后来看了一些 arthas 的 user case 和文档，大脑中最后几块拼图也终于拼上了。

### 准备工作

随意调用方法，其实是指 Spring 上下文中的方法。否则直接写 main 方法或 Tester 代码就可以随写随测。以 Spring 的上下文进行调用才是我们想要的。以下是准备工作：

1. 安装 `IDEA Arthas` 插件：https://arthas.aliyun.com/doc/idea-plugin.html
2. 项目中增加依赖 `Arthas Spring Boot Starter`：https://arthas.aliyun.com/doc/spring-boot-starter.html ，担心安全问题的话可以只在本地开启，其他环境配置 `spring.arthas.enabled = false`
3. 代码中提供获取 Spring ApplicationContext 的变量的方法，参考 https://github.com/WangJi92/arthas-plugin-demo/blob/master/src/main/java/com/wangji92/arthas/plugin/demo/common/ApplicationContextProvider.java，并配置好插件获取 Spring Context 的路径:

[![截屏2021-06-14 下午1 39 34](https://user-images.githubusercontent.com/9815635/121844093-01e9b480-cd16-11eb-91b7-bb9dee318d8c.png)](https://user-images.githubusercontent.com/9815635/121844093-01e9b480-cd16-11eb-91b7-bb9dee318d8c.png)

### 开始起飞

使用 JRebel 的方式启动项目，启动后浏览器打开 Arthas 控制台 [http://localhost:8563](http://localhost:8563/) ，在要调用的方法上选择复制`Static Spring Context Invoke Method Field`
[![截屏2021-06-14 下午1 44 03](https://user-images.githubusercontent.com/9815635/121844447-981dda80-cd16-11eb-8974-4a6af9f11af4.png)](https://user-images.githubusercontent.com/9815635/121844447-981dda80-cd16-11eb-8974-4a6af9f11af4.png)

随后到 Arthas 控制台粘贴即可：
[![截屏2021-06-14 下午1 46 21](https://user-images.githubusercontent.com/9815635/121844719-f5b22700-cd16-11eb-8aac-bcb342c22f27.png)](https://user-images.githubusercontent.com/9815635/121844719-f5b22700-cd16-11eb-8aac-bcb342c22f27.png)
[![截屏2021-06-14 下午1 46 30](https://user-images.githubusercontent.com/9815635/121844723-f77bea80-cd16-11eb-80f0-0c8539a95f23.png)](https://user-images.githubusercontent.com/9815635/121844723-f77bea80-cd16-11eb-80f0-0c8539a95f23.png)

整个开发过程中 Arthas 控制台不用关，随时想测某个方法时，复制命令 -> 控制台执行 -> 观察 即可。

此方法对以下一些场景有奇效：

1. XXL-Job 任务执行。本地不希望任务在跑，就可以在启动时关闭任务注册功能。测试时也可以不依赖 xxl-job admin 随时调试任务。
2. Dubbo 服务。不用模拟客户端或者泛化调用之类的，直接用 arthas 整。Arthas 命令不方便设置复杂的入参，这种情况可以在方法中自行覆盖参数，用 JRebel 热更新一下就行。

## ognl 使用姿势

https://cloud.tencent.com/developer/article/1846725

https://juejin.cn/post/6844904013859651597

---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
