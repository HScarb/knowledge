# Reactor 模式的 Java 实现（feat. Scalable IO in Java - Doug Lea）

## 1. 背景

Doug Lea 在 [Scalable IO in Java](https://gee.cs.oswego.edu/dl/cpjslides/nio.pdf) 的 PPT 中描述了 Reactor 编程模型的思想，大部分 NIO 框架和一些中间件的 NIO 编程都与它一样或是它的变体，包括 Netty。

本文将介绍 Reactor 编程模型使用 Java NIO 的三种实现，并详解对应源码。

## 2. 传统服务端设计模式

一般的 Web 服务端或分布式服务端等应用中，大都具备这些处理流程：读请求、解码、处理和计算、编码、发送响应。

在传统服务端设计中，对每个新的客户端连接都会启动一个新的线程去处理，在**每个线程中串行执行上述处理流程**。这种编程方式也就是 BIO。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202405222338292.png)

```java
class Server implements Runnable {
    public void run() {
        try {
            ServerSocket ss = new ServerSocket(PORT);
            while (!Thread.interrupted())
                // 当有新的客户端连接时，accept()方法会返回一个Socket对象，表示与客户端的连接
                // 创建一个新的线程来处理该连接
                new Thread(new Handler(ss.accept())).start();
            // or, single-threaded, or a thread pool
        } catch (IOException ex) {
            /* ... */ 
        }
    }

    /**
     * 用于处理单个客户端连接的具体逻辑
     */
    static class Handler implements Runnable {
        final Socket socket;

        Handler(Socket s) {
            socket = s;
        }

        public void run() {
            try {
                byte[] input = new byte[MAX_INPUT];
                // 从客户端读取数据
                socket.getInputStream().read(input);
                // 处理客户端发送的数据
                byte[] output = process(input);
                // 将处理结果发送回客户端
                socket.getOutputStream().write(output);
            } catch (IOException ex) {
                /* ... */ 
            }
        }

        // 处理客户端发送的命令
        private byte[] process(byte[] cmd) {
            /* ... */ 
        }
    }
}
```

上述代码中，为每个客户端连接都创建一个 Handler 线程，在 Handler 中处理读请求、解码、处理和计算、编码、发送响应的所有逻辑。

但是上述程序存在缺陷：

1. **线程资源消耗高**：每个客户端连接都会创建一个线程，在高并发场景下会导致大量线程创建和销毁，消耗大量系统资源。线程上下文切换开销也会随之增加。
2. **阻塞式 I/O**：`accept()`、`read()`和`write()`方法都是阻塞式的，这意味着线程在等待I/O操作完成时会被阻塞，无法执行其他任务。这样会导致资源利用率低下。
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

## 4. Java NIO

上面提到 java.nio 包提供了非阻塞以及事件驱动机制的支持，是实现 Reactor 模式必不可少的依赖。在介绍 Reactor 模式之前先来简单回顾一下 Java NIO，便于理解后面的代码。

Java NIO 指 “New I/O”，或者说指 `java.nio` 包，它是 Java 1.4 中引入的一套新的 I/O API。也有说 Java NIO 中的 NIO 指 “Non-blocking I/O” 的，我认为不太准确。它提供了实现 Non-blocking I/O 的特性和工具，但它不仅仅局限于 Non-blocking I/O，还包括其他许多功能。

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
  *  `SelectionKey register(Selector sel, int ops)`：Channel 的方法，用于注册 Channel 到 Selector。第二个参数可以是上面 4 种类型的事件中的一种或几种。
  * `SelectionKey`：注册后返回的选择键，当中包含这些方法：
    * `interestOps()`：监听事件的集合
    * `readyOps()`：当前收到的事件集合
    * `channel()`：被注册的通道
    * `selector()`：注册到的选择器
    * `attachment()`：附加的一个对象（可选）。在 Reactor 模式中，会把 Acceptor 添加到 Selector 中，Acceptor 是用于处理客户端连接的组件，attach 到 Selector 上之后就可以在客户端连接事件到达时取出 Acceptor，处理客户端连接。
  * `select()` ：选择下一个事件，它会一直阻塞直到下一个事件到达。
  * `selectedKeys()`：当 `select` 方法返回，表示一个或多个通道已经收到监听的事件，可以通过 `selectedKeys().iterator().next().channel()` 方法访问这些通道。

