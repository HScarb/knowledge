import{_ as e}from"./plugin-vue_export-helper-c27b6911.js";import{r as t,o,c,a as n,b as a,d as i,e as p}from"./app-eaa093f0.js";const r={},l={href:"http://hscarb.github.io/rocketmq/99991231-rocketmq-dynamic-config.html",target:"_blank",rel:"noopener noreferrer"},u=p(`<h1 id="rocketmq-动态配置" tabindex="-1"><a class="header-anchor" href="#rocketmq-动态配置" aria-hidden="true">#</a> Rocketmq 动态配置</h1><div class="language-java line-numbers-mode" data-ext="java"><pre class="language-java"><code># <span class="token class-name">BrokerController</span>#constructor
<span class="token comment">// 初始化配置类，把 4 个配置项注册到配置类中，在配置类被更新时刷新配置项</span>
<span class="token keyword">this</span><span class="token punctuation">.</span>configuration <span class="token operator">=</span> <span class="token keyword">new</span> <span class="token class-name">Configuration</span><span class="token punctuation">(</span>
    log<span class="token punctuation">,</span>
    <span class="token class-name">BrokerPathConfigHelper</span><span class="token punctuation">.</span><span class="token function">getBrokerConfigPath</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
    <span class="token keyword">this</span><span class="token punctuation">.</span>brokerConfig<span class="token punctuation">,</span> <span class="token keyword">this</span><span class="token punctuation">.</span>nettyServerConfig<span class="token punctuation">,</span> <span class="token keyword">this</span><span class="token punctuation">.</span>nettyClientConfig<span class="token punctuation">,</span> <span class="token keyword">this</span><span class="token punctuation">.</span>messageStoreConfig
<span class="token punctuation">)</span><span class="token punctuation">;</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><hr><p>欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！</p><figure><img src="https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg" alt="" tabindex="0" loading="lazy"><figcaption></figcaption></figure>`,5);function d(k,m){const s=t("ExternalLinkIcon");return o(),c("div",null,[n("p",null,[a("原文地址："),n("a",l,[a("http://hscarb.github.io/rocketmq/99991231-rocketmq-dynamic-config.html"),i(s)])]),u])}const f=e(r,[["render",d],["__file","99991231-rocketmq-dynamic-config.html.vue"]]);export{f as default};
