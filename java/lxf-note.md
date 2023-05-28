# LXF Java note

https://www.liaoxuefeng.com/wiki/1252599548343744

## 2. 面向对象编程

### 2.1 面向对象基础

#### 包

##### 编译器查找类的步骤

Java编译器最终编译出的`.class`文件只使用*完整类名*，因此，在代码中，当编译器遇到一个`class`名称时：

- 如果是完整类名，就直接根据完整类名查找这个`class`；
- 如果是简单类名，按下面的顺序依次查找：
  - 查找当前`package`是否存在这个`class`；
  - 查找`import`的包是否包含这个`class`；
  - 查找`java.lang`包是否包含这个`class`。

如果按照上面的规则还无法确定类名，则编译报错。

##### 编译和运行

```shell
work
├── bin
└── src
    └── com
        └── itranswarp
            ├── sample
            │   └── Main.java
            └── world
                └── Person.java
```

其中，`bin`目录用于存放编译后的`class`文件，`src`目录按包结构存放Java源码，我们怎么一次性编译这些Java源码呢？

首先，确保当前目录是`work`目录，即存放`src`和`bin`的父目录：

```bash
$ ls
bin src
```

然后，编译`src`目录下的所有Java文件：

```bash
$ javac -d ./bin src/**/*.java
```

命令行`-d`指定输出的`class`文件存放`bin`目录，后面的参数`src/**/*.java`表示`src`目录下的所有`.java`文件，包括任意深度的子目录。

注意：Windows不支持`**`这种搜索全部子目录的做法，所以在Windows下编译必须依次列出所有`.java`文件：

```powershell
C:\work> javac -d bin src\com\itranswarp\sample\Main.java src\com\itranswarp\world\Persion.java
```

如果编译无误，则`javac`命令没有任何输出。可以在`bin`目录下看到如下`class`文件：

```ascii
bin
└── com
    └── itranswarp
        ├── sample
        │   └── Main.class
        └── world
            └── Person.class
```

现在，我们就可以直接运行`class`文件了。根据当前目录的位置确定classpath，例如，当前目录仍为`work`，则classpath为`bin`或者`./bin`：

```bash
$ java -cp bin com.itranswarp.sample.Main 
Hello, world!
```

#### 内部类

Inner Class的实例不能单独存在，必须依附于一个Outer Class

```java
        Outer outer = new Outer("Nested"); // 实例化一个Outer
        Outer.Inner inner = outer.new Inner(); // 实例化一个Inner
```

Outer`类被编译为`Outer.class`，而`Inner`类被编译为`Outer$Inner.class。匿名类被编译为`Outer$1.class`。如果有多个匿名类，Java编译器会将每个匿名类依次命名为`Outer$1`、`Outer$2`、`Outer$3`……

静态内部类不再依附于`Outer`的实例，而是一个完全独立的类，因此无法引用`Outer.this`，但它可以访问`Outer`的`private`静态字段和静态方法。

#### classpath 和 jar

`classpath`是JVM用到的一个环境变量，它用来指示JVM如何搜索`class`。JVM需要知道，如果要加载一个`abc.xyz.Hello`的类，应该去哪搜索对应的`Hello.class`文件。

假设`classpath`是`.;C:\work\project1\bin;C:\shared`，当JVM在加载`abc.xyz.Hello`这个类时，会依次查找：

- <当前目录>\abc\xyz\Hello.class
- C:\work\project1\bin\abc\xyz\Hello.class
- C:\shared\abc\xyz\Hello.class

`classpath`的设定方法有两种：

* 在系统环境变量中设置`classpath`环境变量，不推荐；

* 在启动JVM时设置`classpath`变量，推荐。（实际上就是给`java`命令传入`-classpath`或`-cp`参数）

不要设置`classpath`！默认的当前目录`.`对于绝大多数情况都够用了。

不要把任何Java核心库添加到classpath中！（如 `rt.jar`）JVM根本不依赖classpath加载核心库！

##### jar 包

jar包实际上就是一个zip格式的压缩文件，而jar包相当于目录。如果我们要执行一个jar包的`class`，就可以把jar包放到`classpath`中

jar包还可以包含一个特殊的`/META-INF/MANIFEST.MF`文件，`MANIFEST.MF`是纯文本，可以指定`Main-Class`和其它信息。JVM会自动读取这个`MANIFEST.MF`文件，如果存在`Main-Class`，我们就不必在命令行指定启动的类名，而是用更方便的命令：

