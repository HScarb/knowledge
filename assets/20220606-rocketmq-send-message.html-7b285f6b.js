const e=JSON.parse('{"key":"v-9e6b5c72","path":"/rocketmq/20220606-rocketmq-send-message.html","title":"RocketMQ 消息发送设计和原理详解 源码剖析","lang":"zh-CN","frontmatter":{"title":"RocketMQ 消息发送设计和原理详解 源码剖析","author":"Scarb","date":"2022-06-06T00:00:00.000Z","description":"原文地址：http://hscarb.github.io/rocketmq/20220606-rocketmq-send-message.html (http://hscarb.github.io/rocketmq/20220606-rocketmq-send-message.html) [[toc]] 1. 背景 发送消息是 MQ 最基础的操作之一。...","head":[["meta",{"property":"og:url","content":"https://hscarb.github.io/rocketmq/20220606-rocketmq-send-message.html"}],["meta",{"property":"og:site_name","content":"金甲虫的博客"}],["meta",{"property":"og:title","content":"RocketMQ 消息发送设计和原理详解 源码剖析"}],["meta",{"property":"og:description","content":"原文地址：http://hscarb.github.io/rocketmq/20220606-rocketmq-send-message.html (http://hscarb.github.io/rocketmq/20220606-rocketmq-send-message.html) [[toc]] 1. 背景 发送消息是 MQ 最基础的操作之一。..."}],["meta",{"property":"og:type","content":"article"}],["meta",{"property":"og:locale","content":"zh-CN"}],["meta",{"property":"og:updated_time","content":"2022-12-15T17:51:36.000Z"}],["meta",{"property":"article:author","content":"Scarb"}],["meta",{"property":"article:published_time","content":"2022-06-06T00:00:00.000Z"}],["meta",{"property":"article:modified_time","content":"2022-12-15T17:51:36.000Z"}],["script",{"type":"application/ld+json"},"{\\"@context\\":\\"https://schema.org\\",\\"@type\\":\\"Article\\",\\"headline\\":\\"RocketMQ 消息发送设计和原理详解 源码剖析\\",\\"image\\":[\\"\\"],\\"datePublished\\":\\"2022-06-06T00:00:00.000Z\\",\\"dateModified\\":\\"2022-12-15T17:51:36.000Z\\",\\"author\\":[{\\"@type\\":\\"Person\\",\\"name\\":\\"Scarb\\"}]}"]]},"headers":[{"level":2,"title":"1. 背景","slug":"_1-背景","link":"#_1-背景","children":[]},{"level":2,"title":"2. 概述","slug":"_2-概述","link":"#_2-概述","children":[{"level":3,"title":"2.1 消息发送方式和特殊消息","slug":"_2-1-消息发送方式和特殊消息","link":"#_2-1-消息发送方式和特殊消息","children":[]},{"level":3,"title":"2.2 路由机制","slug":"_2-2-路由机制","link":"#_2-2-路由机制","children":[]},{"level":3,"title":"2.3 消息发送流程","slug":"_2-3-消息发送流程","link":"#_2-3-消息发送流程","children":[]},{"level":3,"title":"2.4 高可用设计","slug":"_2-4-高可用设计","link":"#_2-4-高可用设计","children":[]}]},{"level":2,"title":"3. 详细设计","slug":"_3-详细设计","link":"#_3-详细设计","children":[{"level":3,"title":"3.1 消息","slug":"_3-1-消息","link":"#_3-1-消息","children":[]},{"level":3,"title":"3.2 生产者类图","slug":"_3-2-生产者类图","link":"#_3-2-生产者类图","children":[]},{"level":3,"title":"3.3 生产者启动","slug":"_3-3-生产者启动","link":"#_3-3-生产者启动","children":[]},{"level":3,"title":"3.4 消息发送","slug":"_3-4-消息发送","link":"#_3-4-消息发送","children":[]},{"level":3,"title":"3.5 Broker 处理发送请求","slug":"_3-5-broker-处理发送请求","link":"#_3-5-broker-处理发送请求","children":[]},{"level":3,"title":"3.6 Batch 消息（批量消息）","slug":"_3-6-batch-消息-批量消息","link":"#_3-6-batch-消息-批量消息","children":[]}]},{"level":2,"title":"4. 源码解析","slug":"_4-源码解析","link":"#_4-源码解析","children":[{"level":3,"title":"4.1 生产者启动","slug":"_4-1-生产者启动","link":"#_4-1-生产者启动","children":[]},{"level":3,"title":"4.2 消息发送","slug":"_4-2-消息发送","link":"#_4-2-消息发送","children":[]},{"level":3,"title":"4.3 Broker 处理发送请求","slug":"_4-3-broker-处理发送请求","link":"#_4-3-broker-处理发送请求","children":[]}]},{"level":2,"title":"参考资料","slug":"参考资料","link":"#参考资料","children":[]}],"git":{"createdTime":1655010323000,"updatedTime":1671126696000,"contributors":[{"name":"ScarbWin","email":"jjhfen00@163.com","commits":5}]},"readingTime":{"minutes":20.27,"words":6082},"filePathRelative":"rocketmq/20220606-rocketmq-send-message.md","localizedDate":"2022年6月6日","autoDesc":true,"excerpt":""}');export{e as data};
