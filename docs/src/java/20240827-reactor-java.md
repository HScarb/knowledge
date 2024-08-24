---
title: Reactor 模式的 Java 实现（feat. Scalable IO in Java - Doug Lea）
author: Scarb
date: 2024-08-27
---

原文地址：[http://hscarb.github.io/java/20240827-reactor-java.html](http://hscarb.github.io/java/20240827-reactor-java.html)

# Reactor 模式的 Java 实现（feat. Scalable IO in Java - Doug Lea）

## 1. 背景

Doug Lea 在 [Scalable IO in Java](https://gee.cs.oswego.edu/dl/cpjslides/nio.pdf) 的 PPT 中描述了 Reactor 编程模型的思想，大部分 NIO 框架和一些中间件的 NIO 编程都与它一样或是它的变体，包括 Netty。

---

### 1.1 Reactor 模式是什么

**内核空间**的网络数据收发模型：阻塞 IO（BIO）、非阻塞 IO（NIO）、IO 多路复用、信号驱动 IO、异步 IO。

而 Reactor 模式是对**用户空间**的 IO 线程模型进行分工的模式，它基于 IO 多路复用来实现。

### 1.2 本文内容

本文将介绍 Reactor 编程模型使用 Java NIO 包的三种实现，并提供对应的源码实现和解释。

我会实现一个简单的服务端逻辑：以换行符来识别每次用户输入，将每次用户输入的字符都转成大写，返回给用户。

本文的代码完整实现地址：https://github.com/HScarb/reactor

## 2. 传统服务端设计模式（BIO）

一般的 Web 服务端或分布式服务端等应用中，大都具备这些处理流程：读请求（send）、解码（decode）、处理和计算（compute）、编码（encode）、发送响应（send）。

在传统服务端设计中，对**每个新的客户端连接都启动一个新的线程**去处理，在**每个线程中串行执行上述处理流程**。这种编程方式也就是 BIO。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202405222338292.png)

### 2.1 BIO 服务端

```java
public class BioServer implements Runnable {
    public int port;

    public BioServer(int port) {
        this.port = port;
    }

    @Override
    public void run() {
        try (final ServerSocket serverSocket = new ServerSocket(port)) {
            System.out.println("Server is listening on port " + port);
            while (!Thread.interrupted()) {
                try {
                    // 当有新的客户端连接时，accept() 方法会返回一个Socket对象，表示与客户端的连接
                    // 创建一个新的线程来处理该连接
                    new Thread(new BioHandler(serverSocket.accept())).start();
                } catch (IOException e) {
                    System.out.println("Error handling client: " + e.getMessage());
                }
            }
        } catch (IOException e) {
            System.out.println("Server exception: " + e.getMessage());
        }
    }
}
```

上述代码中，为每个客户端连接都创建一个 Handler 线程，在 Handler 中处理读请求、解码、处理和计算、编码、发送响应的所有逻辑。

### 2.2 BIO Handler

```java
/**
 * 处理单个客户端连接的具体逻辑
 */
public class BioHandler implements Runnable {

    public Socket socket;

    public BioHandler(Socket socket) {
        this.socket = socket;
    }

    @Override
    public void run() {
        System.out.println("New client connected");
        try (
            final BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
            final PrintWriter writer = new PrintWriter(socket.getOutputStream(), true);
        ) {
            writer.print("bio> ");
            writer.flush();
            String input;
            // 读取客户端输入的一行内容
            while ((input = reader.readLine()) != null) {
                // 处理客户端输入的内容
                final String output = process(input);
                // 将处理后的内容写回给客户端
                writer.println(output);
                writer.print("bio> ");
                writer.flush();
            }
        } catch (IOException e) {
            System.out.println("Error handling io: " + e.getMessage());
        } finally {
            try {
                socket.close();
            } catch (IOException e) {
                System.out.println("Failed to close socket: " + e.getMessage());
            }
        }
    }

    /**
     * 将客户端输入的内容转换为大写
     */
    private String process(String requestContent) {
        return requestContent.toUpperCase(Locale.ROOT);
    }
}
```

启动这个服务端程序

```java
public class Main {

    public static final int PORT = 8080;

    public static void main(String[] args) throws IOException {
        runBioServer();
    }

    public static void runBioServer() {
        final BioServer bioServer = new BioServer(PORT);

        ExecutorService mainThread = Executors.newSingleThreadExecutor();
        mainThread.submit(bioServer);
        mainThread.shutdown();
    }
}
```

### 2.3 缺陷

上述程序存在缺陷：

1. **线程资源消耗高**：每个客户端连接都会创建一个线程，在高并发场景下会导致大量线程创建和销毁，消耗大量系统资源。线程上下文切换开销也会随之增加。
2. **阻塞式 I/O**：`accept()`、`readLine()`和`print()`方法都是阻塞式的，这意味着线程在等待I/O操作完成时会被阻塞，无法执行其他任务。这样会导致资源利用率低下。
3. **难于管理和扩展**：直接使用`new Thread()`的方式来处理连接，难以进行线程管理和池化，难以实现更复杂的并发控制和优化。

## 3. 优化思路

随着互联网的发展，对服务性能的挑战也越来越大。我们希望能构建更高性能且可伸缩的服务，能够达到：

1. 随着客户端数量的增加而优雅降级
2. 随着硬件资源的增加，性能持续提高
3. 具备低延迟、高吞吐、高质量的服务

### 3.1 分而治之

要达到以上目标，我们先考虑将处理过程拆分成更小的任务，每个任务执行一个非阻塞操作，由一个 IO 事件来触发执行。

java.nio 包对这种机制提供了支持：

* 非阻塞的读和写
* 通过感知 IO 事件来分发 IO 事件关联的任务

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202405230024138.png)