```
java -jar hello.jar
```

#### class 版本

每个版本的JVM，它能执行的class文件版本也不同。例如，Java 11对应的class文件版本是55，而Java 17对应的class文件版本是61。（最多支持到版本61）

可以用Java 17编译一个Java程序，指定输出的class版本要兼容Java 11（即class版本55）。

* 在`javac`命令行中用参数`--release`设置：

    ```bash
    $ javac --release 11 Main.java
    ```

* 用参数`--source`指定源码版本，用参数`--target`指定输出class版本：

  ```bash
  $ javac --source 9 --target 11 Main.java
  ```

​		（如果使用Java 17的JDK编译，它会把源码视为Java 9兼容版本，并输出class为Java 11兼容版本。）

### 2.2 Java 核心类

#### 字符串和编码

* ASCII：美国国家标准学会（American National Standard Institute：ANSI）制定了一套英文字母、数字和常用符号的编码，它占用一个字节，编码范围从`0`到`127`，最高位始终为`0`，称为`ASCII`编码。例如，字符`'A'`的编码是`0x41`，字符`'1'`的编码是`0x31`。
* GB2312：使用两个字节表示一个汉字，其中第一个字节的最高位始终为`1`，以便和`ASCII`编码区分开。例如，汉字`'中'`的`GB2312`编码是`0xd6d0`。
* Unicode：为了统一全球所有语言的编码，全球统一码联盟发布了`Unicode`编码，它把世界上主要语言都纳入同一个编码。

#### StringBuilder

`StringBuilder`，它是一个可变对象，可以预分配缓冲区，往`StringBuilder`中新增字符时，不会创建新的临时对象。

对于普通的字符串`+`操作，并不需要我们将其改写为`StringBuilder`，因为Java编译器在编译时就自动把多个连续的`+`操作编码为`StringConcatFactory`的操作。在运行期，`StringConcatFactory`会自动把字符串连接操作优化为数组复制或者`StringBuilder`操作。

#### StringJoiner

`StringJoiner`：分隔符拼接数组，可以指定开头和结尾。

`String`还提供了一个静态方法`join()`，这个方法在内部使用了`StringJoiner`来拼接字符串，在不需要指定“开头”和“结尾”的时候，用`String.join()`更方便。

#### 包装类型

Java的数据类型分两种：基本类型和引用类型。包装类型可以把基本类型变成引用类型。

Java编译器直接把`int`变为`Integer`的赋值写法，称为自动装箱（Auto Boxing），反过来，把`Integer`变为`int`的赋值写法，称为自动拆箱（Auto Unboxing）。

自动装箱和自动拆箱只发生在编译阶段，目的是为了少写代码。

#### 枚举类

`enum`类型的每个常量在JVM中只有一个唯一实例，所以可以直接用`==`比较

通过`name()`获取常量定义的字符串，注意不要使用`toString()`

通过`ordinal()`返回常量定义的顺序（无实质意义）

## 3. 异常处理

#### Java 的异常

```
                     ┌───────────┐
                     │  Object   │
                     └───────────┘
                           ▲
                           │
                     ┌───────────┐
                     │ Throwable │
                     └───────────┘
                           ▲
                 ┌─────────┴─────────┐
                 │                   │
           ┌───────────┐       ┌───────────┐
           │   Error   │       │ Exception │
           └───────────┘       └───────────┘
                 ▲                   ▲
         ┌───────┘              ┌────┴──────────┐
         │                      │               │
┌─────────────────┐    ┌─────────────────┐┌───────────┐
│OutOfMemoryError │... │RuntimeException ││IOException│...
└─────────────────┘    └─────────────────┘└───────────┘
                                ▲
                    ┌───────────┴─────────────┐
                    │                         │
         ┌─────────────────────┐ ┌─────────────────────────┐
         │NullPointerException │ │IllegalArgumentException │...
         └─────────────────────┘ └─────────────────────────┘
```

* `Error`表示严重的错误，程序对此一般无能为力

* `Exception`则是运行时的错误，它可以被捕获并处理

