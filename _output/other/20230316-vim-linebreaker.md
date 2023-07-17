# Vim 显示、去除换行符

## 背景

* Dos 和 windows：采用回车+换行（CR/LF）表示下一行
* UNIX/Linux：采用换行符（LF）表示下一行
* MAC OS：采用回车符（CR）表示下一行

---

* CR用符号`\r`表示, 十进制ASCII代码是13, 十六进制代码为0x0D
* LF用符号`\n`表示, 十进制ASCII代码是10, 十六制为0x0A. 

## 显示换行符

`:set list` shows newline (`$`)

`:e ++ff=unix` shows CR (`^M`)

if you want to see both, `:set list` then `:e ++ff=unix`

## 去除 CR

`:%s/\r//g`



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