BIO 线程是以 read->decode->process->encode->send 的顺序**串行处理**，NIO 将其分成了三个执行单元：读取、业务处理和发送，处理过程如下：

- 读取（read）：如果无数据可读，线程返回线程池；发生**读 IO 事件**，申请一个线程处理读取，读取结束后处理业务
- 业务处理（decode、compute、encode）：线程同步处理完业务后，生成响应内容并编码，返回线程池
- 发送（send）：发生**写 IO 事件**，申请一个线程进行发送

与 BIO 明显的区别就是，一次请求的处理过程是由多个**不同的线程**完成的，感觉和指令的**串行执行**和**并行执行**有点类似。

分而治之的关键在于非阻塞，这样就能充分利用线程，压榨 CPU，提高系统的吞吐能力。

### 3.2 事件驱动

另一个优化思路是基于事件启动，它比其他模型更高效。

* 使用的资源更少：不用为每个客户端都启动一个线程
* 开销更少：减少上下文切换，锁的使用也更少
* 任务分发可能会更慢：必须手动绑定事件和动作

事件驱动架构的服务实现复杂度也更高，必须将处理过程拆分成多个非阻塞的动作，且持续跟踪服务的逻辑状态。并且事件启动无法避免所有的阻塞，比如 CG、缺页中断等。

## 4. 前置知识：Java NIO 包

上面提到 java.nio 包提供了非阻塞以及事件驱动机制的支持，是实现 Reactor 模式必不可少的依赖。在介绍 Reactor 模式之前先来简单回顾一下 Java NIO，便于理解后面的代码。

Java NIO 指 `java.nio` 包，其中的 [`nio` 是 “New Input/Output” 的缩写](https://docs.oracle.com/en/java/javase/21/core/java-nio.html)，它是 Java 1.4 中引入的一套新的 I/O API。也有文章说 Java NIO 中的 NIO 指 “Non-blocking I/O” 的，我认为不太准确。它提供了实现 Non-blocking I/O 的特性和工具，但它不仅仅局限于 Non-blocking I/O，还包括其他许多功能。

Java NIO 主要提供了三个核心组件：Buffer、Channel 和 Selector，他们的关系如下图所示：

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202405230039635.png)

* Channel（通道）：原 I/O 包中 Stream 的模拟，但 Channel 是双向的，可以读和写，并且支持**异步**读/写。它必须从 Buffer 读取或写入数据。Channel 可以通过调用 `configureBlocking(false)` 方法配置为非阻塞模式。
  * FileChannel：文件通道，用于文件的读和写。它只能在阻塞模式下运行，其他 3 个 Channel 都可以配置成非阻塞模式。
  * DatagramChannel：用于 UDP 连接的接收和发送
  * SocketChannel：把它理解为 TCP 连接通道，简单理解就是 TCP 客户端
  * ServerSocketChannel：TCP 对应的服务端，用于监听某个端口进来的请求
