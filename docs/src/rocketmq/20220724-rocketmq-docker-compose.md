---
title: 使用 Docker 和 docker-compose 快速部署 RocketMQ 集群 双主 / DLedger
author: Scarb
date: 2022-07-24
---

# 使用 Docker 和 docker-compose 快速部署 RocketMQ 集群 双主 / DLedger

## 背景

RocketMQ 的部署和配置较为复杂，有众多配置项和部署方式可以选择。用户往往难以快速部署 RocketMQ，进行开发和验证。

[rocketmq-docker](https://github.com/apache/rocketmq-docker) 这个项目提供了 RocketMQ 的 docker 镜像打包实现，并且提供了常用的 docker-compose 模板，可以很快地用 Docker 启动 RocketMQ，并支持多种部署模式。

## 环境准备

需要安装完成 Docker，并且可以连接 Docker Hub。然后用 git 拉取 rocketmq-docker 仓库，并进入该仓库。

```bash
git clone https://github.com/apache/rocketmq-docker.git
cd rocketmq-docker
```

## 镜像准备

可以预先准备好 RocketMQ 的镜像。本地构建或者从 Docker Hub 拉取官方打包的镜像都可以

### 本地构建 RocketMQ docker 镜像

这一步不是必须要的，也可以从 Docker Hub 中拉取官方镜像。

本地构建的最大意义在于，如果自己修改了 RocketMQ 的源码，则可以用这种方式构建自己的镜像。

```bash
cd image-build
sh build-image.sh RMQ-VERSION BASE-IMAGE
```

运行脚本之后，会拉取响应版本的 RocketMQ 安装包到本地，然后构建镜像包。

其中 `RMQ-VERSION` 是需要构建的 RocketMQ 版本，在 [这个地方](https://archive.apache.org/dist/rocketmq/) 查看可选版本列表。

`BASE-IMAGE` 可以在 `centos` 和 `alpine` 中选择。比如当前最新版本为 4.9.4，那么可以用如下命令打镜像

```bash
sh build-image.sh 4.9.4 alpine
```

打包完成后可以用如下命令查看

```bash
$ docker images
REPOSITORY                          TAG            IMAGE ID       CREATED         SIZE
apacherocketmq/rocketmq             4.9.4-alpine   58e1e7a5e556   16 hours ago    188MB
```

### 拉取远程

```bash
$ docker search rocketmq
NAME                                 DESCRIPTION                                     STARS     OFFICIAL   AUTOMATED
foxiswho/rocketmq                    rocketmq                                        77                   
rocketmqinc/rocketmq                 Image repository for Apache RocketMQ            54                   
styletang/rocketmq-console-ng        rocketmq-console-ng                             38                   
apache/rocketmq                                                                      25                   
apacherocketmq/rocketmq              Docker Image for Apache RocketMQ                22                   
```

我们选择 `apache/rocketmq`，其他的版本已经跟不上时代了，年久失修。

看一下它支持的版本号列表：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202207241613503.png)

选择最新的 4.9.4 版本拉取

```bash
$ docker pull apache/rocketmq:4.9.4
```

## Docker 启动 RocketMQ

首先需要用版本号来创建一个 stage 文件夹，运行如下命令

```bash
$ sh stage.sh 4.9.4
```

会在根目录下创建一个 `stage` 文件夹，进入到 `stage/4.9.4/templates` 目录下（有的 Linux 系统生成的路径是 `stage/4.9.4/`）

```bash
$ cd stages/4.9.4/templates/
$ ls -l
drwxrwxr-x 6 ubuntu ubuntu 4096 Jul 24 15:25 ./
drwxrwxr-x 3 ubuntu ubuntu 4096 Jul 24 15:23 ../
drwxrwxr-x 6 ubuntu ubuntu 4096 Jul 24 15:23 data/
drwxrwxr-x 4 ubuntu ubuntu 4096 Jul 24 15:26 docker-compose/
drwxrwxr-x 2 ubuntu ubuntu 4096 Jul 24 15:23 kubernetes/
-rwxrwxr-x 1 ubuntu ubuntu  902 Jul 24 15:23 play-consumer.sh*
-rwxrwxr-x 1 ubuntu ubuntu 1497 Jul 24 15:23 play-docker-compose.sh*
-rwxrwxr-x 1 ubuntu ubuntu 3201 Jul 24 15:23 play-docker-dledger.sh*
-rwxrwxr-x 1 ubuntu ubuntu 2354 Jul 24 15:23 play-docker.sh*
-rwxrwxr-x 1 ubuntu ubuntu 2271 Jul 24 15:23 play-docker-tls.sh*
-rwxrwxr-x 1 ubuntu ubuntu  947 Jul 24 15:23 play-kubernetes.sh*
-rwxrwxr-x 1 ubuntu ubuntu  901 Jul 24 15:23 play-producer.sh*
drwxrwxr-x 2 ubuntu ubuntu 4096 Jul 24 15:23 ssl/
```

具体的原理是用原来 `templates` 下的模板，替换内容中的版本号，生成 4.9.4 版本的启动脚本。

其中的多个 `.sh` 文件是用来以不同部署方式启动 RocketMQ

### 用 docker-compose 以集群模式启动 RocketMQ

如果是采用远程拉取的镜像，首选需要修改一下 `docker-compose.yml` 文件保证使用的镜像名称正确。

```bash
$ pwd
/home/ubuntu/workspace/rocketmq/rocketmq-docker/stages/4.9.4/templates
$ vim docker-compose/docker-compose.yml
# （如果拉取远程镜像）把其中默认的 image 从 apacherocketmq/rocketmq:4.9.4 改成 apache/rocketmq:4.9.4
$ ./play-docker-compose.sh 
[+] Running 4/4
 ⠿ Network docker-compose_default  Created                                                                                       
 ⠿ Container rmqnamesrv            Started                                                                                       
 ⠿ Container rmqbroker-b           Started                                                                                       
 ⠿ Container rmqbroker             Started                                         
```

运行之后会启动两个 broker 和一个 nameserver

```bash
$ docker ps
CONTAINER ID   IMAGE                                     COMMAND                  CREATED              STATUS              PORTS                                                                                                                                                   NAMES
722c5c14d3d0   apache/rocketmq:4.9.4                     "sh mqbroker -c /opt…"   About a minute ago   Up About a minute   0.0.0.0:10909->10909/tcp, :::10909->10909/tcp, 9876/tcp, 0.0.0.0:10911-10912->10911-10912/tcp, :::10911-10912->10911-10912/tcp                          rmqbroker
a7d0e64c5335   apache/rocketmq:4.9.4                     "sh mqbroker -c /opt…"   About a minute ago   Up About a minute   9876/tcp, 0.0.0.0:10929->10909/tcp, :::10929->10909/tcp, 0.0.0.0:10931->10911/tcp, :::10931->10911/tcp, 0.0.0.0:10932->10912/tcp, :::10932->10912/tcp   rmqbroker-b
a210d64eddb5   apache/rocketmq:4.9.4                     "sh mqnamesrv"           About a minute ago   Up About a minute   10909/tcp, 0.0.0.0:9876->9876/tcp, :::9876->9876/tcp, 10911-10912/tcp                                                                                   rmqnamesrv
```

## 启动 RocketMQ-dashboard

RocketMQ-dashboard 项目是 rocketmq 的控制台，可以可视化的查看 rocketmq 集群状态。也可以用 docker 启动。直接使用官方打包好的镜像，不本地构建了。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202207241636060.png)

