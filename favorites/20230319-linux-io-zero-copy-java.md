# 深入剖析Linux IO原理和几种零拷贝机制的实现

https://zhuanlan.zhihu.com/p/83398714

## 前言

零拷贝（Zero-copy）技术指在计算机执行操作时，CPU 不需要先将数据从一个内存区域复制到另一个内存区域，从而可以减少上下文切换以及 CPU 的拷贝时间。它的作用是在数据报从网络设备到用户程序空间传递的过程中，减少数据拷贝次数，减少系统调用，实现 CPU 的零参与，彻底消除 CPU 在这方面的负载。实现零拷贝用到的最主要技术是 DMA 数据传输技术和内存区域映射技术。

- 零拷贝机制可以减少数据在内核缓冲区和用户进程缓冲区之间反复的 I/O 拷贝操作。
- 零拷贝机制可以减少用户进程地址空间和内核地址空间之间因为上下文切换而带来的 CPU 开销。

## 正文

### 1. 物理内存和虚拟内存

由于操作系统的进程与进程之间是共享 CPU 和内存资源的，因此需要一套完善的内存管理机制防止进程之间内存泄漏的问题。为了更加有效地管理内存并减少出错，现代操作系统提供了一种对主存的抽象概念，即是虚拟内存（Virtual Memory）。虚拟内存为每个进程提供了一个一致的、私有的地址空间，它让每个进程产生了一种自己在独享主存的错觉（每个进程拥有一片连续完整的内存空间）。

### 1.1. 物理内存

物理内存（Physical memory）是相对于虚拟内存（Virtual Memory）而言的。物理内存指通过物理内存条而获得的内存空间，而虚拟内存则是指将硬盘的一块区域划分来作为内存。内存主要作用是在计算机运行时为操作系统和各种程序提供临时储存。在应用中，自然是顾名思义，物理上，真实存在的插在主板内存槽上的内存条的容量的大小。

### 1.2. 虚拟内存

虚拟内存是计算机系统内存管理的一种技术。 它使得应用程序认为它拥有连续的可用的内存（一个连续完整的地址空间）。而实际上，虚拟内存通常是被分隔成多个物理内存碎片，还有部分暂时存储在外部磁盘存储器上，在需要时进行数据交换，加载到物理内存中来。 目前，大多数操作系统都使用了虚拟内存，如 Windows 系统的虚拟内存、Linux 系统的交换空间等等。

虚拟内存地址和用户进程紧密相关，一般来说不同进程里的同一个虚拟地址指向的物理地址是不一样的，所以离开进程谈虚拟内存没有任何意义。每个进程所能使用的虚拟地址大小和 CPU 位数有关。在 32 位的系统上，虚拟地址空间大小是 2 ^ 32 = 4G，在 64位系统上，虚拟地址空间大小是 2 ^ 64= 2 ^ 34G，而实际的物理内存可能远远小于虚拟内存的大小。每个用户进程维护了一个单独的页表（Page Table），虚拟内存和物理内存就是通过这个页表实现地址空间的映射的。下面给出两个进程 A、B 各自的虚拟内存空间以及对应的物理内存之间的地址映射示意图：

![img](./20230319-linux-io-zero-copy-java.assets/v2-592088b9b4f2f172d526df017a589d09_1440w.webp)

当进程执行一个程序时，需要先从先内存中读取该进程的指令，然后执行，获取指令时用到的就是虚拟地址。这个虚拟地址是程序链接时确定的（内核加载并初始化进程时会调整动态库的地址范围）。为了获取到实际的数据，CPU 需要将虚拟地址转换成物理地址，CPU 转换地址时需要用到进程的页表（Page Table），而页表（Page Table）里面的数据由操作系统维护。

其中页表（Page Table）可以简单的理解为单个内存映射（Memory Mapping）的链表（当然实际结构很复杂），里面的每个内存映射（Memory Mapping）都将一块虚拟地址映射到一个特定的地址空间（物理内存或者磁盘存储空间）。每个进程拥有自己的页表（Page Table），和其它进程的页表（Page Table）没有关系。

通过上面的介绍，我们可以简单的将用户进程申请并访问物理内存（或磁盘存储空间）的过程总结如下：

1. 用户进程向操作系统发出内存申请请求
2. 系统会检查进程的虚拟地址空间是否被用完，如果有剩余，给进程分配虚拟地址
3. 系统为这块虚拟地址创建的内存映射（Memory Mapping），并将它放进该进程的页表（Page Table）
4. 系统返回虚拟地址给用户进程，用户进程开始访问该虚拟地址
5. CPU 根据虚拟地址在此进程的页表（Page Table）中找到了相应的内存映射（Memory Mapping），但是这个内存映射（Memory Mapping）没有和物理内存关联，于是产生缺页中断
6. 操作系统收到缺页中断后，分配真正的物理内存并将它关联到页表相应的内存映射（Memory Mapping）。中断处理完成后 CPU 就可以访问内存了
7. 当然缺页中断不是每次都会发生，只有系统觉得有必要延迟分配内存的时候才用的着，也即很多时候在上面的第 3 步系统会分配真正的物理内存并和内存映射（Memory Mapping）进行关联。

在用户进程和物理内存（磁盘存储器）之间引入虚拟内存主要有以下的优点：

- 地址空间：提供更大的地址空间，并且地址空间是连续的，使得程序编写、链接更加简单
- 进程隔离：不同进程的虚拟地址之间没有关系，所以一个进程的操作不会对其它进程造成影响
- 数据保护：每块虚拟内存都有相应的读写属性，这样就能保护程序的代码段不被修改，数据块不能被执行等，增加了系统的安全性
- 内存映射：有了虚拟内存之后，可以直接映射磁盘上的文件（可执行文件或动态库）到虚拟地址空间。这样可以做到物理内存延时分配，只有在需要读相应的文件的时候，才将它真正的从磁盘上加载到内存中来，而在内存吃紧的时候又可以将这部分内存清空掉，提高物理内存利用效率，并且所有这些对应用程序是都透明的
- 共享内存：比如动态库只需要在内存中存储一份，然后将它映射到不同进程的虚拟地址空间中，让进程觉得自己独占了这个文件。进程间的内存共享也可以通过映射同一块物理内存到进程的不同虚拟地址空间来实现共享
- 物理内存管理：物理地址空间全部由操作系统管理，进程无法直接分配和回收，从而系统可以更好的利用内存，平衡进程间对内存的需求

### 2. 内核空间和用户空间

操作系统的核心是内核，独立于普通的应用程序，可以访问受保护的内存空间，也有访问底层硬件设备的权限。为了避免用户进程直接操作内核，保证内核安全，操作系统将虚拟内存划分为两部分，一部分是内核空间（Kernel-space），一部分是用户空间（User-space）。 在 Linux 系统中，内核模块运行在内核空间，对应的进程处于内核态；而用户程序运行在用户空间，对应的进程处于用户态。

内核进程和用户进程所占的虚拟内存比例是 1:3，而 Linux x86_32 系统的寻址空间（虚拟存储空间）为 4G（2的32次方），将最高的 1G 的字节（从虚拟地址 0xC0000000 到 0xFFFFFFFF）供内核进程使用，称为内核空间；而较低的 3G 的字节（从虚拟地址 0x00000000 到 0xBFFFFFFF），供各个用户进程使用，称为用户空间。下图是一个进程的用户空间和内核空间的内存布局：

![img](./20230319-linux-io-zero-copy-java.assets/v2-9a158fa2659d5baaea50be32c20e6dba_1440w.webp)

### 2.1. 内核空间

内核空间总是驻留在内存中，它是为操作系统的内核保留的。应用程序是不允许直接在该区域进行读写或直接调用内核代码定义的函数的。上图左侧区域为内核进程对应的虚拟内存，按访问权限可以分为进程私有和进程共享两块区域。