* Buffer（缓冲区）：本质上是一块内存，内部实现是一个数组。用于向 Channel 写入和读取数据。
* Selector（选择器）：这个组件用来实现多路复用 I/O，它可以监听多个 Channel 是否准备好进行读取或写入。这样就可以通过一个线程管理多个 Channel，从而管理多个网络连接。
  * `Channel` 必须处于非阻塞模式才能与 `Selector` 一起使用。这意味着不能将 `FileChannel` 与 `Selector`  一起使用。
  * Selector 可以监听 Channel 上 4 种类型的事件：
    * `SelectionKey.OP_ACCEPT`：表示通道接受连接的事件，这通常用于 `ServerSocketChannel`。
    * `SelectionKey.OP_CONNECT`：表示通道完成连接的事件，这通常用于 `SocketChannel`。
    * `SelectionKey.OP_READ`：表示通道准备好进行读取的事件，即有数据可读。
    * `SelectionKey.OP_WRITE`：表示通道准备好进行写入的事件，即可以写入数据。
  *  `SelectionKey register(Selector sel, int ops)`：Channel 的方法，用于注册 Channel 到 Selector，让 Selector 多路复用地监听 Channel 上感兴趣的事件。第二个参数可以是上面 4 种类型的事件中的一种或几种。
  * `SelectionKey`：注册后返回的选择键，表示 Channel 在 Selector 上的注册信息，当中包含这些方法：
    * `interestOps()`：监听事件的集合
    * `readyOps()`：当前收到的事件集合
    * `channel()`：被注册的通道
    * `selector()`：注册到的选择器
    * `attachment()`：附加的一个对象（可选）。在 Reactor 模式中，会把 Acceptor 添加到 Selector 中，Acceptor 是用于处理客户端连接的组件，attach 到 Selector 上之后就可以在客户端连接事件到达时取出 Acceptor，处理客户端连接。
  * `select()` ：阻塞当前线程，直到至少有一个 Channel 在这个 Selector 上注册的事件就绪。返回当前就绪的 Channel 的数量。
  * `selectedKeys()`：返回已经就绪的通道的选择键，通常在 `select()` 方法之后调用，获取就绪的 `SelectionKey`，然后遍历它们处理 IO 事件。可以通过 `selectedKeys().iterator().next().channel()` 方法遍历和访问这些通道。

## 5. 单线程 Reactor