## 5. 单线程 Reactor

Reactor 是一种设计模式，它使用了上面所说的优化思想：分而治之和事件驱动，旨在编写更可伸缩高性能的应用。[wikipedia](https://en.wikipedia.org/wiki/Reactor_pattern) 对其定义如下：

> Reactor 是一个或多个输入事件的处理模式，用于处理并发传递给服务处理程序的服务请求。服务处理程序判断传入请求发生的事件，并将它们同步的分派给关联的请求处理程序。

Reactor 模式应用中设置了三种类型的线程：

- Reactor 线程：轮询通知发生 IO 的通道，并分派合适的 Handler 处理。
- IO 线程：执行实际的读写操作
- 业务线程：执行应用程序的业务逻辑

---

### 5.1 设计

下图是 Reactor 单线程版本的基本设计

![单线程版本](https://images2018.cnblogs.com/blog/1424165/201808/1424165-20180803142201320-1610004538.png)

其中橙色的 Reactor 为一个线程，负责响应客户端请求事件。每当收到一个客户端连接，Reactor 会让 Acceptor 组件处理。

绿色的 Acceptor 组件与 Reactor 运行在同一线程中，负责将客户端连接分发给 Handler 处理（图中的 dispatch 过程）。

Handler 组件负责处理读取、解码、计算、编码、响应整个流程，它也与 Reactor 运行在同一线程中。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202405230024138.png)

单线程版本就是用一个线程完成事件的通知、读取和响应过程、业务处理。

### 5.2 Reactor 线程初始化

在单线程 Reactor 中，只会初始化一个线程，即 Reactor 线程，由它来调用 Acceptor 实例分发连接事件，Acceptor 继续创建 Handler 进行请求处理。

```java
public class Reactor implements Runnable {
    /**
     * 选择器，nio 组件，通知 Channel 就绪的事件
     */
    final Selector selector;

    /**
     * TCP 对应的服务端通道，用于监听某个端口进来的请求
     */
    final ServerSocketChannel serverSocket;

    public Reactor(int port) throws IOException {
        selector = Selector.open();
        serverSocket = ServerSocketChannel.open();
        serverSocket.socket().bind(new InetSocketAddress(port)); // 绑定端口
        serverSocket.configureBlocking(false); // 设置成非阻塞模式
        // 注册并关注一个 IO 事件，这里是接收连接
        SelectionKey sk = serverSocket.register(selector, SelectionKey.OP_ACCEPT);
        // 将 Acceptor 作为附件关联到 SelectionKey 上，用于在事件发生时取出，让 Acceptor 去分发连接给 Handler
        sk.attach(new Acceptor());
    }
}
```

### 5.3 Reactor 线程主循环

```java
public void run() { // normally in a new Thread
    try {
        while (!Thread.interrupted()) { // 死循环
            selector.select(); // 阻塞，直到有通道事件就绪
            Set<SelectionKey> selected = selector.selectedKeys(); // 拿到就绪通道 SelectionKey 的集合
            Iterator<SelectionKey> it = selected.iterator();
            while (it.hasNext()) {
                SelectionKey skTmp = it.next();
                dispatch(skTmp); // 分发
            }
            selected.clear(); // 清空就绪通道的 key
        }
    } catch (IOException ex) {
        ex.printStackTrace();
    }
}

void dispatch(SelectionKey k) {
    Runnable r = (Runnable) (k.attachment()); // 获取key关联的处理器
    if (r != null) {
        r.run(); // 执行处理
    }
}
```

主循环中，使用 nio 的 Selector，它底层使用了操作系统的多路复用技术，用一个线程处理多个客户端连接。select() 方法阻塞等待新的关注的事件（客户端连接）被触发。一旦接受到连接事件，调用 dispatch 方法，取出之前关联到 SelectionKey 上的 Acceptor 附件，并执行它进行请求分发。

### 5.4 Acceptor 请求分发

```java
/**
 * 处理连接建立事件
 */
class Acceptor implements Runnable {
    @Override
    public void run() {
        try {
            SocketChannel sc = serverSocket.accept(); // 接收连接，非阻塞模式下，没有连接直接返回 null
            if (sc != null) {
                // 把提示发到界面
                sc.write(ByteBuffer.wrap(
                    "Implementation of Reactor Design Partten by tonwu.net\r\nreactor> ".getBytes()));
                System.out.println("Accept and handler - " + sc.socket().getLocalSocketAddress());
                new BasicHandler(selector, sc); // 单线程处理连接
            }
        } catch (IOException ex) {
            ex.printStackTrace();
        }
    }
}
```

Acceptor 组件负责请求分发，将客户端连接分发给 Handler 处理。注意这里没有新建线程，Acceptor 的逻辑还是与 Reactor 在同一线程中运行。

### 5.5 Handler 初始化

```java
/**
 * 单线程基本处理器
 *
 * @author tongwu.net
 * @see Reactor
 */
public class BasicHandler implements Runnable {
    public SocketChannel socket;
    public SelectionKey sk;
    ByteBuffer input = ByteBuffer.allocate(MAXIN);
    ByteBuffer output = ByteBuffer.allocate(MAXOUT);
    // 定义服务的逻辑状态
    static final int READING = 0, SENDING = 1, CLOSED = 2;
    int state = READING;
    public BasicHandler(Selector sel, SocketChannel sc) throws IOException {
        socket = sc;
        sc.configureBlocking(false); // 设置非阻塞
        // Optionally try first read now
        sk = socket.register(sel, 0); // 注册通道
        sk.interestOps(SelectionKey.OP_READ); // 绑定要处理的事件
        sk.attach(this); // 管理事件的处理程序

        sel.wakeup(); // 唤醒 select() 方法
    }
}
```

Handler 负责处理 I/O 操作和业务处理，这里初始化 Handler。

1. 将客户端的 TCP 通道（`SocketChannel`）设置非阻塞并且将它注册到之前的 `Selector` 上
2. 监听读取操作，表示 SocketChannel 有数据可读时 `Selector` 返回该 `SelectionKey`
3. 在 `SelectionKey` 上附上自己，以在读取数据时调用 Handler 的 `run` 方法
4. 唤醒可能正在阻塞的 `select()` 方法，确保新注册的 `SelectionKey` 立即生效

### 5.6 Handler 执行 I/O 操作和业务处理

Handler 中包含 I/O 操作（read 和 write）和业务操作（process）。

```java
@Override
public void run() {
    try {
        if (state == READING) {
            read(); // 此时通道已经准备好读取字节
        } else if (state == SENDING) {
            send(); // 此时通道已经准备好写入字节
        }
    } catch (IOException ex) {
        // 关闭连接
        try {
            sk.channel().close();
        } catch (IOException ignore) {
        }
    }
}

/**
 * 从通道读取字节
 */
protected void read() throws IOException {
    input.clear(); // 清空接收缓冲区
    int n = socket.read(input);
    if (inputIsComplete(n)) {// 如果读取了完整的数据
        process();
        // 待发送的数据已经放入发送缓冲区中

        // 更改服务的逻辑状态以及要处理的事件类型
        sk.interestOps(SelectionKey.OP_WRITE);
    }
}

/**
 * 根据业务处理结果，判断如何响应
 *
 * @throws EOFException 用户输入 ctrl+c 主动关闭
 */
protected void process() throws EOFException {
    if (state == CLOSED) {
        throw new EOFException();
    } else if (state == SENDING) {
        String requestContent = request.toString(); // 请求内容
        byte[] response = requestContent.getBytes(StandardCharsets.UTF_8);
        output.put(response);
    }
}

/**
 * 发送响应
 */
protected void send() throws IOException {
    int written = -1;
    output.flip();// 切换到读取模式，判断是否有数据要发送
    if (output.hasRemaining()) {
        written = socket.write(output);
    }

    // 检查连接是否处理完毕，是否断开连接
    if (outputIsComplete(written)) {
        sk.channel().close();
    } else {
        // 否则继续读取
        state = READING;
        // 把提示发到界面
        socket.write(ByteBuffer.wrap("\r\nreactor> ".getBytes()));
        sk.interestOps(SelectionKey.OP_READ);
    }
}
```

## 6. 多线程 Reactor

Reactor 作用就是要迅速的触发 Handler ，在单线程 Reactor 中，Handler 与 Reactor 处于同一线程，Handler 进行业务处理的过程会导致 Reactor 变慢。根据上面分而治之的优化思想，可以将业务处理过程（非 IO 操作）从 Reactor 线程中拆出来，到单独的 Handler 线程池中处理。下图是 Reactor 的多线程版本。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202406020332997.png)