- 进程私有的虚拟内存：每个进程都有单独的内核栈、页表、task 结构以及 mem_map 结构等。
- 进程共享的虚拟内存：属于所有进程共享的内存区域，包括物理存储器、内核数据和内核代码区域。

### 2.2. 用户空间

每个普通的用户进程都有一个单独的用户空间，处于用户态的进程不能访问内核空间中的数据，也不能直接调用内核函数的 ，因此要进行系统调用的时候，就要将进程切换到内核态才行。用户空间包括以下几个内存区域：

- 运行时栈：由编译器自动释放，存放函数的参数值，局部变量和方法返回值等。每当一个函数被调用时，该函数的返回类型和一些调用的信息被存储到栈顶，调用结束后调用信息会被弹出弹出并释放掉内存。栈区是从高地址位向低地址位增长的，是一块连续的内在区域，最大容量是由系统预先定义好的，申请的栈空间超过这个界限时会提示溢出，用户能从栈中获取的空间较小。
- 运行时堆：用于存放进程运行中被动态分配的内存段，位于 BSS 和栈中间的地址位。由卡发人员申请分配（malloc）和释放（free）。堆是从低地址位向高地址位增长，采用链式存储结构。频繁地 malloc/free 造成内存空间的不连续，产生大量碎片。当申请堆空间时，库函数按照一定的算法搜索可用的足够大的空间。因此堆的效率比栈要低的多。
- 代码段：存放 CPU 可以执行的机器指令，该部分内存只能读不能写。通常代码区是共享的，即其它执行程序可调用它。假如机器中有数个进程运行相同的一个程序，那么它们就可以使用同一个代码段。
- 未初始化的数据段：存放未初始化的全局变量，BSS 的数据在程序开始执行之前被初始化为 0 或 NULL。
- 已初始化的数据段：存放已初始化的全局变量，包括静态全局变量、静态局部变量以及常量。
- 内存映射区域：例如将动态库，共享内存等虚拟空间的内存映射到物理空间的内存，一般是 mmap 函数所分配的虚拟内存空间。

### 3. Linux的内部层级结构

内核态可以执行任意命令，调用系统的一切资源，而用户态只能执行简单的运算，不能直接调用系统资源。用户态必须通过系统接口（System Call），才能向内核发出指令。比如，当用户进程启动一个 bash 时，它会通过 getpid() 对内核的 pid 服务发起系统调用，获取当前用户进程的 ID；当用户进程通过 cat 命令查看主机配置时，它会对内核的文件子系统发起系统调用。

![img](./20230319-linux-io-zero-copy-java.assets/v2-dc2c96fd298e9057b5a562fd19b291cc_1440w.jpeg)

- 内核空间可以访问所有的 CPU 指令和所有的内存空间、I/O 空间和硬件设备。
- 用户空间只能访问受限的资源，如果需要特殊权限，可以通过系统调用获取相应的资源。
- 用户空间允许页面中断，而内核空间则不允许。
- 内核空间和用户空间是针对线性地址空间的。
- x86 CPU中用户空间是 0 - 3G 的地址范围，内核空间是 3G - 4G 的地址范围。x86_64 CPU 用户空间地址范围为0x0000000000000000 – 0x00007fffffffffff，内核地址空间为 0xffff880000000000 - 最大地址。
- 所有内核进程（线程）共用一个地址空间，而用户进程都有各自的地址空间。

有了用户空间和内核空间的划分后，Linux 内部层级结构可以分为三部分，从最底层到最上层依次是硬件、内核空间和用户空间，如下图所示：

![img](./20230319-linux-io-zero-copy-java.assets/v2-b10efde815cca738ced49359c5bd0dec_1440w.webp)

### 4. Linux I/O读写方式

Linux 提供了轮询、I/O 中断以及 DMA 传输这 3 种磁盘与主存之间的数据传输机制。其中轮询方式是基于死循环对 I/O 端口进行不断检测。I/O 中断方式是指当数据到达时，磁盘主动向 CPU 发起中断请求，由 CPU 自身负责数据的传输过程。 DMA 传输则在 I/O 中断的基础上引入了 DMA 磁盘控制器，由 DMA 磁盘控制器负责数据的传输，降低了 I/O 中断操作对 CPU 资源的大量消耗。

### 4.1. I/O中断原理

在 DMA 技术出现之前，应用程序与磁盘之间的 I/O 操作都是通过 CPU 的中断完成的。每次用户进程读取磁盘数据时，都需要 CPU 中断，然后发起 I/O 请求等待数据读取和拷贝完成，每次的 I/O 中断都导致 CPU 的上下文切换。

![img](./20230319-linux-io-zero-copy-java.assets/v2-0b46e37f599e0855925a39201add483a_1440w.webp)

1. 用户进程向 CPU 发起 read 系统调用读取数据，由用户态切换为内核态，然后一直阻塞等待数据的返回。
2. CPU 在接收到指令以后对磁盘发起 I/O 请求，将磁盘数据先放入磁盘控制器缓冲区。
3. 数据准备完成以后，磁盘向 CPU 发起 I/O 中断。
4. CPU 收到 I/O 中断以后将磁盘缓冲区中的数据拷贝到内核缓冲区，然后再从内核缓冲区拷贝到用户缓冲区。
5. 用户进程由内核态切换回用户态，解除阻塞状态，然后等待 CPU 的下一个执行时间钟。

### 4.2. DMA传输原理

DMA 的全称叫直接内存存取（Direct Memory Access），是一种允许外围设备（硬件子系统）直接访问系统主内存的机制。也就是说，基于 DMA 访问方式，系统主内存于硬盘或网卡之间的数据传输可以绕开 CPU 的全程调度。目前大多数的硬件设备，包括磁盘控制器、网卡、显卡以及声卡等都支持 DMA 技术。

![img](./20230319-linux-io-zero-copy-java.assets/v2-fe93324d8dc895963e00b16466e56a55_1440w.webp)

整个数据传输操作在一个 DMA 控制器的控制下进行的。CPU 除了在数据传输开始和结束时做一点处理外（开始和结束时候要做中断处理），在传输过程中 CPU 可以继续进行其他的工作。这样在大部分时间里，CPU 计算和 I/O 操作都处于并行操作，使整个计算机系统的效率大大提高。

![img](./20230319-linux-io-zero-copy-java.assets/v2-8894982f1c09259e2959acddc9f095e7_1440w.webp)

有了 DMA 磁盘控制器接管数据读写请求以后，CPU 从繁重的 I/O 操作中解脱，数据读取操作的流程如下：

1. 用户进程向 CPU 发起 read 系统调用读取数据，由用户态切换为内核态，然后一直阻塞等待数据的返回。
2. CPU 在接收到指令以后对 DMA 磁盘控制器发起调度指令。
3. DMA 磁盘控制器对磁盘发起 I/O 请求，将磁盘数据先放入磁盘控制器缓冲区，CPU 全程不参与此过程。
4. 数据读取完成后，DMA 磁盘控制器会接受到磁盘的通知，将数据从磁盘控制器缓冲区拷贝到内核缓冲区。
5. DMA 磁盘控制器向 CPU 发出数据读完的信号，由 CPU 负责将数据从内核缓冲区拷贝到用户缓冲区。
6. 用户进程由内核态切换回用户态，解除阻塞状态，然后等待 CPU 的下一个执行时间钟。

### 5. 传统I/O方式

为了更好的理解零拷贝解决的问题，我们首先了解一下传统 I/O 方式存在的问题。在 Linux 系统中，传统的访问方式是通过 write() 和 read() 两个系统调用实现的，通过 read() 函数读取文件到到缓存区中，然后通过 write() 方法把缓存中的数据输出到网络端口，伪代码如下：