Reactor 是一种设计模式，它使用了上面所说的优化思想：分而治之和事件驱动，旨在编写更可伸缩高性能的应用。[wikipedia](https://en.wikipedia.org/wiki/Reactor_pattern) 对其定义如下：

> Reactor 是一个或多个输入事件的处理模式，用于处理并发传递给服务处理程序的服务请求。服务处理程序判断传入请求发生的事件，并将它们同步的分派给关联的请求处理程序。

它更多地是在用户空间的角度，基于 IO 多路复用，对线程进行分工。

Reactor 是一个线程，基于 IO 多路复用技术，它可以不断监听 IO 事件，然后进行分发处理，像一个反应堆一样，因此被称为 Reactor 模式。它主要的工作：

* 使用 IO 多路复用（JAVA 中的 Selector），监听 IO 事件
* 将监听到的 IO 事件分发（dispatch）到对应的处理器中进行处理（Acceptor 或者 Handler）

---

### 5.1 设计

下图是 Reactor 单线程版本的基本设计

![单线程版本](https://images2018.cnblogs.com/blog/1424165/201808/1424165-20180803142201320-1610004538.png)

其中橙色的 Reactor 为一个**线程**，负责响应客户端请求事件。每当收到一个客户端连接，Reactor 会让 Acceptor 组件处理。

绿色的 Acceptor 组件与 Reactor 运行在同一线程中，负责将客户端连接分发给 Handler 处理（图中的 dispatch 过程）。

Handler 组件负责处理读取、解码、计算、编码、响应整个流程，在单线程 Reactor 中，它也与 Reactor 运行在同一线程中。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202405230024138.png)

单线程版本就是**用一个线程**完成所有步骤，包括事件的通知、读取和响应过程、业务处理。

### 5.2 Reactor 线程初始化

在单线程 Reactor 中，只会初始化一个线程，即 Reactor 线程，由它来调用 Acceptor 实例分发连接事件，Acceptor 继续创建 Handler 进行请求处理。

```java
public class Reactor implements Runnable {
    /**
     * 选择器，NIO 组件，通知 Channel 就绪的事件
     */
    final Selector selector;

    /**
     * Handler 的类型
     */
    final Class<?> handlerClass;

    /**
     * TCP 服务端 Socket，监听某个端口进来的客户端连接和请求
     */
    ServerSocketChannel serverSocket;

    /**
     * Reactor 的执行线程
     */
    public final ExecutorService executor;

    /**
     * 直接创建 Reactor 使用
     */
    public Reactor(int port, Class<?> handlerClass) throws IOException {
        this.handlerClass = handlerClass;
        executor = Executors.newSingleThreadExecutor();
        selector = Selector.open();
        serverSocket = ServerSocketChannel.open();
        // 绑定服务端端口
        serverSocket.socket().bind(new InetSocketAddress(port));
        // 设置服务端 socket 为非阻塞模式
        serverSocket.configureBlocking(false);
        // 注册并关注一个 IO 事件，这里是 ACCEPT（接收客户端连接）
        final SelectionKey selectionKey = serverSocket.register(selector, SelectionKey.OP_ACCEPT);
        // 将 Acceptor 作为附件关联到 SelectionKey 上，用于在客户端连接事件发生时取出，让 Acceptor 去分发连接给 Handler
        selectionKey.attach(new Acceptor());
    }
}
```

### 5.3 Reactor 线程主循环

```java
/**
 * 启动 Reactor 线程，执行 run 方法
 */
public void startThread() {
    executor.execute(this);
}

@Override
public void run() { // normally in a new Thread
    try {
        // 死循环，直到线程停止
        while (!Thread.interrupted()) {
            // 阻塞，直到至少有一个通道的 IO 事件就绪
            selector.select();
            // 拿到就绪通道的选择键 SelectionKey 集合
            final Set<SelectionKey> selectedKeys = selector.selectedKeys();
            // 遍历就绪通道的 SelectionKey
            final Iterator<SelectionKey> iterator = selectedKeys.iterator();
            while (iterator.hasNext()) {
                // 分发
                dispatch(iterator.next());
            }
            // 清空就绪通道的 SelectionKey 集合
            selectedKeys.clear();
        }
    } catch (IOException e) {
    }
}

/**
 * 分发事件，将就绪通道的注册键关联的处理器取出并执行
 * <p>
 * 在 MainReactor 中，就绪的是客户端连接事件，处理器是 Acceptor
 * <p>
 * 在 SubReactor 中，就绪的是客户端 IO 事件，处理器是 Handler
 */
private void dispatch(SelectionKey selectionKey) {
    // 获取 SelectionKey 关联的处理器
    final Runnable runnable = (Runnable) selectionKey.attachment();
    if (runnable != null) {
        // 执行处理
        runnable.run();
    }
}
```

主循环中，使用 `java.nio` 的 Selector，它底层使用了操作系统的多路复用技术，用一个线程处理多个客户端连接。`select()` 方法阻塞等待新的监听的事件（在这里是客户端连接事件 `OP_ACCEPT`）被触发。一旦接受到连接事件，调用 `dispatch` 方法，取出之前关联到 SelectionKey 上的处理器：Acceptor 附件，并执行它进行请求分发。

### 5.4 Acceptor 请求分发

```java
/**
 * 处理客户端连接事件
 */
class Acceptor implements Runnable {
    @Override
    public void run() {
        try {
            // 接收客户端连接，返回客户端 SocketChannel。非阻塞模式下，没有客户端连接则直接返回 null
            final SocketChannel socket = serverSocket.accept();
            if (socket != null) {
                // 将提示发送给客户端
                socket.write(ByteBuffer.wrap("reactor> ".getBytes()));
                // 根据 Handler 类型，实例化 Handler
                final Constructor<?> constructor = handlerClass.getConstructor(Selector.class, SocketChannel.class);
                // 在 Handler 线程中处理客户端 IO 事件
                constructor.newInstance(selector, socket);
            }
        } catch (Exception e) {
        }
    }
}
```

Acceptor 组件负责客户端连接事件的分发，将客户端连接分发给 Handler 处理。注意这里没有新建线程，Acceptor 的逻辑还是与 Reactor 在同一线程中运行。

### 5.5 Handler 初始化

```java
/**
 * 单线程非阻塞处理器
 */
public class NioHandler implements Runnable {
    private static final int MAX_INPUT_BUFFER_SIZE = 1024;
    private static final int MAX_OUTPUT_BUFFER_SIZE = 1024;
    final SocketChannel socket;
    final SelectionKey selectionKey;
    ByteBuffer input = ByteBuffer.allocate(MAX_INPUT_BUFFER_SIZE);
    ByteBuffer output = ByteBuffer.allocate(MAX_OUTPUT_BUFFER_SIZE);
    static final int READING = 0, SENDING = 1, CLOSED = 2;
    /**
     * Handler 当前处理状态
     */
    int state = READING;
    /**
     * 缓存每次读取的内容
     */
    StringBuilder inputStringBuilder = new StringBuilder();

    public NioHandler(Selector selector, SocketChannel socket) throws IOException {
        this.socket = socket;
        // 设置非阻塞（NIO）。这样，socket 上的操作如果无法立即完成，不会阻塞，而是会立即返回。
        socket.configureBlocking(false);
        // Optionally try first read now
        // 注册客户端 socket 到 Selector。
        // 这里先不设置感兴趣的事件，分离 register 和 interestOps 这两个操作，避免多线程下的竞争条件和同步问题。
        this.selectionKey = socket.register(selector, 0);
        // 把 Handler 自身放到 selectionKey 的附加属性中，用于在 IO 事件就绪时从 selectedKey 中获取 Handler，然后处理 IO 事件。
        this.selectionKey.attach(this);
        // 监听客户端连接上的 IO READ 事件
        this.selectionKey.interestOps(SelectionKey.OP_READ);

        // 由于 Selector 的注册信息发生变化，立即唤醒 Selector，让它能够处理最新订阅的 IO 事件
        selector.wakeup();
    }
}
```

Handler 负责处理 I/O 操作和业务处理，这里初始化 Handler。

1. 将客户端的 TCP 通道（`SocketChannel`）设置非阻塞模式。这样，socket 上的操作如果无法立即完成，不会阻塞，而是会立即返回。
2. 并且将它注册到之前的 `Selector` 上。在这里先不设置感兴趣的事件（`0` 表示对任何 IO 事件都不感兴趣），后续通过 `interestOps` 方法来设置感兴趣的事件。分离 register 和 interestOps 这两个操作，目的是避免多线程下的竞争条件和同步问题。
3. 在 `SelectionKey` 上附上自己（Handler），以在读取数据时调用 Handler 的 `run` 方法。
4. 监听读取操作（OP_READ），客户端 SocketChannel 有数据可读时 `Selector` 的 `select` 方法返回该 `SelectionKey`。
5. 立即唤醒可能正在阻塞的 `select()` 方法，确保新注册的 `SelectionKey` 立即生效。

### 5.6 Handler 执行 I/O 操作和业务处理

Handler 中包含 I/O 操作（read 和 write）和业务操作（process）。process 方法中将读取到的字符转换成大写。

1. 先将 `state` 初始化为 `READING` 以接收客户输入（`read()`）。

2. 客户端每输入一个字符就会触发 OP_READ 事件，我们先把客户输入的字符缓存到 StringBuilder，直到客户端输入换行符时将缓存的字符串进行处理（`process()`）。并把处理结果放入 output buffer。

3. 处理完成后，将 `state` 改为 `SENDING`，将 output buffer 中的内容写到客户端。
4. 写完后将将 `state` 改为 `READING`，继续读取。

```java
@Override
public void run() {
    try {
        if (state == READING) {
            // 此时通道已经准备好读取数据
            read();
        } else if (state == SENDING) {
            // 此时通道已经准备好写入数据
            send();
        }
    } catch (IOException ex) {
        // 关闭连接
        try {
            selectionKey.channel().close();
        } catch (IOException ignore) {
        }
    }
}

/**
 * 从通道读取字节
 */
protected void read() throws IOException {
    // 清空 input buffer
    input.clear();
    // 读取内容到接收 input buffer
    int n = socket.read(input);
    // 判断用户是否输入完成
    if (inputIsComplete(n)) {
        // 用户输入完成，进行处理，将用户输入放入 output buffer
        process();
        // 修改 Handler 状态为响应
        state = SENDING;
        // 修改 channel select 的事件类型
        // Normally also do first write now
        selectionKey.interestOps(SelectionKey.OP_WRITE);
    }
}

/**
 * 当读取到 \r\n 时表示结束，切换到响应状态
 *
 * @param bytes 读取的字节数
 *              -1：到达了流的末尾，连接已经关闭
 *              0：当前没有可用数据，连接仍打开，通常在非阻塞模式下返回
 *              > 0：读取的字节数
 * @throws IOException
 */
protected boolean inputIsComplete(int bytes) throws IOException {
    if (bytes > 0) {
        // 将 ByteBuffer 切换成读取模式
        input.flip();
        // 每次读取一个字符，添加到 inputStringBuilder，如果读到换行符则结束读取
        while (input.hasRemaining()) {
            byte ch = input.get();

            if (ch == 3) { // ctrl+c 关闭连接
                state = CLOSED;
                return true;
            } else if (ch == '\r') { // continue
            } else if (ch == '\n') {
                // 读取到了 \r\n，读取结束
                return true;
            } else {
                inputStringBuilder.append((char) ch);
            }
        }
    } else if (bytes == -1) {
        // -1 客户端关闭了连接
        throw new EOFException();
    } else {
        // bytes == 0 继续读取
    }
    return false;
}

/**
 * 进行业务处理，将用户输入转换成大写
 *
 * @throws EOFException 用户输入 ctrl+c 主动关闭
 */
protected void process() throws EOFException {
    // 构造用户输入内容字符串
    String requestContent = inputStringBuilder.toString();
    // 构造响应
    byte[] response = requestContent.toUpperCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8);
    output.put(response);
}

/**
 * 发送响应
 */
protected void send() throws IOException {
    int written = -1;
    // 切换到读取模式，读取 output buffer，判断是否有数据要发送
    output.flip();
    // 如果有数据需要发送，则调用 socket.write 方法发送响应
    if (output.hasRemaining()) {
        written = socket.write(output);
    }

    // 检查连接是否处理完毕，是否断开连接
    if (outputIsComplete(written)) {
        selectionKey.channel().close();
    } else {
        // 否则继续读取
        state = READING;
        // 把提示发到界面
        socket.write(ByteBuffer.wrap("\r\nreactor> ".getBytes()));
        selectionKey.interestOps(SelectionKey.OP_READ);
    }
}

/**
 * 当用户输入了一个空行，表示连接可以关闭了
 */
protected boolean outputIsComplete(int written) {
    if (written <= 0) {
        // 用户只敲了个回车， 断开连接
        return true;
    }

    // 清空旧数据，接着处理后续的请求
    output.clear();
    inputStringBuilder.delete(0, inputStringBuilder.length());
    return false;
}

```

### 5.7 单线程 Reactor 启动

```java
public class Main {

    public static final int PORT = 8080;

    public static void main(String[] args) throws IOException {
        runSingleThreadReactor();
    }

    public static void runSingleThreadReactor() throws IOException {
        final Reactor reactor = new Reactor(PORT, NioHandler.class);
		// 启动 Reactor 线程，开始监听 IO 事件
        reactor.startThread();
        reactor.executor.shutdown();
    }
}
```



## 6. 单 Reactor 多线程

Reactor 作用就是要迅速的触发 Handler ，在单线程 Reactor 中，Handler 与 Reactor 处于同一线程，Handler 进行业务处理的过程会导致 Reactor 变慢。根据上面分而治之的优化思想，可以将业务处理过程（非 IO 操作，上面的 `process()` 方法）从 Reactor 线程中拆出来，到单独的 Handler 线程池中处理。下图是单 Reactor 多线程版本。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202406020332997.png)