多线程版本将业务处理和 I/O 操作进行分离，Reactor 线程只关注事件分发和实际的 IO 操作，业务处理如协议的编解码都分配给线程池处理。如上图所示，decode、compute、encode 的业务处理过程拆分到单独的 Handler 线程池去处理。

### 6.1 Handler 使用线程池

```java
public class MultithreadHandler extends BasicHandler {
    static Executor workPool = Executors.newFixedThreadPool(5);
    static final int PROCESSING = 4;
    private Object lock = new Object();

    public MultithreadHandler(Selector sel, SocketChannel sc) throws IOException {
        super(sel, sc);
    }

    @Override
    public void read() throws IOException {
        // 为什么要同步？Processer 线程处理时通道还有可能有读事件发生
        // 保护 input ByteBuffer 不会重置和状态的可见性
        synchronized (lock) {
            input.clear();
            int n = socket.read(input);
            if (inputIsComplete(n)) {

                // 读取完毕后将后续的处理交给
                state = PROCESSING;
                workPool.execute(new Processer());
            }
        }
    }

    private void processAndHandOff() {
        synchronized (lock) {
            try {
                process();
            } catch (EOFException e) {
                // 直接关闭连接
                try {
                    sk.channel().close();
                } catch (IOException e1) {
                }
                return;
            }

            // 最后的发送还是交给 Reactor 线程处理
            state = SENDING;
            sk.interestOps(SelectionKey.OP_WRITE);

            // 这里需要唤醒 Selector，因为当把处理交给 workpool 时，Reactor 线程已经阻塞在 select() 方法了， 注意
            // 此时该通道感兴趣的事件还是 OP_READ，这里将通道感兴趣的事件改为 OP_WRITE，如果不唤醒的话，就只能在
            // 下次 select 返回时才能有响应了，当然了也可以在 select 方法上设置超时
            sk.selector().wakeup();
        }
    }

    class Processer implements Runnable {
        @Override
        public void run() {
            processAndHandOff();
        }
    }
}
```