```cpp
read(file_fd, tmp_buf, len);
write(socket_fd, tmp_buf, len);
```

下图分别对应传统 I/O 操作的数据读写流程，整个过程涉及 2 次 CPU 拷贝、2 次 DMA 拷贝总共 4 次拷贝，以及 4 次上下文切换，下面简单地阐述一下相关的概念。

![img](./20230319-linux-io-zero-copy-java.assets/v2-18e66cbb4e06d1f13e4335898c7b8e8c_1440w.jpeg)

- 上下文切换：当用户程序向内核发起系统调用时，CPU 将用户进程从用户态切换到内核态；当系统调用返回时，CPU 将用户进程从内核态切换回用户态。
- CPU拷贝：由 CPU 直接处理数据的传送，数据拷贝时会一直占用 CPU 的资源。
- DMA拷贝：由 CPU 向DMA磁盘控制器下达指令，让 DMA 控制器来处理数据的传送，数据传送完毕再把信息反馈给 CPU，从而减轻了 CPU 资源的占有率。

### 5.1. 传统读操作

当应用程序执行 read 系统调用读取一块数据的时候，如果这块数据已经存在于用户进程的页内存中，就直接从内存中读取数据；如果数据不存在，则先将数据从磁盘加载数据到内核空间的读缓存（read buffer）中，再从读缓存拷贝到用户进程的页内存中。

```cpp
read(file_fd, tmp_buf, len);
```

基于传统的 I/O 读取方式，read 系统调用会触发 2 次上下文切换，1 次 DMA 拷贝和 1 次 CPU 拷贝，发起数据读取的流程如下：

1. 用户进程通过 read() 函数向内核（kernel）发起系统调用，上下文从用户态（user space）切换为内核态（kernel space）。
2. CPU利用DMA控制器将数据从主存或硬盘拷贝到内核空间（kernel space）的读缓冲区（read buffer）。
3. CPU将读缓冲区（read buffer）中的数据拷贝到用户空间（user space）的用户缓冲区（user buffer）。
4. 上下文从内核态（kernel space）切换回用户态（user space），read 调用执行返回。

### 5.2. 传统写操作

当应用程序准备好数据，执行 write 系统调用发送网络数据时，先将数据从用户空间的页缓存拷贝到内核空间的网络缓冲区（socket buffer）中，然后再将写缓存中的数据拷贝到网卡设备完成数据发送。

```cpp
write(socket_fd, tmp_buf, len);
```

基于传统的 I/O 写入方式，write() 系统调用会触发 2 次上下文切换，1 次 CPU 拷贝和 1 次 DMA 拷贝，用户程序发送网络数据的流程如下：

1. 用户进程通过 write() 函数向内核（kernel）发起系统调用，上下文从用户态（user space）切换为内核态（kernel space）。
2. CPU 将用户缓冲区（user buffer）中的数据拷贝到内核空间（kernel space）的网络缓冲区（socket buffer）。
3. CPU 利用 DMA 控制器将数据从网络缓冲区（socket buffer）拷贝到网卡进行数据传输。
4. 上下文从内核态（kernel space）切换回用户态（user space），write 系统调用执行返回。

### 6. 零拷贝方式

在 Linux 中零拷贝技术主要有 3 个实现思路：用户态直接 I/O、减少数据拷贝次数以及写时复制技术。

- 用户态直接 I/O：应用程序可以直接访问硬件存储，操作系统内核只是辅助数据传输。这种方式依旧存在用户空间和内核空间的上下文切换，硬件上的数据直接拷贝至了用户空间，不经过内核空间。因此，直接 I/O 不存在内核空间缓冲区和用户空间缓冲区之间的数据拷贝。
- 减少数据拷贝次数：在数据传输过程中，避免数据在用户空间缓冲区和系统内核空间缓冲区之间的CPU拷贝，以及数据在系统内核空间内的CPU拷贝，这也是当前主流零拷贝技术的实现思路。
- 写时复制技术：写时复制指的是当多个进程共享同一块数据时，如果其中一个进程需要对这份数据进行修改，那么将其拷贝到自己的进程地址空间中，如果只是数据读取操作则不需要进行拷贝操作。

### 6.1. 用户态直接I/O

用户态直接 I/O 使得应用进程或运行在用户态（user space）下的库函数直接访问硬件设备，数据直接跨过内核进行传输，内核在数据传输过程除了进行必要的虚拟存储配置工作之外，不参与任何其他工作，这种方式能够直接绕过内核，极大提高了性能。

![img](./20230319-linux-io-zero-copy-java.assets/v2-4cb0f465ebeb7ff0f5e31e8d3f790c80_1440w.jpeg)

用户态直接 I/O 只能适用于不需要内核缓冲区处理的应用程序，这些应用程序通常在进程地址空间有自己的数据缓存机制，称为自缓存应用程序，如数据库管理系统就是一个代表。其次，这种零拷贝机制会直接操作磁盘 I/O，由于 CPU 和磁盘 I/O 之间的执行时间差距，会造成大量资源的浪费，解决方案是配合异步 I/O 使用。

### 6.2. mmap + write

一种零拷贝方式是使用 mmap + write 代替原来的 read + write 方式，减少了 1 次 CPU 拷贝操作。mmap 是 Linux 提供的一种内存映射文件方法，即将一个进程的地址空间中的一段虚拟地址映射到磁盘文件地址，mmap + write 的伪代码如下：

```cpp
tmp_buf = mmap(file_fd, len);
write(socket_fd, tmp_buf, len);
```

使用 mmap 的目的是将内核中读缓冲区（read buffer）的地址与用户空间的缓冲区（user buffer）进行映射，从而实现内核缓冲区与应用程序内存的共享，省去了将数据从内核读缓冲区（read buffer）拷贝到用户缓冲区（user buffer）的过程，然而内核读缓冲区（read buffer）仍需将数据到内核写缓冲区（socket buffer），大致的流程如下图所示：

![img](./20230319-linux-io-zero-copy-java.assets/v2-28463616753963ac9f189ce23a485e2d_1440w.jpeg)

基于 mmap + write 系统调用的零拷贝方式，整个拷贝过程会发生 4 次上下文切换，1 次 CPU 拷贝和 2 次 DMA 拷贝，用户程序读写数据的流程如下：

1. 用户进程通过 mmap() 函数向内核（kernel）发起系统调用，上下文从用户态（user space）切换为内核态（kernel space）。
2. 将用户进程的内核空间的读缓冲区（read buffer）与用户空间的缓存区（user buffer）进行内存地址映射。
3. CPU利用DMA控制器将数据从主存或硬盘拷贝到内核空间（kernel space）的读缓冲区（read buffer）。
4. 上下文从内核态（kernel space）切换回用户态（user space），mmap 系统调用执行返回。
5. 用户进程通过 write() 函数向内核（kernel）发起系统调用，上下文从用户态（user space）切换为内核态（kernel space）。
6. CPU将读缓冲区（read buffer）中的数据拷贝到的网络缓冲区（socket buffer）。
7. CPU利用DMA控制器将数据从网络缓冲区（socket buffer）拷贝到网卡进行数据传输。
8. 上下文从内核态（kernel space）切换回用户态（user space），write 系统调用执行返回。

mmap 主要的用处是提高 I/O 性能，特别是针对大文件。对于小文件，内存映射文件反而会导致碎片空间的浪费，因为内存映射总是要对齐页边界，最小单位是 4 KB，一个 5 KB 的文件将会映射占用 8 KB 内存，也就会浪费 3 KB 内存。

mmap 的拷贝虽然减少了 1 次拷贝，提升了效率，但也存在一些隐藏的问题。当 mmap 一个文件时，如果这个文件被另一个进程所截获，那么 write 系统调用会因为访问非法地址被 SIGBUS 信号终止，SIGBUS 默认会杀死进程并产生一个 coredump，服务器可能因此被终止。