多线程版本将业务处理和 I/O 操作进行分离，Reactor 线程只关注事件分发和实际的 IO 操作，业务处理如协议的编解码都分配给线程池处理。如上图所示，decode、compute、encode 的业务处理过程拆分到单独的 Handler 线程池去处理。

### 6.1 Handler 使用线程池

```java
/**
 * 多线程 Handler，IO 的 read 和 write 操作仍由 Reactor 线程处理，业务处理逻辑（decode、process、encode）由该线程池处理
 */
public class MultiThreadNioHandler extends NioHandler {
    static Executor pool = Executors.newFixedThreadPool(4);

    static final int PROCESSING = 3;

    public MultiThreadNioHandler(Selector selector, SocketChannel socket) throws IOException {
        super(selector, socket);
    }

    /**
     * 重写 read 方法，从客户端 socket 读取数据之后交给线程池进行处理，而不是在当前线程直接处理
     */
    @Override
    protected synchronized void read() throws IOException {
        input.clear();
        int n = socket.read(input);
        // 判断是否读取完毕（客户端是否输入换行符）
        if (inputIsComplete(n)) {
            // 切换成处理中状态，多线程进行处理
            state = PROCESSING;
            pool.execute(new Processor());
        }
    }

    /**
     * 业务处理逻辑，处理完后切换成发送状态
     */
    synchronized void processAndHandOff() {
        try {
            // 进行业务处理
            process();
        } catch (EOFException e) {
            // 直接关闭连接
            try {
                selectionKey.channel().close();
            } catch (IOException ex) {
                ex.printStackTrace();
            }
            return;
        }
        // 业务处理完成，切换成发送状态。发送仍交给 Reactor 线程处理。
        state = SENDING;
        selectionKey.interestOps(SelectionKey.OP_WRITE);

        // 立即唤醒 selector，以便新注册的 OP_WRITE 事件能立即被响应。
        // 此时 Reactor 会收到并分发 OP_WRITE 事件，又会走到 Handler 的 run 方法，由 Reactor 线程继续执行 send()
        selectionKey.selector().wakeup();
    }

    class Processor implements Runnable {
        @Override
        public void run() {
            processAndHandOff();
        }
    }
}
```

