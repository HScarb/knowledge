import{_ as d}from"./plugin-vue_export-helper-c27b6911.js";import{r,o,c,a as e,b as n,d as a,w as l,e as t}from"./app-eaa093f0.js";const b={},u={href:"http://hscarb.github.io/rabbitmq/20220408-rabbitmq-3.7-install.html",target:"_blank",rel:"noopener noreferrer"},p=e("h1",{id:"rabbitmq-3-7-x-版本-安装",tabindex:"-1"},[e("a",{class:"header-anchor",href:"#rabbitmq-3-7-x-版本-安装","aria-hidden":"true"},"#"),n(" RabbitMQ 3.7.x 版本 安装")],-1),v={class:"table-of-contents"},g=e("p",null,"本文讲解 Ubuntu 下 RabbitMQ 3.7 版本的安装。",-1),m=e("h2",{id:"_1-erlang-22-x-安装",tabindex:"-1"},[e("a",{class:"header-anchor",href:"#_1-erlang-22-x-安装","aria-hidden":"true"},"#"),n(" 1. Erlang 22.x 安装")],-1),h=e("p",null,"RabbitMQ 3.7 版本依赖 Erlang 21.3 ~ 22.x 版本。",-1),_={href:"https://www.rabbitmq.com/which-erlang.html#eol-series",target:"_blank",rel:"noopener noreferrer"},k=e("p",null,"首先需要安装 Erlang。",-1),f=e("p",null,"最简单的 Erlang 安装方法是用 Erlang-Solution 提供的安装包。",-1),x={href:"https://www.erlang-solutions.com/downloads/",target:"_blank",rel:"noopener noreferrer"},w=t(`<h3 id="_1-1-deb-安装包安装" tabindex="-1"><a class="header-anchor" href="#_1-1-deb-安装包安装" aria-hidden="true">#</a> 1.1 .deb 安装包安装</h3><p>进入上述网页，选择 Erlang OTP</p><figure><img src="https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204072354057.png" alt="" tabindex="0" loading="lazy"><figcaption></figcaption></figure><p>在此处选择对应版本的 Erlang 安装包下载，并传到 Ubuntu 服务器目录。</p><figure><img src="https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204072354837.png" alt="" tabindex="0" loading="lazy"><figcaption></figcaption></figure><p>随后执行</p><div class="language-bash line-numbers-mode" data-ext="sh"><pre class="language-bash"><code>dpkg <span class="token parameter variable">-i</span> esl-erlang_22.3.4.9-1_ubuntu_focal_amd64.deb
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div></div></div><p>第一次执行会报如下错误</p><div class="language-text line-numbers-mode" data-ext="text"><pre class="language-text"><code>Selecting previously unselected package esl-erlang.
(Reading database ... 148404 files and directories currently installed.)
Preparing to unpack esl-erlang_22.3.4.9-1_ubuntu_focal_amd64.deb ...
Unpacking esl-erlang (1:22.3.4.9-1) ...
dpkg: dependency problems prevent configuration of esl-erlang:
 esl-erlang depends on libncurses5; however:
  Package libncurses5 is not installed.
 esl-erlang depends on libwxbase2.8-0 | libwxbase3.0-0 | libwxbase3.0-0v5; however:
  Package libwxbase2.8-0 is not installed.
  Package libwxbase3.0-0 is not installed.
  Package libwxbase3.0-0v5 is not installed.
 esl-erlang depends on libwxgtk2.8-0 | libwxgtk3.0-0 | libwxgtk3.0-0v5 | libwxgtk3.0-gtk3-0v5; however:
  Package libwxgtk2.8-0 is not installed.
  Package libwxgtk3.0-0 is not installed.
  Package libwxgtk3.0-0v5 is not installed.
  Package libwxgtk3.0-gtk3-0v5 is not installed.
 esl-erlang depends on libsctp1; however:
  Package libsctp1 is not installed.

dpkg: error processing package esl-erlang (--install):
 dependency problems - leaving unconfigured
Errors were encountered while processing:
 esl-erlang
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>这是因为缺少一些依赖包，执行如下命令安装。</p><div class="language-text line-numbers-mode" data-ext="text"><pre class="language-text"><code># sudo apt-get install -f

Reading package lists... Done
Building dependency tree
Reading state information... Done
Correcting dependencies... Done
The following additional packages will be installed:
  libncurses5 libsctp1 libtinfo5 libwxbase3.0-0v5 libwxgtk3.0-gtk3-0v5
Suggested packages:
  lksctp-tools
The following NEW packages will be installed:
  libncurses5 libsctp1 libtinfo5 libwxbase3.0-0v5 libwxgtk3.0-gtk3-0v5
0 upgraded, 5 newly installed, 0 to remove and 105 not upgraded.
1 not fully installed or removed.
Need to get 5,521 kB/5,529 kB of archives.
After this operation, 22.2 MB of additional disk space will be used.
Do you want to continue? [Y/n] Y
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>选择 Y 后，系统会自动安装依赖包。</p><p>随后再执行</p><div class="language-bash line-numbers-mode" data-ext="sh"><pre class="language-bash"><code>dpkg <span class="token parameter variable">-i</span> esl-erlang_22.3.4.9-1_ubuntu_focal_amd64.deb
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div></div></div><p>安装 Erlang</p><h3 id="_1-2-apt-安装" tabindex="-1"><a class="header-anchor" href="#_1-2-apt-安装" aria-hidden="true">#</a> 1.2 apt 安装</h3><p>或者可以根据 Erlang-Solution 提供的 Installation using repository 指引进行安装。</p><figure><img src="https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202204072359444.png" alt="" tabindex="0" loading="lazy"><figcaption></figcaption></figure><p>这里如果是 Ubuntu 20 版本，需要在 <code>/etc/apt/sources.list</code> 中添加</p><div class="language-list line-numbers-mode" data-ext="list"><pre class="language-list"><code>deb https://packages.erlang-solutions.com/ubuntu focal contrib
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div></div></div><p>其中 focal 这些是 Ubuntu 的版本代号。</p><p>随后更新 apt 缓存，安装 Erlang。注意此时需要指定安装 Erlang 的版本</p><div class="language-bash line-numbers-mode" data-ext="sh"><pre class="language-bash"><code><span class="token function">sudo</span> <span class="token function">apt-get</span> update
<span class="token function">sudo</span> <span class="token function">apt-get</span> <span class="token function">install</span> <span class="token assign-left variable">erlang</span><span class="token operator">=</span><span class="token number">1</span>:22.3.4.9-1
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="_2-安装-rabbitmq" tabindex="-1"><a class="header-anchor" href="#_2-安装-rabbitmq" aria-hidden="true">#</a> 2. 安装 RabbitMQ</h2><p>去 Github 发布页面下载对应的 RabbitMQ 版本的 <code>.deb</code> 安装包</p><p>全部安装包列表</p>`,26),q={href:"https://github.com/rabbitmq/rabbitmq-server/tags",target:"_blank",rel:"noopener noreferrer"},y=e("p",null,"3.7.27 版本",-1),E={href:"https://github.com/rabbitmq/rabbitmq-server/releases/tag/v3.7.27",target:"_blank",rel:"noopener noreferrer"},R=t(`<p>下载后复制到服务器上安装</p><div class="language-bash line-numbers-mode" data-ext="sh"><pre class="language-bash"><code><span class="token comment"># dpkg -i rabbitmq-server_3.7.27-1_all.deb</span>

<span class="token punctuation">(</span>Reading database <span class="token punctuation">..</span>. <span class="token number">153046</span> files and directories currently installed.<span class="token punctuation">)</span>
Preparing to unpack <span class="token punctuation">..</span>./rabbitmq-server_3.7.27-1_all.deb <span class="token punctuation">..</span>.
Unpacking rabbitmq-server <span class="token punctuation">(</span><span class="token number">3.7</span>.27-1<span class="token punctuation">)</span> over <span class="token punctuation">(</span><span class="token number">3.7</span>.27-1<span class="token punctuation">)</span> <span class="token punctuation">..</span>.
dpkg: dependency problems prevent configuration of rabbitmq-server:
 rabbitmq-server depends on socat<span class="token punctuation">;</span> however:
  Package socat is not installed.
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>提示缺少 socat 这个包，于是手动安装</p><div class="language-bash line-numbers-mode" data-ext="sh"><pre class="language-bash"><code><span class="token function">apt-get</span> <span class="token function">install</span> socat
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div></div></div><p>随后再次执行</p><div class="language-bash line-numbers-mode" data-ext="sh"><pre class="language-bash"><code>dpkg <span class="token parameter variable">-i</span> rabbitmq-server_3.7.27-1_all.deb
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div></div></div><p>RabbitMQ 被正确安装，运行</p><div class="language-bash line-numbers-mode" data-ext="sh"><pre class="language-bash"><code>rabbitmqctl cluster_status
rabbitmqctl status
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div></div></div><p>查看当前节点状态</p><h2 id="_3-rabbitmq-卸载" tabindex="-1"><a class="header-anchor" href="#_3-rabbitmq-卸载" aria-hidden="true">#</a> 3. RabbitMQ 卸载</h2>`,10),P={href:"https://stackoverflow.com/questions/39664283/how-to-remove-rabbitmq-so-i-can-reinstall",target:"_blank",rel:"noopener noreferrer"},M=t(`<div class="language-bash line-numbers-mode" data-ext="sh"><pre class="language-bash"><code><span class="token function">sudo</span> <span class="token function">apt-get</span> remove --auto-remove rabbitmq-server
<span class="token function">sudo</span> <span class="token function">apt-get</span> purge --auto-remove rabbitmq-server
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div></div></div><hr><p>欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！</p><figure><img src="https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg" alt="" tabindex="0" loading="lazy"><figcaption></figcaption></figure>`,4);function Q(z,B){const s=r("ExternalLinkIcon"),i=r("router-link");return o(),c("div",null,[e("p",null,[n("原文地址："),e("a",u,[n("http://hscarb.github.io/rabbitmq/20220408-rabbitmq-3.7-install.html"),a(s)])]),p,e("nav",v,[e("ul",null,[e("li",null,[a(i,{to:"#_1-erlang-22-x-安装"},{default:l(()=>[n("1. Erlang 22.x 安装")]),_:1}),e("ul",null,[e("li",null,[a(i,{to:"#_1-1-deb-安装包安装"},{default:l(()=>[n("1.1 .deb 安装包安装")]),_:1})]),e("li",null,[a(i,{to:"#_1-2-apt-安装"},{default:l(()=>[n("1.2 apt 安装")]),_:1})])])]),e("li",null,[a(i,{to:"#_2-安装-rabbitmq"},{default:l(()=>[n("2. 安装 RabbitMQ")]),_:1})]),e("li",null,[a(i,{to:"#_3-rabbitmq-卸载"},{default:l(()=>[n("3. RabbitMQ 卸载")]),_:1})])])]),g,m,h,e("p",null,[e("a",_,[n("https://www.rabbitmq.com/which-erlang.html#eol-series"),a(s)])]),k,f,e("p",null,[e("a",x,[n("https://www.erlang-solutions.com/downloads/"),a(s)])]),w,e("p",null,[e("a",q,[n("https://github.com/rabbitmq/rabbitmq-server/tags"),a(s)])]),y,e("p",null,[e("a",E,[n("https://github.com/rabbitmq/rabbitmq-server/releases/tag/v3.7.27"),a(s)])]),R,e("p",null,[e("a",P,[n("https://stackoverflow.com/questions/39664283/how-to-remove-rabbitmq-so-i-can-reinstall"),a(s)])]),M])}const S=d(b,[["render",Q],["__file","20220408-rabbitmq-3.7-install.html.vue"]]);export{S as default};