### 6.3. sendfile

sendfile 系统调用在 Linux 内核版本 2.1 中被引入，目的是简化通过网络在两个通道之间进行的数据传输过程。sendfile 系统调用的引入，不仅减少了 CPU 拷贝的次数，还减少了上下文切换的次数，它的伪代码如下：

```cpp
sendfile(socket_fd, file_fd, len);
```

通过 sendfile 系统调用，数据可以直接在内核空间内部进行 I/O 传输，从而省去了数据在用户空间和内核空间之间的来回拷贝。与 mmap 内存映射方式不同的是， sendfile 调用中 I/O 数据对用户空间是完全不可见的。也就是说，这是一次完全意义上的数据传输过程。

![img](./20230319-linux-io-zero-copy-java.assets/v2-48132735369375701f3d8ac1d6029c2a_1440w.jpeg)

基于 sendfile 系统调用的零拷贝方式，整个拷贝过程会发生 2 次上下文切换，1 次 CPU 拷贝和 2 次 DMA 拷贝，用户程序读写数据的流程如下：

1. 用户进程通过 sendfile() 函数向内核（kernel）发起系统调用，上下文从用户态（user space）切换为内核态（kernel space）。
2. CPU 利用 DMA 控制器将数据从主存或硬盘拷贝到内核空间（kernel space）的读缓冲区（read buffer）。
3. CPU 将读缓冲区（read buffer）中的数据拷贝到的网络缓冲区（socket buffer）。
4. CPU 利用 DMA 控制器将数据从网络缓冲区（socket buffer）拷贝到网卡进行数据传输。
5. 上下文从内核态（kernel space）切换回用户态（user space），sendfile 系统调用执行返回。

相比较于 mmap 内存映射的方式，sendfile 少了 2 次上下文切换，但是仍然有 1 次 CPU 拷贝操作。sendfile 存在的问题是用户程序不能对数据进行修改，而只是单纯地完成了一次数据传输过程。

### 6.4. sendfile + DMA gather copy

Linux 2.4 版本的内核对 sendfile 系统调用进行修改，为 DMA 拷贝引入了 gather 操作。它将内核空间（kernel space）的读缓冲区（read buffer）中对应的数据描述信息（内存地址、地址偏移量）记录到相应的网络缓冲区（ socket buffer）中，由 DMA 根据内存地址、地址偏移量将数据批量地从读缓冲区（read buffer）拷贝到网卡设备中，这样就省去了内核空间中仅剩的 1 次 CPU 拷贝操作，sendfile 的伪代码如下：

```cpp
sendfile(socket_fd, file_fd, len);
```

在硬件的支持下，sendfile 拷贝方式不再从内核缓冲区的数据拷贝到 socket 缓冲区，取而代之的仅仅是缓冲区文件描述符和数据长度的拷贝，这样 DMA 引擎直接利用 gather 操作将页缓存中数据打包发送到网络中即可，本质就是和虚拟内存映射的思路类似。

![img](./20230319-linux-io-zero-copy-java.assets/v2-15edf2971101883e2a90253225a3b0d3_1440w.jpeg)

基于 sendfile + DMA gather copy 系统调用的零拷贝方式，整个拷贝过程会发生 2 次上下文切换、0 次 CPU 拷贝以及 2 次 DMA 拷贝，用户程序读写数据的流程如下：

1. 用户进程通过 sendfile() 函数向内核（kernel）发起系统调用，上下文从用户态（user space）切换为内核态（kernel space）。
2. CPU 利用 DMA 控制器将数据从主存或硬盘拷贝到内核空间（kernel space）的读缓冲区（read buffer）。
3. CPU 把读缓冲区（read buffer）的文件描述符（file descriptor）和数据长度拷贝到网络缓冲区（socket buffer）。
4. 基于已拷贝的文件描述符（file descriptor）和数据长度，CPU 利用 DMA 控制器的 gather/scatter 操作直接批量地将数据从内核的读缓冲区（read buffer）拷贝到网卡进行数据传输。
5. 上下文从内核态（kernel space）切换回用户态（user space），sendfile 系统调用执行返回。

sendfile + DMA gather copy 拷贝方式同样存在用户程序不能对数据进行修改的问题，而且本身需要硬件的支持，它只适用于将数据从文件拷贝到 socket 套接字上的传输过程。

### 6.5. splice

sendfile 只适用于将数据从文件拷贝到 socket 套接字上，同时需要硬件的支持，这也限定了它的使用范围。Linux 在 2.6.17 版本引入 splice 系统调用，不仅不需要硬件支持，还实现了两个文件描述符之间的数据零拷贝。splice 的伪代码如下：

```cpp
splice(fd_in, off_in, fd_out, off_out, len, flags);
```

splice 系统调用可以在内核空间的读缓冲区（read buffer）和网络缓冲区（socket buffer）之间建立管道（pipeline），从而避免了两者之间的 CPU 拷贝操作。

![img](./20230319-linux-io-zero-copy-java.assets/v2-37cf7a8b129183c24c7b524d3fee1a29_1440w.jpeg)

基于 splice 系统调用的零拷贝方式，整个拷贝过程会发生 2 次上下文切换，0 次 CPU 拷贝以及 2 次 DMA 拷贝，用户程序读写数据的流程如下：

1. 用户进程通过 splice() 函数向内核（kernel）发起系统调用，上下文从用户态（user space）切换为内核态（kernel space）。
2. CPU 利用 DMA 控制器将数据从主存或硬盘拷贝到内核空间（kernel space）的读缓冲区（read buffer）。
3. CPU 在内核空间的读缓冲区（read buffer）和网络缓冲区（socket buffer）之间建立管道（pipeline）。
4. CPU 利用 DMA 控制器将数据从网络缓冲区（socket buffer）拷贝到网卡进行数据传输。
5. 上下文从内核态（kernel space）切换回用户态（user space），splice 系统调用执行返回。

splice 拷贝方式也同样存在用户程序不能对数据进行修改的问题。除此之外，它使用了 Linux 的管道缓冲机制，可以用于任意两个文件描述符中传输数据，但是它的两个文件描述符参数中有一个必须是管道设备。

### 6.6. 写时复制

在某些情况下，内核缓冲区可能被多个进程所共享，如果某个进程想要这个共享区进行 write 操作，由于 write 不提供任何的锁操作，那么就会对共享区中的数据造成破坏，写时复制的引入就是 Linux 用来保护数据的。

写时复制指的是当多个进程共享同一块数据时，如果其中一个进程需要对这份数据进行修改，那么就需要将其拷贝到自己的进程地址空间中。这样做并不影响其他进程对这块数据的操作，每个进程要修改的时候才会进行拷贝，所以叫写时拷贝。这种方法在某种程度上能够降低系统开销，如果某个进程永远不会对所访问的数据进行更改，那么也就永远不需要拷贝。

### 6.7. 缓冲区共享

缓冲区共享方式完全改写了传统的 I/O 操作，因为传统 I/O 接口都是基于数据拷贝进行的，要避免拷贝就得去掉原先的那套接口并重新改写，所以这种方法是比较全面的零拷贝技术，目前比较成熟的一个方案是在 Solaris 上实现的 fbuf（Fast Buffer，快速缓冲区）。

fbuf 的思想是每个进程都维护着一个缓冲区池，这个缓冲区池能被同时映射到用户空间（user space）和内核态（kernel space），内核和用户共享这个缓冲区池，这样就避免了一系列的拷贝操作。

![img](./20230319-linux-io-zero-copy-java.assets/v2-939270196a39a141cd89d0b3ca827275_1440w.webp)

缓冲区共享的难度在于管理共享缓冲区池需要应用程序、网络软件以及设备驱动程序之间的紧密合作，而且如何改写 API 目前还处于试验阶段并不成熟。