### 6.2 多线程 Reactor 启动

```java
public class Main {
    public static final int PORT = 8080;

    public static void main(String[] args) throws IOException {
        runMultiThreadReactor();
    }

    public static void runMultiThreadReactor() throws IOException {
        final Reactor reactor = new Reactor(PORT, MultiThreadNioHandler.class);

        reactor.startThread();
        reactor.executor.shutdown();
    }
}
```

## 7. 主从 Reactor 多线程

单 Reactor 多线程的情况下，可能会有这样的情况发生：Handler 线程池中业务处理很快，大部分的时间都花在 Reactor 线程处理 I/O 上，导致 CPU 闲置，降低了响应速度。这里也应用分而治之的优化方法，把 I/O 处理的步骤从 Reactor 线程中拆分出来，用线程池去处理，

主从 Reactor 多线程版本设计了一个 **主 Reactor** 用于处理连接接收事件（OP_ACCEPT），多个 **从 Reactor** 线程处理实际的 I/O（OP_READ、OP_WRITE），分工合作，匹配 CPU 和 IO 速率。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202406020358316.png)

### 7.1 引入 ReactorGroup

在实现主从 Reactor 时，由于 从 Reactor 中有多个 Reactor 线程，设计到选择和管理 Reactor。我借鉴了 Netty 的实现，引入了 `ReactorGroup` 来管理 Reactor（Netty 中的 EventLoopGroup）。