### 用 docker 启动 rocketmq-dashboard

需要先修改 `start-dashboard.sh` 文件

```bash
$ pwd
/home/ubuntu/workspace/rocketmq/rocketmq-docker
$ vim product/start-dashboard.sh
```

将镜像名称改成 `apacherocketmq/rocketmq-dashboard`

```bash
# 修改后
ROCKETMQ_DASHBOARD_VERSION=$1

docker run -d -it --name rocketmq-dashboard -p 6765:8080 apacherocketmq/rocketmq-dashboard:${ROCKETMQ_DASHBOARD_VERSION}
```

然后运行

```bash
$ sh start-dashboard.sh 1.0.0
```

会启动 rocketmq-dashboard 的 container

```bash
$ docker ps
CONTAINER ID   IMAGE                                     COMMAND                  CREATED          STATUS          PORTS                                                                                                                                                   NAMES
433021cbeb23   apacherocketmq/rocketmq-dashboard:1.0.0   "sh -c 'java $JAVA_O…"   45 minutes ago   Up 45 minutes   0.0.0.0:6765->8080/tcp, :::6765->8080/tcp                                                                                                               rocketmq-dashboard
```

这样启动之后，登录访问 `host:6765` 地址，设置集群的 nameserver 地址，但是与集群的网络不通。

### 与集群一起用 docker-compose 启动 docker-dashboard

还是要修改 `docker-compose.yml` 文件

```bash
$ cd stages/4.9.4/templates
$ vim docker-compose/docker-compose.yml
```

在文件尾部添加如下配置，启动一个 rocketmq-dashboard 服务，并置于和集群同一个网络下

```yml
  # Service for dashboard 
  dashboard: 
    image: apacherocketmq/rocketmq-dashboard:1.0.0 
    container_name: rmq-dashboard 
    ports: 
      - 48080:8080 
    environment: 
      - NAMESRV_ADDR=namesrv:9876 
    depends_on: 
      - namesrv 
    links: 
      - namesrv 
```

然后访问 `host:48080` 地址，可以通过 dashboard 查看集群状态

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202207250040182.png)