### 7. Linux零拷贝对比

无论是传统 I/O 拷贝方式还是引入零拷贝的方式，2 次 DMA Copy 是都少不了的，因为两次 DMA 都是依赖硬件完成的。下面从 CPU 拷贝次数、DMA 拷贝次数以及系统调用几个方面总结一下上述几种 I/O 拷贝方式的差别。

![img](./20230319-linux-io-zero-copy-java.assets/v2-a728f1a35f62ba608c7eef7c43478edc_1440w.webp)

### 8. Java NIO零拷贝实现

在 Java NIO 中的通道（Channel）就相当于操作系统的内核空间（kernel space）的缓冲区，而缓冲区（Buffer）对应的相当于操作系统的用户空间（user space）中的用户缓冲区（user buffer）。

- 通道（Channel）是全双工的（双向传输），它既可能是读缓冲区（read buffer），也可能是网络缓冲区（socket buffer）。
- 缓冲区（Buffer）分为堆内存（HeapBuffer）和堆外内存（DirectBuffer），这是通过 malloc() 分配出来的用户态内存。

堆外内存（DirectBuffer）在使用后需要应用程序手动回收，而堆内存（HeapBuffer）的数据在 GC 时可能会被自动回收。因此，在使用 HeapBuffer 读写数据时，为了避免缓冲区数据因为 GC 而丢失，NIO 会先把 HeapBuffer 内部的数据拷贝到一个临时的 DirectBuffer 中的本地内存（native memory），这个拷贝涉及到 sun.misc.Unsafe.copyMemory() 的调用，背后的实现原理与 memcpy() 类似。 最后，将临时生成的 DirectBuffer 内部的数据的内存地址传给 I/O 调用函数，这样就避免了再去访问 Java 对象处理 I/O 读写。

### 8.1. MappedByteBuffer

MappedByteBuffer 是 NIO 基于内存映射（mmap）这种零拷贝方式的提供的一种实现，它继承自 ByteBuffer。FileChannel 定义了一个 map() 方法，它可以把一个文件从 position 位置开始的 size 大小的区域映射为内存映像文件。抽象方法 map() 方法在 FileChannel 中的定义如下：

```java
public abstract MappedByteBuffer map(MapMode mode, long position, long size)
        throws IOException;
```

- mode：限定内存映射区域（MappedByteBuffer）对内存映像文件的访问模式，包括只可读（READ_ONLY）、可读可写（READ_WRITE）和写时拷贝（PRIVATE）三种模式。
- position：文件映射的起始地址，对应内存映射区域（MappedByteBuffer）的首地址。
- size：文件映射的字节长度，从 position 往后的字节数，对应内存映射区域（MappedByteBuffer）的大小。

MappedByteBuffer 相比 ByteBuffer 新增了 fore()、load() 和 isLoad() 三个重要的方法：

- fore()：对于处于 READ_WRITE 模式下的缓冲区，把对缓冲区内容的修改强制刷新到本地文件。
- load()：将缓冲区的内容载入物理内存中，并返回这个缓冲区的引用。
- isLoaded()：如果缓冲区的内容在物理内存中，则返回 true，否则返回 false。

下面给出一个利用 MappedByteBuffer 对文件进行读写的使用示例：

```java
private final static String CONTENT = "Zero copy implemented by MappedByteBuffer";
private final static String FILE_NAME = "/mmap.txt";
private final static String CHARSET = "UTF-8";
```

- 写文件数据：打开文件通道 fileChannel 并提供读权限、写权限和数据清空权限，通过 fileChannel 映射到一个可写的内存缓冲区 mappedByteBuffer，将目标数据写入 mappedByteBuffer，通过 force() 方法把缓冲区更改的内容强制写入本地文件。

```java
@Test
public void writeToFileByMappedByteBuffer() {
    Path path = Paths.get(getClass().getResource(FILE_NAME).getPath());
    byte[] bytes = CONTENT.getBytes(Charset.forName(CHARSET));
    try (FileChannel fileChannel = FileChannel.open(path, StandardOpenOption.READ,
            StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
        MappedByteBuffer mappedByteBuffer = fileChannel.map(READ_WRITE, 0, bytes.length);
        if (mappedByteBuffer != null) {
            mappedByteBuffer.put(bytes);
            mappedByteBuffer.force();
        }
    } catch (IOException e) {
        e.printStackTrace();
    }
}
```

- 读文件数据：打开文件通道 fileChannel 并提供只读权限，通过 fileChannel 映射到一个只可读的内存缓冲区 mappedByteBuffer，读取 mappedByteBuffer 中的字节数组即可得到文件数据。

```java
@Test
public void readFromFileByMappedByteBuffer() {
    Path path = Paths.get(getClass().getResource(FILE_NAME).getPath());
    int length = CONTENT.getBytes(Charset.forName(CHARSET)).length;
    try (FileChannel fileChannel = FileChannel.open(path, StandardOpenOption.READ)) {
        MappedByteBuffer mappedByteBuffer = fileChannel.map(READ_ONLY, 0, length);
        if (mappedByteBuffer != null) {
            byte[] bytes = new byte[length];
            mappedByteBuffer.get(bytes);
            String content = new String(bytes, StandardCharsets.UTF_8);
            assertEquals(content, "Zero copy implemented by MappedByteBuffer");
        }
    } catch (IOException e) {
        e.printStackTrace();
    }
}
```

下面介绍 map() 方法的底层实现原理。map() 方法是 java.nio.channels.FileChannel 的抽象方法，由子类 sun.nio.ch.FileChannelImpl.java 实现，下面是和内存映射相关的核心代码：

```java
public MappedByteBuffer map(MapMode mode, long position, long size) throws IOException {
    int pagePosition = (int)(position % allocationGranularity);
    long mapPosition = position - pagePosition;
    long mapSize = size + pagePosition;
    try {
        addr = map0(imode, mapPosition, mapSize);
    } catch (OutOfMemoryError x) {
        System.gc();
        try {
            Thread.sleep(100);
        } catch (InterruptedException y) {
            Thread.currentThread().interrupt();
        }
        try {
            addr = map0(imode, mapPosition, mapSize);
        } catch (OutOfMemoryError y) {
            throw new IOException("Map failed", y);
        }
    }

    int isize = (int)size;
    Unmapper um = new Unmapper(addr, mapSize, isize, mfd);
    if ((!writable) || (imode == MAP_RO)) {
        return Util.newMappedByteBufferR(isize, addr + pagePosition, mfd, um);
    } else {
        return Util.newMappedByteBuffer(isize, addr + pagePosition, mfd, um);
    }
}
```

map() 方法通过本地方法 map0() 为文件分配一块虚拟内存，作为它的内存映射区域，然后返回这块内存映射区域的起始地址。

1. 文件映射需要在 Java 堆中创建一个 MappedByteBuffer 的实例。如果第一次文件映射导致 OOM，则手动触发垃圾回收，休眠 100ms 后再尝试映射，如果失败则抛出异常。
2. 通过 Util 的 newMappedByteBuffer （可读可写）方法或者 newMappedByteBufferR（仅读） 方法方法反射创建一个 DirectByteBuffer 实例，其中 DirectByteBuffer 是 MappedByteBuffer 的子类。

map() 方法返回的是内存映射区域的起始地址，通过（起始地址 + 偏移量）就可以获取指定内存的数据。这样一定程度上替代了 read() 或 write() 方法，底层直接采用 sun.misc.Unsafe 类的 getByte() 和 putByte() 方法对数据进行读写。

```java
private native long map0(int prot, long position, long mapSize) throws IOException;
```

上面是本地方法（native method）map0 的定义，它通过 JNI（Java Native Interface）调用底层 C 的实现，这个 native 函数（Java_sun_nio_ch_FileChannelImpl_map0）的实现位于 JDK 源码包下的 native/sun/nio/ch/FileChannelImpl.c 这个源文件里面。