```java
public class ReactorGroup {
    /**
     * Reactor 数组，保存当前 ReactorGroup 下的所有 Reactor
     */
    final Reactor[] children;

    /**
     * 计数器，用来选择下一个 Reactor
     */
    int next = 0;

    public ReactorGroup(int nThreads) {
        children = new Reactor[nThreads];

        for (int i = 0; i < nThreads; i++) {
            try {
                children[i] = new Reactor();
            } catch (IOException e) {
            }
        }
    }

    public Reactor next() {
        final Reactor reactor = children[next];
        if (++next == children.length) {
            next = 0;
        }
        return reactor;
    }

    /**
     * 注册 ServerSocketChannel 到 ReactorGroup 中的下一个选中的 Reactor
     */
    public SelectionKey register(ServerSocketChannel serverSocket) throws ClosedChannelException {
        return next().register(serverSocket);
    }
}
```

### 7.1 Reactor 类实现

Reactor 类作为 main reactor 和 sub reactor 的实现类，主要工作还是接收 IO 事件然后分发出去。实现和单线程 Reactor 中没有区别，它能满足 main reactor 和 sub reactor 的运行逻辑，它们的区别是主要在于监听的 IO 事件的不同和分发时执行的处理器不同：

* main reactor：监听 OP_ACCEPT 事件，新的 OP_ACCEPT 事件到达则调用附加在其 SelectionKey 上的 Acceptor 去分发连接给 sub reactor。
* sub reactor：监听 OP_READ 和 OP_WRITE 事件，新的事件到达则调用附加在其 SelectionKey 上的 Handler 去处理业务逻辑。

```java
/**
 * {@link ReactorGroup} 创建 Reactor 使用
 */
public Reactor() throws IOException {
    executor = Executors.newSingleThreadExecutor();
    selector = Selector.open();
    this.handlerClass = null;
}
```

相比之前的 Reactor 代码，加了一个构造器，让 ReactorGroup 调用。在主从 Reactor 中，Reactor 不再直接绑定服务端 ServerSocketChannel，而是交给一个统一的启动类来讲服务端 ServerSocketChannel 绑定到服务端口。

### 7.2 主从 Reactor 启动类

主从 Reactor 包含两个 ReactorGroup，需要一个类来管理 ReactorGroup，并且管理服务端 ServerSocketChannel，绑定到服务端口。这里也是借鉴 Netty 的 `ServerBootstrap`，编写了一个启动类 `MultiReactorBootstrap`。

```java
public class MultiReactorBootstrap {
    /**
     * 主 Reactor 组
     */
    private ReactorGroup mainReactorGroup;

    /**
     * 从 Reactor 组
     */
    private ReactorGroup subReactorGroup;

    private final ServerSocketChannel serverSocket;

    private final Class<?> handlerClass;

    public MultiReactorBootstrap(int port, ReactorGroup mainReactorGroup, ReactorGroup subReactorGroup,
        Class<?> handlerClass) throws IOException {
        this.mainReactorGroup = mainReactorGroup;
        this.subReactorGroup = subReactorGroup;
        this.handlerClass = handlerClass;

        // 将服务端 ServerSocketChannel 绑定到端口上
        serverSocket = ServerSocketChannel.open();
        serverSocket.socket().bind(new InetSocketAddress(port));
        serverSocket.configureBlocking(false);
        // 让 Main Reactor 监听 ServerSocketChannel 上的 ACCEPT 事件
        SelectionKey selectionKey = this.mainReactorGroup.register(serverSocket);
        selectionKey.interestOps(SelectionKey.OP_ACCEPT);
        selectionKey.attach(new Acceptor());
    }

    private class Acceptor implements Runnable {

        @Override
        public synchronized void run() {
            try {
                SocketChannel socket = serverSocket.accept();
                if (socket != null) {
                    socket.write(ByteBuffer.wrap("reactor> ".getBytes()));
                    // 从 Sub Reactor 组中轮询选择一个 Reactor，用于处理新的客户端连接
                    final Reactor subReactor = subReactorGroup.next();

                    // 实例化 Handler
                    final Constructor<?> constructor = handlerClass.getConstructor(Selector.class, SocketChannel.class);
                    // 将客户端 SocketChannel 注册到 Sub Reactor 的 Selector 上
                    constructor.newInstance(subReactor.selector, socket);
                    // 启动 Sub Reactor 线程，开始监听客户端 SocketChannel 上的 IO 事件
                    subReactor.startThread();
                }
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }
}
```

