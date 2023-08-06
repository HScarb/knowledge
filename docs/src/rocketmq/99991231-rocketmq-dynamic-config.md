---
title: Rocketmq 动态配置
author: Scarb
date: 9999-12-31
---

原文地址：[http://hscarb.github.io/rocketmq/99991231-rocketmq-dynamic-config.html](http://hscarb.github.io/rocketmq/99991231-rocketmq-dynamic-config.html)

# Rocketmq 动态配置

```java
# BrokerController#constructor
// 初始化配置类，把 4 个配置项注册到配置类中，在配置类被更新时刷新配置项
this.configuration = new Configuration(
    log,
    BrokerPathConfigHelper.getBrokerConfigPath(),
    this.brokerConfig, this.nettyServerConfig, this.nettyClientConfig, this.messageStoreConfig
);
```



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