```c
JNIEXPORT jlong JNICALL
Java_sun_nio_ch_FileChannelImpl_map0(JNIEnv *env, jobject this,
                                     jint prot, jlong off, jlong len)
{
    void *mapAddress = 0;
    jobject fdo = (*env)->GetObjectField(env, this, chan_fd);
    jint fd = fdval(env, fdo);
    int protections = 0;
    int flags = 0;

    if (prot == sun_nio_ch_FileChannelImpl_MAP_RO) {
        protections = PROT_READ;
        flags = MAP_SHARED;
    } else if (prot == sun_nio_ch_FileChannelImpl_MAP_RW) {
        protections = PROT_WRITE | PROT_READ;
        flags = MAP_SHARED;
    } else if (prot == sun_nio_ch_FileChannelImpl_MAP_PV) {
        protections =  PROT_WRITE | PROT_READ;
        flags = MAP_PRIVATE;
    }

    mapAddress = mmap64(
        0,                    /* Let OS decide location */
        len,                  /* Number of bytes to map */
        protections,          /* File permissions */
        flags,                /* Changes are shared */
        fd,                   /* File descriptor of mapped file */
        off);                 /* Offset into file */

    if (mapAddress == MAP_FAILED) {
        if (errno == ENOMEM) {
            JNU_ThrowOutOfMemoryError(env, "Map failed");
            return IOS_THROWN;
        }
        return handle(env, -1, "Map failed");
    }

    return ((jlong) (unsigned long) mapAddress);
}
```

可以看出 map0() 函数最终是通过 mmap64() 这个函数对 Linux 底层内核发出内存映射的调用， mmap64() 函数的原型如下：

```c
#include <sys/mman.h>

void *mmap64(void *addr, size_t len, int prot, int flags, int fd, off64_t offset);
```

下面详细介绍一下 mmap64() 函数各个参数的含义以及参数可选值：

- addr：文件在用户进程空间的内存映射区中的起始地址，是一个建议的参数，通常可设置为 0 或 NULL，此时由内核去决定真实的起始地址。当 flags 为 MAP_FIXED 时，addr 就是一个必选的参数，即需要提供一个存在的地址。
- len：文件需要进行内存映射的字节长度
- prot：控制用户进程对内存映射区的访问权限
- PROT_READ：读权限
- PROT_WRITE：写权限
- PROT_EXEC：执行权限
- PROT_NONE：无权限
- flags：控制内存映射区的修改是否被多个进程共享
- MAP_PRIVATE：对内存映射区数据的修改不会反映到真正的文件，数据修改发生时采用写时复制机制
- MAP_SHARED：对内存映射区的修改会同步到真正的文件，修改对共享此内存映射区的进程是可见的
- MAP_FIXED：不建议使用，这种模式下 addr 参数指定的必须的提供一个存在的 addr 参数
- fd：文件描述符。每次 map 操作会导致文件的引用计数加 1，每次 unmap 操作或者结束进程会导致引用计数减 1
- offset：文件偏移量。进行映射的文件位置，从文件起始地址向后的位移量

下面总结一下 MappedByteBuffer 的特点和不足之处：

- MappedByteBuffer 使用是堆外的虚拟内存，因此分配（map）的内存大小不受 JVM 的 -Xmx 参数限制，但是也是有大小限制的。
- 如果当文件超出 Integer.MAX_VALUE 字节限制时，可以通过 position 参数重新 map 文件后面的内容。
- MappedByteBuffer 在处理大文件时性能的确很高，但也存内存占用、文件关闭不确定等问题，被其打开的文件只有在垃圾回收的才会被关闭，而且这个时间点是不确定的。
- MappedByteBuffer 提供了文件映射内存的 mmap() 方法，也提供了释放映射内存的 unmap() 方法。然而 unmap() 是 FileChannelImpl 中的私有方法，无法直接显示调用。因此，用户程序需要通过 Java 反射的调用 sun.misc.Cleaner 类的 clean() 方法手动释放映射占用的内存区域。

```java
public static void clean(final Object buffer) throws Exception {
    AccessController.doPrivileged((PrivilegedAction<Void>) () -> {
        try {
            Method getCleanerMethod = buffer.getClass().getMethod("cleaner", new Class[0]);
            getCleanerMethod.setAccessible(true);
            Cleaner cleaner = (Cleaner) getCleanerMethod.invoke(buffer, new Object[0]);
            cleaner.clean();
        } catch(Exception e) {
            e.printStackTrace();
        }
    });
}
```

### 8.2. DirectByteBuffer

DirectByteBuffer 的对象引用位于 Java 内存模型的堆里面，JVM 可以对 DirectByteBuffer 的对象进行内存分配和回收管理，一般使用 DirectByteBuffer 的静态方法 allocateDirect() 创建 DirectByteBuffer 实例并分配内存。

```java
public static ByteBuffer allocateDirect(int capacity) {
    return new DirectByteBuffer(capacity);
}
```

DirectByteBuffer 内部的字节缓冲区位在于堆外的（用户态）直接内存，它是通过 Unsafe 的本地方法 allocateMemory() 进行内存分配，底层调用的是操作系统的 malloc() 函数。

```java
DirectByteBuffer(int cap) {
    super(-1, 0, cap, cap);
    boolean pa = VM.isDirectMemoryPageAligned();
    int ps = Bits.pageSize();
    long size = Math.max(1L, (long)cap + (pa ? ps : 0));
    Bits.reserveMemory(size, cap);

    long base = 0;
    try {
        base = unsafe.allocateMemory(size);
    } catch (OutOfMemoryError x) {
        Bits.unreserveMemory(size, cap);
        throw x;
    }
    unsafe.setMemory(base, size, (byte) 0);
    if (pa && (base % ps != 0)) {
        address = base + ps - (base & (ps - 1));
    } else {
        address = base;
    }
    cleaner = Cleaner.create(this, new Deallocator(base, size, cap));
    att = null;
}
```

除此之外，初始化 DirectByteBuffer 时还会创建一个 Deallocator 线程，并通过 Cleaner 的 freeMemory() 方法来对直接内存进行回收操作，freeMemory() 底层调用的是操作系统的 free() 函数。

```java
private static class Deallocator implements Runnable {
    private static Unsafe unsafe = Unsafe.getUnsafe();

    private long address;
    private long size;
    private int capacity;

    private Deallocator(long address, long size, int capacity) {
        assert (address != 0);
        this.address = address;
        this.size = size;
        this.capacity = capacity;
    }

    public void run() {
        if (address == 0) {
            return;
        }
        unsafe.freeMemory(address);
        address = 0;
        Bits.unreserveMemory(size, capacity);
    }
}
```

由于使用 DirectByteBuffer 分配的是系统本地的内存，不在 JVM 的管控范围之内，因此直接内存的回收和堆内存的回收不同，直接内存如果使用不当，很容易造成 OutOfMemoryError。

说了这么多，那么 DirectByteBuffer 和零拷贝有什么关系？前面有提到在 MappedByteBuffer 进行内存映射时，它的 map() 方法会通过 Util.newMappedByteBuffer() 来创建一个缓冲区实例，初始化的代码如下：

