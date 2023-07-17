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