## 7. 主从 Reactor

多线程 Reactor 的情况下，可能会有这样的情况发生：Handler 线程池中业务处理很快，大部分的时间都花在 Reactor 线程处理 I/O 上，导致 CPU 闲置，降低了响应速度。这里也应用分而治之的优化方法，把 I/O 处理的步骤从 Reactor 线程中拆分出来，用线程池去处理，

主从 Reactor 版本设计了一个 **主Reactor** 用于处理连接接收事件，多个 **从Reactor** 处理实际的 I/O，分工合作，匹配 CPU 和 IO 速率。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202406020358316.png)

### 7.1 Reactor 类实现

Reactor 类作为 main reactor 和 sub reactor 的实现类，要同时满足 main reactor 和 sub reactor 的运行逻辑。

* main reactor：运行时使用 Selector 阻塞等待新的连接事件，新的连接事件到达则调用附加在其 Selector 上的 Acceptor 去分发连接给 sub reactor

* sub reactor：运行时使用 Selector 阻塞等待新的 READ 事件，新的 READ 事件到达则调用附加在其 Selector 上的 Handler 去处理

* 此外，main reactor 还要处理 sub reactor 的注册事件。即 sub reactor 收到 main reactor 分发的新连接事件时，都要新建一个 Handler 并注册到 sub reactor 上。

  这里采用了生产-消费模式，注册时 main reactor 的 Acceptor 将 Handler 放进事件队列 `events`，sub reactor 运行时从队列中获取连接注册事件，将连接注册到 Handler。