## 以其他部署形式启动 RocketMQ

除了用 docker-compose 启动双主的集群模式之外，rocketmq-docker 项目还提供了其他部署模式的 docker 快速启动方式。比如 dledger 模式。

### Docker 启动 DLedger 模式的 RocketMQ

用 DLedger 模式前保证有足够的可用内存（8G 以上）

也是有两种方法，用本地构建的镜像和 Docker Hub 中官方上传的镜像。如果用本地打包的镜像，直接运行如下命令

```bash
$ cd stages/4.9.4/templates
$ sh play-docker-dledger.sh
```

如果要用 Docker Hub 中的镜像，则需要修改 `play-docker-dledger.sh` 中的镜像地址

```bash
$ vim play-docker-dledger.sh
:%s/apacherocketmq/apache/g
$ sh play-docker-dledger.sh
```

但是我运行时三个 Broker 都未启动成功，查看 Broker 日志，发现 `broker.conf` 文件未找到

```bash
ubuntu@VM-4-14-ubuntu:~/workspace/rocketmq/rocketmq-docker/stages/4.9.4/templates$ docker ps
CONTAINER ID   IMAGE                   COMMAND                  CREATED         STATUS         PORTS                                                                                                                                NAMES
1ae8a853012b   apache/rocketmq:4.9.4   "sh mqbroker -c ../c…"   2 seconds ago   Up 1 second    9876/tcp, 10909/tcp, 0.0.0.0:30929->30929/tcp, :::30929->30929/tcp, 10911-10912/tcp, 0.0.0.0:30931->30931/tcp, :::30931->30931/tcp   rmqbroker2
71da5cd67513   apache/rocketmq:4.9.4   "sh mqnamesrv"           4 seconds ago   Up 3 seconds   10909/tcp, 0.0.0.0:9876->9876/tcp, :::9876->9876/tcp, 10911-10912/tcp                                                                rmqnamesrv
0e80d1d53112   redis:6.2               "docker-entrypoint.s…"   3 months ago    Up 3 months    0.0.0.0:46379->6379/tcp, :::46379->6379/tcp                                                                                          redis-redis-1
ubuntu@VM-4-14-ubuntu:~/workspace/rocketmq/rocketmq-docker/stages/4.9.4/templates$ docker ps -a
CONTAINER ID   IMAGE                                     COMMAND                  CREATED          STATUS                       PORTS                                                                   NAMES
1ae8a853012b   apache/rocketmq:4.9.4                     "sh mqbroker -c ../c…"   8 seconds ago    Exited (255) 6 seconds ago                                                                           rmqbroker2
b959cf8b6542   apache/rocketmq:4.9.4                     "sh mqbroker -c ../c…"   9 seconds ago    Exited (255) 6 seconds ago                                                                           rmqbroker1
919ce578e6db   apache/rocketmq:4.9.4                     "sh mqbroker -c ../c…"   10 seconds ago   Exited (255) 7 seconds ago                                                                           rmqbroker
71da5cd67513   apache/rocketmq:4.9.4                     "sh mqnamesrv"           10 seconds ago   Up 9 seconds                 10909/tcp, 0.0.0.0:9876->9876/tcp, :::9876->9876/tcp, 10911-10912/tcp   rmqnamesrv

ubuntu@VM-4-14-ubuntu:~/workspace/rocketmq/rocketmq-docker/stages/4.9.4/templates$ docker logs -t rmqbroker --tail=100
2022-07-27T15:58:11.218761998Z java.io.FileNotFoundException: ../conf/dledger/broker.conf (No such file or directory)
2022-07-27T15:58:11.218878131Z  at java.io.FileInputStream.open0(Native Method)
2022-07-27T15:58:11.218887204Z  at java.io.FileInputStream.open(FileInputStream.java:195)
2022-07-27T15:58:11.218891884Z  at java.io.FileInputStream.<init>(FileInputStream.java:138)
2022-07-27T15:58:11.218953791Z  at java.io.FileInputStream.<init>(FileInputStream.java:93)
2022-07-27T15:58:11.218960481Z  at org.apache.rocketmq.broker.BrokerStartup.createBrokerController(BrokerStartup.java:119)
2022-07-27T15:58:11.218965349Z  at org.apache.rocketmq.broker.BrokerStartup.main(BrokerStartup.java:57)
```

于是想办法修改 `play-docker-dledger.sh` 中的 Broker 配置文件路径，改成 `/opt/rocketmq-4.9.4/conf/dledger/broker.conf`，然后启动成功

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202207280025262.png)

### Docker 启动单节点 RocketMQ

```bash
$ cd stages/4.9.4/templates
$ sh play-docker.sh alpine
```

### Docker 启动带 TLS 的 RocketMQ

```bash
$ cd stages/4.9.4/templates
$ sh play-docker-tls.sh
```



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