### 7.3 主从 Reactor 启动

```java
public class Main {

    public static final int PORT = 8080;

    public static void main(String[] args) throws IOException {
        runMultiReactor();
    }

    public static void runMultiReactor() throws IOException {
        // 创建单线程的主 Reactor 组
        ReactorGroup mainReactorGroup = new ReactorGroup(1);
        // 创建 4 个线程的从 Reactor 组
        ReactorGroup subReactorGroup = new ReactorGroup(4);
        new MultiReactorBootstrap(PORT, mainReactorGroup, subReactorGroup, NioHandler.class);
    }
}
```

## 8. Netty 中的 Reactor 模式

Netty 也是基于 Reactor 模式实现的，并且对其进行了扩展和优化，以满足更高的性能和更多的使用场景。Netty 中主要的类与我的实现中的类对应关系如下：

| My Implementation                | Netty                                        |
| -------------------------------- | -------------------------------------------- |
| Reactor                          | EventLoop                                    |
| ReactorGroup                     | EventLoopGroup                               |
| Acceptor                         | ServerBootstrapAcceptor                      |
| NioHandler/MultiThreadNioHandler | ChannelInboundHandler/ChannelOutboundHandler |
| MultiReactorBootstrap            | ServerBootstrap                              |

Netty 在上述概念之外，还引入了 Channel Pipeline 的概念，每个 Channel 都关联一个 Pipeline（无论是服务端还是客户端）。它是由多个 Handler 组成的链表，提供了灵活的方式编排业务 Handler。数据可以在 Channel Pipeline 中流动，被多个 Handler 处理。可以在添加 Handler 时为每个 Handler 指定执行的线程池，如果不指定，就会使用 Reactor 的线程来执行。

以下是主从 Reactor 多线程在 Netty 中组件视图和运行逻辑：

![image-20240828014319420](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202408280145099.png)

1. 主 ReactorGroup 通常只有 1 个 Reactor 线程，用于监听客户端连接事件
2. Netty 的 `ServerBootstrap` 初始化时，会在内部将 `ServerBootstrapAcceptor` 注册到服务端 Channel 的 Pipeline，用于处理客户端连接
3. 客户端连接事件到来时，`ServerBootstrapAcceptor` 会选择一个从 Reactor，将客户端 SocketChannel 注册上去，开始监听上面的 IO 读写事件
4. IO 读写事件就绪时，执行 Pipeline，pipeline 会依次执行链表上的 Handler
5. 一般来说，在某个或某些 Handler 中会有耗时的业务逻辑，也会配置对应的业务线程池来执行这些逻辑。Handler 在对读到的数据解码之后交给对应的业务线程进行业务处理。
6. 业务逻辑处理完毕后，调用 pipeline 的写方法，进行 IO 写，将处理后的响应写回客户端。

---

Netty 中的 Reactor 线程也是一个线程，内部时一个死循环。它除了轮询和处理 IO 就绪事件以外，还需要执行异步任务和定时任务。

![img](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202408280145100.png)

Reactor 会优先处理 IO 事件，对于执行异步任务的时间，Reactor 有一个配置来设置处理 IO 事件和执行异步任务的时间比例（默认一比一），随后执行异步任务。

## 参考资料

* [Java NIO 核心知识总结](https://javaguide.cn/java/io/nio-basis.html)
* [Java NIO：Buffer、Channel 和 Selector](https://www.javadoop.com/post/java-nio)
* [《Scalable IO in Java》译文](https://www.cnblogs.com/dafanjoy/p/11217708.html)
* [Reactor 典型的 NIO 编程模型](https://www.cnblogs.com/chuonye/p/10725372.html)
* [聊聊Netty那些事儿之从内核角度看IO模型](https://www.cnblogs.com/binlovetech/p/16439838.html)
* [一文聊透 Netty 核心引擎 Reactor 的运转架构](https://www.cnblogs.com/binlovetech/p/16444271.html)

---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