- 必须捕获的异常，包括`Exception`及其子类，但不包括`RuntimeException`及其子类，这种类型的异常称为Checked Exception。
- 不需要捕获的异常，包括`Error`及其子类，`RuntimeException`及其子类。

#### 抛出异常

如果同时在 `catch` 和 `finally` 中抛出异常，`finally`抛出异常后，原来在`catch`中准备抛出的异常就“消失”了，因为只能抛出一个异常。没有被抛出的异常称为“被屏蔽”的异常（Suppressed Exception）。

通常不要在`finally`中抛出异常。如果在`finally`中抛出异常，应该原始异常加入到原有异常中。调用方可通过`Throwable.getSuppressed()`获取所有添加的被屏蔽异常。

```java
public class Main {
    public static void main(String[] args) throws Exception {
        Exception origin = null;
        try {
            System.out.println(Integer.parseInt("abc"));
        } catch (Exception e) {
            origin = e;
            throw e;
        } finally {
            Exception e = new IllegalArgumentException();
            if (origin != null) {
                e.addSuppressed(origin);
            }
            throw e;
        }
    }
}
```

## 4. 反射

#### Class 类

`class`（包括`interface`）的本质是数据类型（`Type`）。

`class`是由JVM在执行过程中动态加载的。JVM在**第一次**读取到一种`class`类型时，将其加载进内存。每加载一种`class`，JVM就为其创建一个`Class`类型的实例，并关联起来。`Class`实例在JVM中是唯一的。

`Class`类的构造方法是`private`，只有JVM能创建`Class`实例，我们自己的Java程序是无法创建`Class`实例的。

---

数组（例如`String[]`）也是一种类，而且不同于`String.class`，它的类名是`[Ljava.lang.String`。

JVM为每一种基本类型如`int`也创建了`Class`实例，通过`int.class`访问。

---

##### 动态加载

JVM在执行Java程序的时候，并不是一次性把所有用到的 `class` 全部加载到内存，而是第一次需要用到 `class` 时（程序执行到）才加载。

通过该特性，可以在运行时根据条件加载不同的实现类。

#### 访问字段

- `Field getField(name)`：根据字段名获取某个public的field（包括父类）
- `Field getDeclaredField(name)`：根据字段名获取当前类的某个field（不包括父类）
- `Field[] getFields()`：获取所有public的field（包括父类）
- `Field[] getDeclaredFields()`：获取当前类的所有field（不包括父类）

#### 调用方法

- `Method getMethod(name, Class...)`：获取某个`public`的`Method`（包括父类）
- `Method getDeclaredMethod(name, Class...)`：获取当前类的某个`Method`（不包括父类）
- `Method[] getMethods()`：获取所有`public`的`Method`（包括父类）
- `Method[] getDeclaredMethods()`：获取当前类的所有`Method`（不包括父类）

#### 获取继承关系

- `Class getSuperclass()`：获取父类类型；
- `Class[] getInterfaces()`：获取当前类实现的所有接口。

* 通过`Class`对象的`isAssignableFrom()`方法可以判断一个向上转型是否可以实现。

#### 动态代理

不编写实现类，在运行期创建某个`interface`的实例

通过`Proxy`创建代理对象，然后将接口方法“代理”给`InvocationHandler`。

```java
public class Main {
    public static void main(String[] args) {
        InvocationHandler handler = new InvocationHandler() {
            @Override
            public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                System.out.println(method);
                if (method.getName().equals("morning")) {
                    System.out.println("Good morning, " + args[0]);
                }
                return null;
            }
        };
        Hello hello = (Hello) Proxy.newProxyInstance(
            Hello.class.getClassLoader(), // 传入ClassLoader
            new Class[] { Hello.class }, // 传入要实现的接口
            handler); // 传入处理调用方法的InvocationHandler
        hello.morning("Bob");
    }
}

interface Hello {
    void morning(String name);
}
```

## 5. 注解

#### 定义注解

```java
@Target({						// 定义Annotation能够被应用于源码的哪些位置
    ElementType.TYPE,			// 类或接口
    ElementType.FIELD,			// 字段
    ElementType.METHOD,			// 方法
    ElementType.CONSTRUCTOR,	// 构造方法
    ElementType.PARAMETER		// 方法参数
})
@Retention(RetentionPolicy.RUNTIME)
public @interface Report {
    int type() default 0;
    String level() default "info";
    String value() default "";
}
```