```java
static MappedByteBuffer newMappedByteBuffer(int size, long addr, FileDescriptor fd,
                                            Runnable unmapper) {
    MappedByteBuffer dbb;
    if (directByteBufferConstructor == null)
        initDBBConstructor();
    try {
        dbb = (MappedByteBuffer)directByteBufferConstructor.newInstance(
            new Object[] { new Integer(size), new Long(addr), fd, unmapper });
    } catch (InstantiationException | IllegalAccessException | InvocationTargetException e) {
        throw new InternalError(e);
    }
    return dbb;
}

private static void initDBBRConstructor() {
    AccessController.doPrivileged(new PrivilegedAction<Void>() {
        public Void run() {
            try {
                Class<?> cl = Class.forName("java.nio.DirectByteBufferR");
                Constructor<?> ctor = cl.getDeclaredConstructor(
                    new Class<?>[] { int.class, long.class, FileDescriptor.class,
                                    Runnable.class });
                ctor.setAccessible(true);
                directByteBufferRConstructor = ctor;
            } catch (ClassNotFoundException | NoSuchMethodException |
                     IllegalArgumentException | ClassCastException x) {
                throw new InternalError(x);
            }
            return null;
        }});
}
```

DirectByteBuffer 是 MappedByteBuffer 的具体实现类。实际上，Util.newMappedByteBuffer() 方法通过反射机制获取 DirectByteBuffer 的构造器，然后创建一个 DirectByteBuffer 的实例，对应的是一个单独用于内存映射的构造方法：

```java
protected DirectByteBuffer(int cap, long addr, FileDescriptor fd, Runnable unmapper) {
    super(-1, 0, cap, cap, fd);
    address = addr;
    cleaner = Cleaner.create(this, unmapper);
    att = null;
}
```

因此，除了允许分配操作系统的直接内存以外，DirectByteBuffer 本身也具有文件内存映射的功能，这里不做过多说明。我们需要关注的是，DirectByteBuffer 在 MappedByteBuffer 的基础上提供了内存映像文件的随机读取 get() 和写入 write() 的操作。

- 内存映像文件的随机读操作

```java
public byte get() {
    return ((unsafe.getByte(ix(nextGetIndex()))));
}

public byte get(int i) {
    return ((unsafe.getByte(ix(checkIndex(i)))));
}
```

- 内存映像文件的随机写操作

```java
public ByteBuffer put(byte x) {
    unsafe.putByte(ix(nextPutIndex()), ((x)));
    return this;
}

public ByteBuffer put(int i, byte x) {
    unsafe.putByte(ix(checkIndex(i)), ((x)));
    return this;
}
```

内存映像文件的随机读写都是借助 ix() 方法实现定位的， ix() 方法通过内存映射空间的内存首地址（address）和给定偏移量 i 计算出指针地址，然后由 unsafe 类的 get() 和 put() 方法和对指针指向的数据进行读取或写入。

```java
private long ix(int i) {
    return address + ((long)i << 0);
}
```

### 8.3. FileChannel

FileChannel 是一个用于文件读写、映射和操作的通道，同时它在并发环境下是线程安全的，基于 FileInputStream、FileOutputStream 或者 RandomAccessFile 的 getChannel() 方法可以创建并打开一个文件通道。FileChannel 定义了 transferFrom() 和 transferTo() 两个抽象方法，它通过在通道和通道之间建立连接实现数据传输的。

- transferTo()：通过 FileChannel 把文件里面的源数据写入一个 WritableByteChannel 的目的通道。

```java
public abstract long transferTo(long position, long count, WritableByteChannel target)
        throws IOException;
```

- transferFrom()：把一个源通道 ReadableByteChannel 中的数据读取到当前 FileChannel 的文件里面。

```java
public abstract long transferFrom(ReadableByteChannel src, long position, long count)
        throws IOException;
```

下面给出 FileChannel 利用 transferTo() 和 transferFrom() 方法进行数据传输的使用示例：

```java
private static final String CONTENT = "Zero copy implemented by FileChannel";
private static final String SOURCE_FILE = "/source.txt";
private static final String TARGET_FILE = "/target.txt";
private static final String CHARSET = "UTF-8";
```

首先在类加载根路径下创建 source.txt 和 target.txt 两个文件，对源文件 source.txt 文件写入初始化数据。

```java
@Before
public void setup() {
    Path source = Paths.get(getClassPath(SOURCE_FILE));
    byte[] bytes = CONTENT.getBytes(Charset.forName(CHARSET));
    try (FileChannel fromChannel = FileChannel.open(source, StandardOpenOption.READ,
            StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
        fromChannel.write(ByteBuffer.wrap(bytes));
    } catch (IOException e) {
        e.printStackTrace();
    }
}
```

对于 transferTo() 方法而言，目的通道 toChannel 可以是任意的单向字节写通道 WritableByteChannel；而对于 transferFrom() 方法而言，源通道 fromChannel 可以是任意的单向字节读通道 ReadableByteChannel。其中，FileChannel、SocketChannel 和 DatagramChannel 等通道实现了 WritableByteChannel 和 ReadableByteChannel 接口，都是同时支持读写的双向通道。为了方便测试，下面给出基于 FileChannel 完成 channel-to-channel 的数据传输示例。

- 通过 transferTo() 将 fromChannel 中的数据拷贝到 toChannel

```java
@Test
public void transferTo() throws Exception {
    try (FileChannel fromChannel = new RandomAccessFile(
             getClassPath(SOURCE_FILE), "rw").getChannel();
         FileChannel toChannel = new RandomAccessFile(
             getClassPath(TARGET_FILE), "rw").getChannel()) {
        long position = 0L;
        long offset = fromChannel.size();
        fromChannel.transferTo(position, offset, toChannel);
    }
}
```

- 通过 transferFrom() 将 fromChannel 中的数据拷贝到 toChannel

```java
@Test
public void transferFrom() throws Exception {
    try (FileChannel fromChannel = new RandomAccessFile(
             getClassPath(SOURCE_FILE), "rw").getChannel();
         FileChannel toChannel = new RandomAccessFile(
             getClassPath(TARGET_FILE), "rw").getChannel()) {
        long position = 0L;
        long offset = fromChannel.size();
        toChannel.transferFrom(fromChannel, position, offset);
    }
}
```

下面介绍 transferTo() 和 transferFrom() 方法的底层实现原理，这两个方法也是 java.nio.channels.FileChannel 的抽象方法，由子类 sun.nio.ch.FileChannelImpl.java 实现。transferTo() 和 transferFrom() 底层都是基于 sendfile 实现数据传输的，其中 FileChannelImpl.java 定义了 3 个常量，用于标示当前操作系统的内核是否支持 sendfile 以及 sendfile 的相关特性。

```java
private static volatile boolean transferSupported = true;
private static volatile boolean pipeSupported = true;
private static volatile boolean fileSupported = true;
```

- transferSupported：用于标记当前的系统内核是否支持 sendfile() 调用，默认为 true。
- pipeSupported：用于标记当前的系统内核是否支持文件描述符（fd）基于管道（pipe）的 sendfile() 调用，默认为 true。
- fileSupported：用于标记当前的系统内核是否支持文件描述符（fd）基于文件（file）的 sendfile() 调用，默认为 true。

下面以 transferTo() 的源码实现为例。FileChannelImpl 首先执行 transferToDirectly() 方法，以 sendfile 的零拷贝方式尝试数据拷贝。如果系统内核不支持 sendfile，进一步执行 transferToTrustedChannel() 方法，以 mmap 的零拷贝方式进行内存映射，这种情况下目的通道必须是 FileChannelImpl 或者 SelChImpl 类型。如果以上两步都失败了，则执行 transferToArbitraryChannel() 方法，基于传统的 I/O 方式完成读写，具体步骤是初始化一个临时的 DirectBuffer，将源通道 FileChannel 的数据读取到 DirectBuffer，再写入目的通道 WritableByteChannel 里面。

```java
public long transferTo(long position, long count, WritableByteChannel target)
        throws IOException {
    // 计算文件的大小
    long sz = size();
    // 校验起始位置
    if (position > sz)
        return 0;
    int icount = (int)Math.min(count, Integer.MAX_VALUE);
    // 校验偏移量
    if ((sz - position) < icount)
        icount = (int)(sz - position);

    long n;

    if ((n = transferToDirectly(position, icount, target)) >= 0)
        return n;

    if ((n = transferToTrustedChannel(position, icount, target)) >= 0)
        return n;

    return transferToArbitraryChannel(position, icount, target);
}
```

