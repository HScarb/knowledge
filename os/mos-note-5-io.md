# 现代操作系

# 统 第五章 输入/输出

## 2. I/O 软件原理

### 2.1 I/O 软件的目标

1. 设备独立性：应该能编写出：可以访问任意 I/O 设备而无需事先指定设备的程序。
2. 错误处理：错误应尽可能在接近硬件的层面得到处理，低层软件处理不了的情况下才上交高层处理。因为许多情况下重复该操作错误就能透明地解决，高层软件甚至不知道存在错误。
3. 同步和异步传输：操作系统使实际上是终端驱动的操作变为在用户程序看来是阻塞式的操作，使用户程序更加容易编写；也允许程序控制 I/O 的所有细节。
4. 缓冲：有些设备的数据需预先放置到输出缓冲区之中，从而消除缓冲区填满速率和缓冲区清空速率之间的相互影响。
5. 共享设备和独占设备：有些设备需要能同时让多个用户使用，有些设备必须由弹弓用户独占使用。

## 2.2 程序控制 I/O

以控制打印机打印字符为例，操作系统通常将字符串缓冲区复制到内核空间的一个数组中，在这里访问更加容易（因为内核可能必须修改内存映射才能达到用户空间）。然后轮询（或叫忙等待）打印机变为就绪状态，打印下一个字符。如下图所示：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/image-20230318205824766.png)

操作系统的操作可以用代码来表示：

```C
copy_from_user(buffer, p, count);			// 将字符串缓冲区复制到内核数组，p是内核缓冲区
for (i = 0; i < count; i++) { 				// 对每个字符循环
    while (*printer_status_reg != READY);	// 轮询/忙等待，直到打印机就绪
    *printer_data_register = p[i];			// 输出一个字符
}
return_to_user();
```

程序控制 I/O 的最大缺点是：**直到全部 I/O 完成之前，要占用 CPU 的全部时间**

---

发起系统调用 `read()` ，如果使用程序控制 I/O：

![img](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/blocking-io-flow.png)

## 2.3 中断驱动 I/O

使用中断驱动 I/O 将一个字符串写到打印机

```C
// 打印的系统调用被发出时执行的代码
copy_from_user(buffer, p, count);			// 将字符串复制到内核缓冲区
enable_interrupts();						// 打开中断，允许外设发出中断请求
while (*printer_status_reg != READY);		// 等待打印机准备完毕
*printer_data_register = p[0];				// 向数据端口输出第一个字符（打印第一个字符）
scheduler();								// CPU调用调度程序，运行其他进程；阻塞当前进程（用户进程）
```



```C
// 打印机的中断服务过程
if (count == 0) {
    unblock_user();							// 若字符串打印完，解除用户进程阻塞
} else {
    *printer_data_register = p[i];			// 向数据端口输出一个字符（打印）
    count = count - 1;						// 未打印字符数量 - 1
    i = i + 1;								// 下一个打印字符下标 + 1
}
acknowledge_interrupt();					// 中断应答（清除中断请求）
return_from_interrupt();					// 中断返回，返回到中断之前正在运行的进程
```



## 2.4 使用 DMA 的 I/O