```java
static class Reactor implements Runnable {
    private ConcurrentLinkedQueue<BasicHandler> events = new ConcurrentLinkedQueue<>();
    final Selector selector;

    public Reactor() throws IOException {
        selector = Selector.open();
    }

    @Override
    public void run() { // normally in a new Thread
        try {
            while (!Thread.interrupted()) { // 死循环
                BasicHandler handler = null;
                // sub reactor 处理连接注册事件
                while ((handler = events.poll()) != null) {
                    handler.socket.configureBlocking(false); // 设置非阻塞
                    // Optionally try first read now
                    // 将连接注册到 Handler 的 Selector，关注 READ 事件
                    handler.sk = handler.socket.register(selector, SelectionKey.OP_READ);
                    handler.sk.attach(handler); // 将 Read 事件的处理类（Handler）附加到 SelectionKey 上
                }
				
                // reactor 主循环
                selector.select(); // 阻塞，直到有通道事件就绪
                Set<SelectionKey> selected = selector.selectedKeys(); // 拿到就绪通道 SelectionKey 的集合
                Iterator<SelectionKey> it = selected.iterator();
                while (it.hasNext()) {
                    SelectionKey skTmp = it.next();
                    dispatch(skTmp); // 根据 key 的事件类型进行分发
                }
                selected.clear(); // 清空就绪通道的 key
            }
        } catch (IOException ex) {
            ex.printStackTrace();
        }
    }

    /**
     * 事件分发
     */
    void dispatch(SelectionKey k) {
        // 拿到通道注册时附加的对象，main reactor 附加的是 Acceptor，sub reactor 附加的是 Handler
        Runnable r = (Runnable) (k.attachment());
        // 执行附加对象的 run 方法，main reactor 的 Acceptor 将连接事件分发给 sub reactor，sub reactor 会调用 Handler 处理
        if (r != null) {
            r.run();
        }
    }

    /**
     * 用于 sub reactor 收到新的连接事件时注册 Handler
     */
    void reigster(BasicHandler basicHandler) {
        events.offer(basicHandler);
        selector.wakeup();
    }
}
```

### 7.2 Acceptor 类实现

Acceptor 类运行在 main reactor 的线程，用于分发客户端连接事件给 sub reactor。

始化时接受 main reactor 的 SelectionKey，启动服务端 ServerSocketChannel 并监听传入的端口。

run 方法执行连接事件分发的逻辑，

```java
class Acceptor implements Runnable {
    final Selector sel;
    final ServerSocketChannel serverSocket;

    /**
     * 初始化并配置 ServerSocketChannel，注册到 mainReactor 的 Selector 上
     *
     * @param sel mainReactor 的 Selector
     * @param port 监听的端口
     * @throws IOException
     */
    public Acceptor(Selector sel, int port) throws IOException {
        this.sel = sel;
        serverSocket = ServerSocketChannel.open();
        serverSocket.socket().bind(new InetSocketAddress(port)); // 绑定端口
        // 设置成非阻塞模式
        serverSocket.configureBlocking(false);
        // 注册到 main reactor 的 Selector 并关注处理 socket 连接事件
        SelectionKey sk = serverSocket.register(sel, SelectionKey.OP_ACCEPT);
        sk.attach(this);
        System.out.println("mainReactor-" + "Acceptor: Listening on port: " + port);
    }

    @Override
    public synchronized void run() {
        try {
            // 接收连接，非阻塞模式下，没有连接直接返回 null
            SocketChannel sc = serverSocket.accept();
            if (sc != null) {
                // 把提示发到界面
                sc.write(ByteBuffer.wrap("Implementation of Reactor Design Partten by tonwu.net\r\nreactor> ".getBytes()));
                System.out.println("mainReactor-" + "Acceptor: " + sc.socket().getLocalSocketAddress() + " 注册到 subReactor-" + next);
                // 将接收的连接注册到从 Reactor 上，在 register() 方法中会先将 Handler 放入事件队列，然后调用 wakeup 方法，避免一直被阻塞在 select() 方法上
                Reactor subReactor = subReactors[next];
                subReactor.reigster(new BasicHandler(sc));
                // new MultithreadHandler(subSel, sc);
                if (++next == subReactors.length) {
                    next = 0;
                }
            }
        } catch (Exception ex) {
            ex.printStackTrace();
        }
    }
}
```

