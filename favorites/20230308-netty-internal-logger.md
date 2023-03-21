# Netty4.x Internal Logger 机制

http://www.ytbean.com/posts/netty-internal-logger/

Netty不像大多数框架，默认支持某一种日志实现。相反，Netty本身实现了一套日志机制，但这套日志机制并不会真正去打日志。相反，Netty自身的日志机制更像一个日志包装层。

# 日志框架检测顺序

Netty在启动的时候，会自动去检测当前Java进程的classpath下是否已经有其它的日志框架。
检查的顺序是：SLF4J -> Log4j -> jdk logging

先检查是否有slf4j，如果没有则检查是否有Log4j，如果上面两个都没有，则默认使用JDK自带的日志框架JDK Logging。
JDK的Logging就不用费事去检测了，直接拿来用了，因为它是JDK自带的。

> 注意到虽然Netty支持Common Logging，但在Netty本文所用的4.10.Final版本的代码里，没有去检测Common Logging，即使有支持Common Logging的代码存在。

# 日志框架检测细节

在Netty自身的代码里面，如果需要打日志，会通过以下代码来获得一个logger，以`io.netty.bootstrap.Bootstrap`这个类为例，读者可以翻开这个类瞧一瞧。

```java
private static final InternalLogger logger = InternalLoggerFactory.getInstance(Bootstrap.class);  
```

要知道Netty是怎么得到logger的，关键就在于这个`InternalLoggerFactory`类了，可以看出来，所有的logger都是通过这个工厂类产生的。
翻开`InternalLoggerFactory`类的代码，可以看到类中有一个静态初始化块

```java
private static volatile InternalLoggerFactory defaultFactory;
static {
    final String name = InternalLoggerFactory.class.getName();
    InternalLoggerFactory f;
    try {
        f = new Slf4JLoggerFactory(true);
        f.newInstance(name).debug("Using SLF4J as the default logging framework");
        defaultFactory = f;
    } catch (Throwable t1) {
        try {
            f = new Log4JLoggerFactory();
            f.newInstance(name).debug("Using Log4J as the default logging framework");
        } catch (Throwable t2) {
            f = new JdkLoggerFactory();
            f.newInstance(name).debug("Using java.util.logging as the default logging framework");
        }
    }
    defaultFactory = f;
}  
```

Javaer们都知道，类的初始化块会在类**第一次被使用**的时候执行。那么什么时候称之为**第一次被使用**呢？比如说，静态方法被调用，静态变量被访问，或者调用构造函数。
当调用`InternalLoggerFactory.getInstance(Bootstrap.class)`**之前**，上面的静态块会被调用，而Netty对于当前应用所使用的日志框架的检测，就是在这短短的20几行代码里面实现。

首先从代码整体上可以看到，一个`try-catch`，在`catch`里面又嵌套了一个`try-catch`，这正好体现了日志框架的检测顺序：**先检测SLF4J，后检测Log4J，都没有的话，就直接使用JDK Logging**

## 检测SLF4J

在`f = new Slf4JLoggerFactory(true);`这里开始检测SLF4J是否存在。

```java
public class Slf4JLoggerFactory extends InternalLoggerFactory {
    public Slf4JLoggerFactory() {
    }
    Slf4JLoggerFactory(boolean failIfNOP) {
        assert failIfNOP; // Should be always called with true.
        // SFL4J writes it error messages to System.err. Capture them so that the user does not see such a message on
        // the console during automatic detection.
        final StringBuffer buf = new StringBuffer();
        final PrintStream err = System.err;
        try {
            System.setErr(new PrintStream(new OutputStream() {
                @Override
                public void write(int b) {
                    buf.append((char) b);
                }
            }, true, "US-ASCII"));
        } catch (UnsupportedEncodingException e) {
            throw new Error(e);
        }
        try {
            if (LoggerFactory.getILoggerFactory() instanceof NOPLoggerFactory) {
                throw new NoClassDefFoundError(buf.toString());
            } else {
                err.print(buf.toString());
                err.flush();
            }
        } finally {
            System.setErr(err);
        }
    }
    @Override
    public InternalLogger newInstance(String name) {
        return new Slf4JLogger(LoggerFactory.getLogger(name));
    }
}  
```

在这里可以看到`Slf4JLoggerFactory`是`InternalLoggerFactory`的一个子类实现。
如果应用的classpath下存在slf4j相关的jar包，那么当slf4j的日志框架初始化的时候，如果产生了什么错误，将会通过`System.err`输出；
对于Netty来讲，即使slf4j初始化失败，它也不愿让用户看到错误输出，因为对netty来说，slf4j初始化失败并不代表netty不能选择其它日志框架；
所以可以从上面代码中看到，一开始先把`System.err`给替换掉，让err输出被重定向到一个`StringBuffer`，如下代码所示：

```java
// SFL4J writes it error messages to System.err. Capture them so that the user does not see such a message on
// the console during automatic detection.
final StringBuffer buf = new StringBuffer();
final PrintStream err = System.err;
try {
    System.setErr(new PrintStream(new OutputStream() {
        @Override
        public void write(int b) {
            buf.append((char) b);
        }
    }, true, "US-ASCII"));
} catch (UnsupportedEncodingException e) {
    throw new Error(e);
}
```