接下来重点分析一下 transferToDirectly() 方法的实现，也就是 transferTo() 通过 sendfile 实现零拷贝的精髓所在。可以看到，transferToDirectlyInternal() 方法先获取到目的通道 WritableByteChannel 的文件描述符 targetFD，获取同步锁然后执行 transferToDirectlyInternal() 方法。

```java
private long transferToDirectly(long position, int icount, WritableByteChannel target)
        throws IOException {
    // 省略从target获取targetFD的过程
    if (nd.transferToDirectlyNeedsPositionLock()) {
        synchronized (positionLock) {
            long pos = position();
            try {
                return transferToDirectlyInternal(position, icount,
                        target, targetFD);
            } finally {
                position(pos);
            }
        }
    } else {
        return transferToDirectlyInternal(position, icount, target, targetFD);
    }
}
```

最终由 transferToDirectlyInternal() 调用本地方法 transferTo0() ，尝试以 sendfile 的方式进行数据传输。如果系统内核完全不支持 sendfile，比如 Windows 操作系统，则返回 UNSUPPORTED 并把 transferSupported 标识为 false。如果系统内核不支持 sendfile 的一些特性，比如说低版本的 Linux 内核不支持 DMA gather copy 操作，则返回 UNSUPPORTED_CASE 并把 pipeSupported 或者 fileSupported 标识为 false。

```java
private long transferToDirectlyInternal(long position, int icount,
                                        WritableByteChannel target,
                                        FileDescriptor targetFD) throws IOException {
    assert !nd.transferToDirectlyNeedsPositionLock() ||
            Thread.holdsLock(positionLock);

    long n = -1;
    int ti = -1;
    try {
        begin();
        ti = threads.add();
        if (!isOpen())
            return -1;
        do {
            n = transferTo0(fd, position, icount, targetFD);
        } while ((n == IOStatus.INTERRUPTED) && isOpen());
        if (n == IOStatus.UNSUPPORTED_CASE) {
            if (target instanceof SinkChannelImpl)
                pipeSupported = false;
            if (target instanceof FileChannelImpl)
                fileSupported = false;
            return IOStatus.UNSUPPORTED_CASE;
        }
        if (n == IOStatus.UNSUPPORTED) {
            transferSupported = false;
            return IOStatus.UNSUPPORTED;
        }
        return IOStatus.normalize(n);
    } finally {
        threads.remove(ti);
        end (n > -1);
    }
}
```

本地方法（native method）transferTo0() 通过 JNI（Java Native Interface）调用底层 C 的函数，这个 native 函数（Java_sun_nio_ch_FileChannelImpl_transferTo0）同样位于 JDK 源码包下的 native/sun/nio/ch/FileChannelImpl.c 源文件里面。JNI 函数 Java_sun_nio_ch_FileChannelImpl_transferTo0() 基于条件编译对不同的系统进行预编译，下面是 JDK 基于 Linux 系统内核对 transferTo() 提供的调用封装。

```java
#if defined(__linux__) || defined(__solaris__)
#include <sys/sendfile.h>
#elif defined(_AIX)
#include <sys/socket.h>
#elif defined(_ALLBSD_SOURCE)
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/uio.h>

#define lseek64 lseek
#define mmap64 mmap
#endif

JNIEXPORT jlong JNICALL
Java_sun_nio_ch_FileChannelImpl_transferTo0(JNIEnv *env, jobject this,
                                            jobject srcFDO,
                                            jlong position, jlong count,
                                            jobject dstFDO)
{
    jint srcFD = fdval(env, srcFDO);
    jint dstFD = fdval(env, dstFDO);

#if defined(__linux__)
    off64_t offset = (off64_t)position;
    jlong n = sendfile64(dstFD, srcFD, &offset, (size_t)count);
    return n;
#elif defined(__solaris__)
    result = sendfilev64(dstFD, &sfv, 1, &numBytes);    
    return result;
#elif defined(__APPLE__)
    result = sendfile(srcFD, dstFD, position, &numBytes, NULL, 0);
    return result;
#endif
}
```

对 Linux、Solaris 以及 Apple 系统而言，transferTo0() 函数底层会执行 sendfile64 这个系统调用完成零拷贝操作，sendfile64() 函数的原型如下：

```c
#include <sys/sendfile.h>

ssize_t sendfile64(int out_fd, int in_fd, off_t *offset, size_t count);
```

下面简单介绍一下 sendfile64() 函数各个参数的含义：

- out_fd：待写入的文件描述符
- in_fd：待读取的文件描述符
- offset：指定 in_fd 对应文件流的读取位置，如果为空，则默认从起始位置开始
- count：指定在文件描述符 in_fd 和 out_fd 之间传输的字节数

在 Linux 2.6.3 之前，out_fd 必须是一个 socket，而从 Linux 2.6.3 以后，out_fd 可以是任何文件。也就是说，sendfile64() 函数不仅可以进行网络文件传输，还可以对本地文件实现零拷贝操作。

### 9. 其它的零拷贝实现

### 9.1. Netty零拷贝

Netty 中的零拷贝和上面提到的操作系统层面上的零拷贝不太一样, 我们所说的 Netty 零拷贝完全是基于（Java 层面）用户态的，它的更多的是偏向于数据操作优化这样的概念，具体表现在以下几个方面：

- Netty 通过 DefaultFileRegion 类对 java.nio.channels.FileChannel 的 tranferTo() 方法进行包装，在文件传输时可以将文件缓冲区的数据直接发送到目的通道（Channel）
- ByteBuf 可以通过 wrap 操作把字节数组、ByteBuf、ByteBuffer 包装成一个 ByteBuf 对象, 进而避免了拷贝操作
- ByteBuf 支持 slice 操作, 因此可以将 ByteBuf 分解为多个共享同一个存储区域的 ByteBuf，避免了内存的拷贝
- Netty 提供了 CompositeByteBuf 类，它可以将多个 ByteBuf 合并为一个逻辑上的 ByteBuf，避免了各个 ByteBuf 之间的拷贝

其中第 1 条属于操作系统层面的零拷贝操作，后面 3 条只能算用户层面的数据操作优化。

### 9.2. RocketMQ和Kafka对比

RocketMQ 选择了 mmap + write 这种零拷贝方式，适用于业务级消息这种小块文件的数据持久化和传输；而 Kafka 采用的是 sendfile 这种零拷贝方式，适用于系统日志消息这种高吞吐量的大块文件的数据持久化和传输。但是值得注意的一点是，Kafka 的索引文件使用的是 mmap + write 方式，数据文件使用的是 sendfile 方式。

![img](./20230319-linux-io-zero-copy-java.assets/v2-da99a5a5b027c7f374186b55919b0f0e_1440w.webp)

## 小结

本文开篇详述了 Linux 操作系统中的物理内存和虚拟内存，内核空间和用户空间的概念以及 Linux 内部的层级结构。在此基础上，进一步分析和对比传统 I/O 方式和零拷贝方式的区别，然后介绍了 Linux 内核提供的几种零拷贝实现，包括内存映射 mmap、sendfile、sendfile + DMA gather copy 以及 splice 几种机制，并从系统调用和拷贝次数层面对它们进行了对比。接下来从源码着手分析了 Java NIO 对零拷贝的实现，主要包括基于内存映射（mmap）方式的 MappedByteBuffer 以及基于 sendfile 方式的 FileChannel。最后在篇末简单的阐述了一下 Netty 中的零拷贝机制，以及 RocketMQ 和 Kafka 两种消息队列在零拷贝实现方式上的区别。