### 7.3 主从 Reactor 启动

MultiReactor 作为主动 Reactor 启动类，初始化时创建一个 Reactor 对象作为 main reactor，N 个 Reactor 作为 sub reactor，并设置一个线程池实现 sub reactor 多线程运行。

在启动时在线程池中分别运行 main reactor 和 sub reactor，在 main reactor 注册 Acceptor，处理客户端连接事件。

```java
public class MultiReactor {
    private static final int POOL_SIZE = 3;
    // Reactor（Selector） 线程池，其中一个线程被 mainReactor 使用，剩余线程都被 subReactor 使用
    static Executor selectorPool = Executors.newFixedThreadPool(POOL_SIZE);
    // 主 Reactor，接收连接，把 SocketChannel 注册到从 Reactor 上
    private Reactor mainReactor;
    // 从 Reactors，用于处理 I/O，可使用 BasicHandler 和 MultiThreadHandler 两种处理方式
    private Reactor[] subReactors = new Reactor[POOL_SIZE - 1];

    int next = 0;

    public MultiReactor(int port) {
        try {
            this.port = port;
            mainReactor = new Reactor();

            for (int i = 0; i < subReactors.length; i++) {
                subReactors[i] = new Reactor();
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

	/**
     * 启动主从 Reactor，初始化并注册 Acceptor 到主 Reactor
     */
    public void start() throws IOException {
        Thread mrThread = new Thread(mainReactor);
        mrThread.setName("mainReactor");
        new Acceptor(mainReactor.getSelector(), port); // 将 ServerSocketChannel 注册到 mainReactor

        selectorPool.execute(mrThread);

        for (int i = 0; i < subReactors.length; i++) {
            Thread srThread = new Thread(subReactors[i]);
            srThread.setName("subReactor-" + i);
            selectorPool.execute(srThread);
        }
    }
}
```

## 8. Netty 中的 Reactor 模式

Netty 实现了三种 Reactor 模式，它使用 EventLoop 作为 Reactor 线程。

EventLoop 是一种**事件等待和处理的程序模型**，可以解决多线程资源消耗高的问题。它的运行模式是，每当事件发生时，应用程序都会将产生的事件放入事件队列当中，然后 EventLoop 会轮询从队列中取出事件执行或者将事件分发给相应的事件监听者执行。事件执行的方式通常分为**立即执行、延后执行、定期执行**几种。

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202406022343656.png)



## 参考资料

* [Java NIO 核心知识总结](https://javaguide.cn/java/io/nio-basis.html)
* [Java NIO：Buffer、Channel 和 Selector](https://www.javadoop.com/post/java-nio)
* [《Scalable IO in Java》译文](https://www.cnblogs.com/dafanjoy/p/11217708.html)
* [Reactor 典型的 NIO 编程模型](https://www.cnblogs.com/chuonye/p/10725372.html)
* [Netty 核心原理剖析与 RPC 实践](http://learn.lianglianglee.com/%E4%B8%93%E6%A0%8F/Netty%20%E6%A0%B8%E5%BF%83%E5%8E%9F%E7%90%86%E5%89%96%E6%9E%90%E4%B8%8E%20RPC%20%E5%AE%9E%E8%B7%B5-%E5%AE%8C)