我们已经明白上面这段代码，就是为了重定向err输出，不让用户轻易看到。接下来看这些代码：

```java
try {
    if (LoggerFactory.getILoggerFactory() instanceof NOPLoggerFactory) {
        throw new NoClassDefFoundError(buf.toString());
    } else {
        err.print(buf.toString());
        err.flush();
    }
} finally {
    System.setErr(err);
}
```

首先可以看到一个`try-finally`结构，finally块里把`System.err`复位了，也就是说在初始化SLF4J之后，无论发生什么事，都应该把System.err复位。
接下来看try块里面的代码：

```java
if (LoggerFactory.getILoggerFactory() instanceof NOPLoggerFactory) {
    throw new NoClassDefFoundError(buf.toString());
} else {
    err.print(buf.toString());
    err.flush();
}
```

解释这些代码之前，我们先要认识到，SLF4J其实是一个日志门面(facade)，它可以充当Log4j, Logback等日志框架的包装器。因此你的应用除了要有slf4j的依赖包，还要有其它具体的日志实现框架的依赖。例如下面是我的maven依赖，依赖了slf4j还有Logback。

```xml
<dependency>
    <groupId>org.slf4j</groupId>
    <artifactId>slf4j-api</artifactId>
    <version>${slf4j.version}</version>
</dependency>
<dependency>
    <groupId>ch.qos.logback</groupId>
    <artifactId>logback-core</artifactId>
    <version>${logback.version}</version>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>ch.qos.logback</groupId>
    <artifactId>logback-classic</artifactId>
    <version>${logback.version}</version>
    <scope>runtime</scope>
</dependency>  
```

如果只有slf4j，而没有logback，那么`LoggerFactory.getILoggerFactory() instanceof NOPLoggerFactory`就会为true，然后代码就会抛出`NoClassDefFoundError`。
如果连slf4j本身都没有呢？那么运行到`LoggerFactory.getLoggerFactory()`就已经抛出异常了，因为找不到这个`LoggerFactory`类。
以上便是检测SLF4J的整个过程。

## 检测Log4J

如果需要检测Log4J，则说明检测不到SLF4J的存在，或者是SLF4J不可以使用。
回到`InternalLoggerFactory`代码里：

```java
try {
    f = new Slf4JLoggerFactory(true);
    f.newInstance(name).debug("Using SLF4J as the default logging framework");
    defaultFactory = f;
} catch (Throwable t1) {
    try {
        f = new Log4JLoggerFactory();
        f.newInstance(name).debug("Using Log4J as the default logging framework");
    } catch (Throwable t2) {
        f = new JdkLoggerFactory();
        f.newInstance(name).debug("Using java.util.logging as the default logging framework");
    }
}  
```

Log4J的检测很简单，很直接，直接在`newInstance()`方法里加载`org.apache.log4j.Logger;`类，如果加载不到，直接抛异常，然后转而直接使用JDK Logging。

```java
public class Log4JLoggerFactory extends InternalLoggerFactory {
    @Override
    public InternalLogger newInstance(String name) {
        return new Log4JLogger(Logger.getLogger(name));
    }
}  
```

# 兼容性

## 日志级别

Netty的内部日志机制也自定义了日志打印级别，像日志的layout或者appender，则没有自己定义，完全交给底层的日志框架去做。

```java
public enum InternalLogLevel {
    /**
     * 'TRACE' log level.
     */
    TRACE,
    /**
     * 'DEBUG' log level.
     */
    DEBUG,
    /**
     * 'INFO' log level.
     */
    INFO,
    /**
     * 'WARN' log level.
     */
    WARN,
    /**
     * 'ERROR' log level.
     */
    ERROR
}  
```

这里会面临日志打印级别的兼容性问题，因为SLF4J，Log4J，以及JDK Logging，都有自己的日志打印级别，比如说JDK Logging，它的日志打印级别是这样的：

- SEVERE (highest value)
- WARNING
- INFO
- CONFIG
- FINE
- FINER
- FINEST (lowest value)

不仅数目对不上，而且名称也没对上。Netty采用的方式是，按级别的高低来匹配，比如Netty的DEBUG将会对应到JDK的FINE，以此做到级别的对应关系和兼容性。

## 消息格式化

SLF4J的Logger会有这样一种打日志的方式，采用**占位**的方式，举个例子：、

```java
logger.info("Hello, I m {}, I m the president of {}"，"Obama"，"America");
```

上面这行代码的日志输出结果是：

```log
Hello, I m Obama, I m the president of America
```

可以看到，**{}**大括号是一个占位符，其内容将会被后面的参数所代替。
但Log4J和JDK Logging并不支持这种占位的日志打印方式，因此Netty又自己搞了一下，让它的`InternalLogger`可以以占位的方式格式化日志输出信息。
详情可以参考`io.netty.util.internal.logging.MessageFormatter`这个类，到这里就不再展开了。