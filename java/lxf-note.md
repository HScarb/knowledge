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
@Retention(RetentionPolicy.RUNTIME)	// 注解生命周期，SOURCE：仅编译期；CLASS：仅 class 文件（默认）；RUNTIME：运行期
public @interface Report {
    int type() default 0;		// 参数和默认值
    String level() default "info";
    String value() default "";
}

@Repeatable						// 可以定义Annotation是否可重复
@Inherited						// 定义子类是否可继承父类定义的Annotation（父类使用注解子类是否也默认定义）
```

#### 处理注解

`@Retention` 配置的注解生命周期：

- `SOURCE` 类型的注解在编译期就被丢掉了；主要由编译器使用，一般不用
- `CLASS` 类型的注解仅保存在class文件中，它们不会被加载进JVM；主要由底层工具库使用，涉及到 class 的加载，一般很少用到
- `RUNTIME` 类型的注解会被加载进JVM，并且在运行期可以被程序读取；经常用到

利用反射 API 获取 Annotation

- `Class.getAnnotation(Class)`
- `Field.getAnnotation(Class)`
- `Method.getAnnotation(Class)`
- `Constructor.getAnnotation(Class)`

## 6. 泛型

#### Java 类型系统

```log
                      ┌────┐
                      │Type│
                      └────┘
                         ▲
                         │
   ┌────────────┬────────┴─────────┬───────────────┐
   │            │                  │               │
┌─────┐┌─────────────────┐┌────────────────┐┌────────────┐
│Class││ParameterizedType││GenericArrayType││WildcardType│
└─────┘└─────────────────┘└────────────────┘└────────────┘
```

* ParameterizedType: represents a parameterized type such as `Collection<String>`.
* GenericArrayType: represents an array type whose component type is either a parameterized type or a type variable.
* GenericArrayType: represents an array type whose component type is either a parameterized type or a type variable.

#### 编写泛型

静态方法：在`static`修饰符后面加一个`<T>`。注意不能引用泛型类型`<T>`，必须定义其他类型（例如`<K>`）来实现静态泛型方法；

#### 擦拭法

擦拭法：Java的泛型是由编译器在编译时实现的，编译器内部永远把所有类型`T`视为`Object`处理，但是，在需要转型的时候，编译器会根据`T`的类型自动为我们实行安全地强制转型。

* 不能是基本类型，例如：`int`；
* 不能获取带泛型类型的`Class`，例如：`Pair<String>.class`；
* 不能判断带泛型类型的类型，例如：`x instanceof Pair<String>`；
* 不能实例化`T`类型，例如：`new T()`。

---

子类可以获取父类的泛型类型`<T>`。

```java
    Class<IntPair> clazz = IntPair.class;
    Type t = clazz.getGenericSuperclass();
    if (t instanceof ParameterizedType) {
        ParameterizedType pt = (ParameterizedType) t;
        Type[] types = pt.getActualTypeArguments(); // 可能有多个泛型类型
        Type firstType = types[0]; // 取第一个泛型类型
        Class<?> typeClass = (Class<?>) firstType;
        System.out.println(typeClass); // Integer
    }
```

#### extends 通配符（上界通配符）

使用`<? extends Number>`的泛型定义称之为上界通配符（Upper Bounds Wildcards），即把泛型类型`T`的上界限定在`Number`了。

## 7. 集合

## 8. IO

#### File

Java标准库的`java.io.File`对象表示一个文件或者目录：

- 创建`File`对象本身不涉及IO操作；
- 可以获取路径／绝对路径／规范路径：`getPath()`/`getAbsolutePath()`/`getCanonicalPath()`；
  - 绝对路径可以表示成 `C:\Windows\System32\..\notepad.exe`，而规范路径就是把 `.` 和 `..` 转换成标准的绝对路径后的路径：`C:\Windows\notepad.exe`。
- 可以获取目录的文件和子目录：`list()`/`listFiles()`；
- 可以创建或删除文件和目录。
  - `createNewFile()` 创建一个新文件，用 `delete()` 删除该文件
  - `createTempFile()` 来创建一个临时文件，以及 `deleteOnExit()` 在JVM退出时自动删除该文件

* `Path`对象和`File`对象类似，但操作更加简单

#### InputStream

Java标准库的 `java.io.InputStream` 定义了所有输入流的超类。`java.io`包提供了所有同步IO的功能，即读取和写入是阻塞的。

* 最重要的 `read()` 虚拟方法读取输入流的下一个字节，并返回字节表示的 `int` 值（0~255）。读到末尾，返回 `-1`。 
* 利用缓冲区一次性读取多个字节效率往往要高很多。`InputStream`提供了两个重载方法来支持读取多个字节：
  - `int read(byte[] b)`：读取若干字节并填充到`byte[]`数组，返回读取的字节数
  - `int read(byte[] b, int off, int len)`：指定`byte[]`数组的偏移量和最大填充数

派生类：

- `FileInputStream` 实现了文件流输入；
- `ByteArrayInputStream` 在内存中模拟一个字节流输入。

使用 `try(resource)` 来保证 `InputStream` 正确关闭。

#### OutputStream

Java标准库的`java.io.OutputStream`定义了所有输出流的超类：

* `write(int b)` ：写入`int`最低 8 位表示字节的部分（相当于`b & 0xff`）到一个输出流。
* `flush()` ：清空输出流，并强制任何正在缓冲的输出字节被写入到底层输出设备。
  * 一些实现类（`BufferedOutputStream`）为了提高性能和效率，采用了内部缓冲区的机制。可能缓冲区满可能比较慢，需要手动调用`flush`。

派生类：

- `FileOutputStream` 实现了文件流输出；
- `ByteArrayOutputStream` 在内存中模拟一个字节流输出。
- `BufferedOutputStream` 使用了内部缓冲区来提高数据写入的效率。

某些情况下需要手动调用`OutputStream`的`flush()`方法来强制输出缓冲区。

使用`try(resource)`来保证`OutputStream`正确关闭。

#### Filter 模式

Java的IO标准库使用Filter模式为`InputStream`和`OutputStream`增加功能：

- 可以把一个`InputStream`和任意个`FilterInputStream`组合；
- 可以把一个`OutputStream`和任意个`FilterOutputStream`组合。

Filter模式可以在运行期动态增加功能（又称Decorator模式）。

#### 读取 classpath 资源

把资源存储在classpath中可以避免文件路径依赖；

`Class`对象的`getResourceAsStream()`可以从classpath中读取指定资源；

根据classpath读取资源时，需要检查返回的`InputStream`是否为`null`。

#### Reader

`Reader`定义了所有字符输入流的超类，和`InputStream`的区别是，`InputStream`是一个字节流，即以`byte`为单位读取，而`Reader`是一个字符流，即以`char`为单位读取：

- `FileReader`实现了文件字符流输入，使用时需要指定编码；
- `CharArrayReader`和`StringReader`可以在内存中模拟一个字符流输入。

`Reader`是基于`InputStream`构造的：可以通过`InputStreamReader`在指定编码的同时将任何`InputStream`转换为`Reader`。

总是使用`try (resource)`保证`Reader`正确关闭。

#### Writer

`Writer`定义了所有字符输出流的超类，它是带编码转换器的`OutputStream`，它把`char`转换为`byte`并输出。

- `FileWriter`实现了文件字符流输出；
- `CharArrayWriter`和`StringWriter`在内存中模拟一个字符流输出。

使用`try (resource)`保证`Writer`正确关闭。

`Writer`是基于`OutputStream`构造的，可以通过`OutputStreamWriter`将`OutputStream`转换为`Writer`，转换时需要指定编码。

## 14. Maven 基础

#### 依赖管理

| scope    | 说明                                          | 示例            |
| :------- | :-------------------------------------------- | :-------------- |
| compile  | 编译时需要用到该jar包（默认）                 | commons-logging |
| test     | 编译Test时需要用到该jar包                     | junit           |
| runtime  | 编译时不需要，但运行时需要用到                | mysql           |
| provided | 编译时需要用到，但运行时由JDK或某个服务器提供 | servlet-api     |

#### 构建流程

Maven通过lifecycle、phase和goal来提供标准的构建流程。

- lifecycle相当于Java的package，它包含一个或多个phase；
- phase相当于Java的class，它包含一个或多个goal；
- goal相当于class的method，它其实才是真正干活的。

##### phase

Maven的 lifecycle 由一系列 phase 构成，以内置的生命周期 `default` 为例，它包含以下 phase

- validate
- initialize
- generate-sources
- process-sources
- generate-resources
- process-resources
- **compile**
- process-classes
- generate-test-sources
- process-test-sources
- generate-test-resources
- process-test-resources
- test-compile
- process-test-classes
- **test**
- prepare-package
- **package**
- pre-integration-test
- integration-test
- post-integration-test
- verify
- **install**
- deploy

lifecycle `clean` 会执行3个phase：

- pre-clean
- clean （注意这个clean不是lifecycle而是phase）
- post-clean

---

* 使用 `mvn` 这个命令时，后面的参数是 phase，Maven 自动根据生命周期运行到指定的 phase。

* 可以指定多个phase，例如，运行`mvn clean package`，Maven先执行`clean`生命周期并运行到`clean`这个phase，然后执行`default`生命周期并运行到`package`这个phase。

##### goal

执行一个phase又会触发一个或多个goal：

| 执行的Phase | 对应执行的Goal                     |
| :---------- | :--------------------------------- |
| compile     | compiler:compile                   |
| test        | compiler:testCompile surefire:test |

通常情况，我们总是执行phase默认绑定的goal，因此不必指定goal。

#### 使用插件

执行每个phase，都是通过某个插件（plugin）来执行的，Maven本身其实并不知道如何执行`compile`，它只是负责找到对应的`compiler`插件，然后执行默认的`compiler:compile`这个goal来完成编译。

Maven已经内置了一些常用的标准插件：

| 插件名称 | 对应执行的phase |
| :------- | :-------------- |
| clean    | clean           |
| compiler | compile         |
| surefire | test            |
| jar      | package         |

如果标准插件无法满足需求，我们还可以使用自定义插件。使用自定义插件的时候，需要声明。例如，使用`maven-shade-plugin`可以创建一个可执行的jar，要使用这个插件，需要在`pom.xml`中声明它：

```xml
<project>
    ...
	<build>
		<plugins>
			<plugin>
				<groupId>org.apache.maven.plugins</groupId>
				<artifactId>maven-shade-plugin</artifactId>
                <version>3.2.1</version>
				<executions>
					<execution>
						<phase>package</phase>
						<goals>
							<goal>shade</goal>
						</goals>
                            <configuration>
                                <transformers>
                                    <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
                                        <mainClass>com.itranswarp.learnjava.Main</mainClass>
                                    </transformer>
                                </transformers>
                            </configuration>
					</execution>
				</executions>
			</plugin>
		</plugins>
	</build>
</project>
```

#### Maven Wrapper

使用Maven Wrapper，可以为一个项目指定特定的Maven版本。

指定使用的Maven版本，使用下面的安装命令指定版本，例如`3.3.3`：

```bash
mvn -N io.takari:maven:0.7.6:wrapper -Dmaven=3.3.3
```

## 15. 网络编程

### 网络编程基础

如果两台计算机位于同一个网络，那么他们之间可以直接通信，因为他们的IP地址前段是相同的，也就是网络号是相同的。网络号是IP地址通过子网掩码过滤后得到的。例如：

某台计算机的IP是`101.202.99.2`，子网掩码是`255.255.255.0`，那么计算该计算机的网络号是：

```
IP = 101.202.99.2
Mask = 255.255.255.0
Network = IP & Mask = 101.202.99.0
```

### TCP 编程

Socket是一个抽象概念，一个应用程序通过一个Socket来建立一个远程连接，而Socket内部通过TCP/IP协议把数据传输到网络。

一个Socket就是由IP地址和端口号（范围是0～65535）组成，可以把Socket简单理解为IP地址加端口号。端口号总是由操作系统分配，它是一个0～65535之间的数字，其中，小于1024的端口属于*特权端口*，需要管理员权限，大于1024的端口可以由任意用户的应用程序打开。

#### 服务器端

Java标准库提供了`ServerSocket`来实现对指定IP和指定端口的监听。

```java
public class Server {
    public static void main(String[] args) throws IOException {
        // 监听指定端口
        ServerSocket ss = new ServerSocket(6666); 
        System.out.println("server is running...");
        // 使用一个无限循环来处理客户端的连接，接收新的连接，创建一个新的线程处理
        for (;;) {
            // 阻塞等待，有新的客户端连接进来后，就返回一个Socket实例，用来和刚连接的客户端通信
            Socket sock = ss.accept();
            System.out.println("connected from " + sock.getRemoteSocketAddress());
            Thread t = new Handler(sock);
            t.start();
        }
    }
}

class Handler extends Thread {
    Socket sock;

    public Handler(Socket sock) {
        this.sock = sock;
    }

    @Override
    public void run() {
        try (InputStream input = this.sock.getInputStream()) {
            try (OutputStream output = this.sock.getOutputStream()) {
                handle(input, output);
            }
        } catch (Exception e) {
            try {
                this.sock.close();
            } catch (IOException ioe) {
            }
            System.out.println("client disconnected.");
        }
    }

    private void handle(InputStream input, OutputStream output) throws IOException {
        var writer = new BufferedWriter(new OutputStreamWriter(output, StandardCharsets.UTF_8));
        var reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
        writer.write("hello\n");
        writer.flush();
        for (;;) {
            String s = reader.readLine();
            if (s.equals("bye")) {
                writer.write("bye\n");
                writer.flush();
                break;
            }
            writer.write("ok: " + s + "\n");
            writer.flush();
        }
    }
}
```

#### 客户端

```java
public class Client {
    public static void main(String[] args) throws IOException {
        Socket sock = new Socket("localhost", 6666); // 连接指定服务器和端口
        try (InputStream input = sock.getInputStream()) {
            try (OutputStream output = sock.getOutputStream()) {
                handle(input, output);
            }
        }
        sock.close();
        System.out.println("disconnected.");
    }

    private static void handle(InputStream input, OutputStream output) throws IOException {
        var writer = new BufferedWriter(new OutputStreamWriter(output, StandardCharsets.UTF_8));
        var reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
        Scanner scanner = new Scanner(System.in);
        System.out.println("[server] " + reader.readLine());
        for (;;) {
            System.out.print(">>> "); // 打印提示
            String s = scanner.nextLine(); // 读取一行输入
            writer.write(s);
            writer.newLine();
            writer.flush();
            String resp = reader.readLine();
            System.out.println("<<< " + resp);
            if (resp.equals("bye")) {
                break;
            }
        }
    }
}
```

### UDP 编程

UDP没有创建连接，数据包也是一次收发一个，所以没有流的概念。

在Java中使用UDP编程，仍然需要使用Socket，因为应用程序在使用UDP时必须指定网络接口（IP）和端口号。注意：UDP端口和TCP端口虽然都使用0~65535，但他们是两套独立的端口，即一个应用程序用TCP占用了端口1234，不影响另一个应用程序用UDP占用端口1234。

#### 服务器端

```java
DatagramSocket ds = new DatagramSocket(6666); // 监听指定端口
for (;;) { // 无限循环
    // 数据缓冲区:
    byte[] buffer = new byte[1024];
    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
    ds.receive(packet); // 收取一个UDP数据包
    // 收取到的数据存储在buffer中，由packet.getOffset(), packet.getLength()指定起始位置和长度
    // 将其按UTF-8编码转换为String:
    String s = new String(packet.getData(), packet.getOffset(), packet.getLength(), StandardCharsets.UTF_8);
    // 发送数据:
    byte[] data = "ACK".getBytes(StandardCharsets.UTF_8);
    packet.setData(data);
    ds.send(packet);
}
```

#### 客户端

```java
DatagramSocket ds = new DatagramSocket();
ds.setSoTimeout(1000);
ds.connect(InetAddress.getByName("localhost"), 6666); // 连接指定服务器和端口
// 发送:
byte[] data = "Hello".getBytes();
DatagramPacket packet = new DatagramPacket(data, data.length);
ds.send(packet);
// 接收:
byte[] buffer = new byte[1024];
packet = new DatagramPacket(buffer, buffer.length);
ds.receive(packet);
String resp = new String(packet.getData(), packet.getOffset(), packet.getLength());
ds.disconnect();
```

- 服务器端用`DatagramSocket(port)`监听端口；
- 客户端使用`DatagramSocket.connect()`指定远程地址和端口；
- 双方通过`receive()`和`send()`读写数据；
- `DatagramSocket`没有IO流接口，数据被直接写入`byte[]`缓冲区。

## 18. 函数式编程

允许把函数本身作为参数传入另一个函数，还允许返回一个函数。

#### Lambda 基础

单方法接口被称为 `FunctionalInterface`。

- Comparator
- Runnable
- Callable

接收 `FunctionalInterface` 作为参数的时候，可以把实例化的匿名类改写为Lambda表达式，能大大简化代码。

Lambda表达式的参数和返回值均可由编译器自动推断。

只定义了单方法的接口称之为 `FunctionalInterface`，用注解 `@FunctionalInterface` 标记。

#### 方法引用

`FunctionalInterface`允许传入：

- 接口的实现类（传统写法，代码较繁琐）；
- Lambda表达式（只需列出参数名，由编译器推断类型）；
- 符合方法签名的静态方法；
- 符合方法签名的实例方法（实例类型被看做第一个参数类型）；
- 符合方法签名的构造方法（实例类型被看做返回类型）。

`FunctionalInterface`不强制继承关系，不需要方法名称相同，只要求方法参数（类型和数量）与方法返回类型相同，即认为方法签名相同。

## 20. Web 开发

### Servlet 入门

```ascii
                 ┌───────────┐
                 │My Servlet │
                 ├───────────┤
                 │Servlet API│
┌───────┐  HTTP  ├───────────┤
│Browser│<──────>│Web Server │
└───────┘        └───────────┘
```

Web服务器处理TCP连接，解析HTTP协议。它实现了 Servlet API，使用户能够编写自己的 Servlet 来处理 HTTP 请求。

## 21. Spring 开发

### 21.1 IoC 容器

#### IoC 原理

组件中用 `new` 方式创建依赖实例的缺点：

* 高耦合性
* 难以测试：需要模拟依赖类的行为
* 资源管理问题：某些资源每次都实例化可能导致过载
* 重复代码
* 难以管理依赖关系

在 IoC 模式下，控制权从应用程序转移到了 IoC 容器，所有的组件不再由应用程序自己创建和配置，而是由 IoC 容器负责，这样，应用程序只需要直接使用已经创建好并配置好的组件。它解决了以下问题：

- 谁负责创建组件？
- 谁负责根据依赖关系组装组件？
- 销毁时，如何按依赖顺序正确销毁？

在Spring的IoC容器中，实现IoC的主要机制是依赖注入，依赖注入可以通过多种方式实现：

- Setter 注入：通过 setter 方法注入依赖。
- 构造方法注入：通过构造方法注入依赖。

在设计上，Spring的IoC容器是一个高度可扩展的无侵入容器。所谓无侵入，是指应用程序的组件无需实现Spring的特定接口，或者说，组件根本不知道自己在Spring的容器中运行。这种无侵入的设计有以下好处：

1. 应用程序组件既可以在Spring的IoC容器中运行，也可以自己编写代码自行组装配置；
2. 测试的时候并不依赖Spring容器，可单独进行测试，大大提高了开发效率。

#### 定制 Bean

Spring默认使用Singleton创建Bean，也可指定Scope为Prototype；

可将相同类型的Bean注入`List`或数组；

可用`@Autowired(required=false)`允许可选注入；

可用带`@Bean`标注的方法创建Bean；

可使用`@PostConstruct`和`@PreDestroy`对Bean进行初始化和清理；

相同类型的Bean只能有一个指定为`@Primary`，其他必须用`@Quanlifier("beanName")`指定别名；

注入时，可通过别名`@Quanlifier("beanName")`指定某个Bean；

可以定义`FactoryBean`来使用工厂模式创建Bean。

#### 使用 Resource

Spring提供了Resource类便于注入资源文件。

最常用的注入是通过classpath以`classpath:/path/to/file`的形式注入。

#### 使用条件装配

Spring允许通过`@Profile`配置不同的Bean；

Spring还提供了`@Conditional`来进行条件装配，Spring Boot在此基础上进一步提供了基于配置、Class、Bean等条件进行装配。

### 21.2 使用 AOP

而AOP是一种新的编程方式，它和OOP不同，OOP把系统看作多个对象的交互，AOP把系统分解为不同的关注点，或者称之为切面（Aspect）。

如何把切面织入到核心逻辑中？这正是AOP需要解决的问题。换句话说，如果客户端获得了`BookService`的引用，当调用`bookService.createBook()`时，如何对调用方法进行拦截，并在拦截前后进行安全检查、日志、事务等处理，就相当于完成了所有业务功能。

在Java平台上，对于AOP的织入，有3种方式：

1. 编译期：在编译时，由编译器把切面调用编译进字节码，这种方式需要定义新的关键字并扩展编译器，AspectJ就扩展了Java编译器，使用关键字aspect来实现织入；
2. 类加载器：在目标类被装载到JVM时，通过一个特殊的类加载器，对目标类的字节码重新“增强”；
3. 运行期：目标对象和切面都是普通Java类，通过JVM的动态代理功能或者第三方库实现运行期动态织入。

最简单的方式是第三种，Spring的AOP实现就是基于JVM的动态代理。由于JVM的动态代理要求必须实现接口，如果一个普通类没有业务接口，就需要通过[CGLIB](https://github.com/cglib/cglib)或者[Javassist](https://www.javassist.org/)这些第三方库实现。

### 21.3 访问数据库

#### 使用声明式事务

默认的事务传播级别是`REQUIRED`，它满足绝大部分的需求。还有一些其他的传播级别：

* `SUPPORTS`：表示如果有事务，就加入到当前事务，如果没有，那也不开启事务执行。这种传播级别可用于查询方法，因为SELECT语句既可以在事务内执行，也可以不需要事务；

* `MANDATORY`：表示必须要存在当前事务并加入执行，否则将抛出异常。这种传播级别可用于核心更新逻辑，比如用户余额变更，它总是被其他事务方法调用，不能直接由非事务方法调用；

* `REQUIRES_NEW`：表示不管当前有没有事务，都必须开启一个新的事务执行。如果当前已经有事务，那么当前事务会挂起，等新事务完成后，再恢复执行；

* `NOT_SUPPORTED`：表示不支持事务，如果当前有事务，那么当前事务会挂起，等这个方法执行完成后，再恢复执行；

* `NEVER`：和`NOT_SUPPORTED`相比，它不但不支持事务，而且在监测到当前有事务时，会抛出异常拒绝执行；

* `NESTED`：表示如果当前有事务，则开启一个嵌套级别事务，如果当前没有事务，则开启一个新事务。

上面这么多种事务的传播级别，其实默认的`REQUIRED`已经满足绝大部分需求，`SUPPORTS`和`REQUIRES_NEW`在少数情况下会用到，其他基本不会用到，因为把事务搞得越复杂，不仅逻辑跟着复杂，而且速度也会越慢。

---

Spring提供的声明式事务极大地方便了在数据库中使用事务。Spring使用声明式事务，最终也是通过执行JDBC事务来实现功能的，原理是使用 `ThreadLocal`。

Spring总是把JDBC相关的`Connection`和`TransactionStatus`实例绑定到`ThreadLocal`。如果一个事务方法从`ThreadLocal`未取到事务，那么它会打开一个新的JDBC连接，同时开启一个新的事务，否则，它就直接使用从`ThreadLocal`获取的JDBC连接以及`TransactionStatus`。因此，事务只能在当前线程传播，无法跨线程传播。

要实现跨线程传播事务，要想办法把当前线程绑定到`ThreadLocal`的`Connection`和`TransactionStatus`实例传递给新线程，但实现起来非常复杂，根据异常回滚更加复杂，不推荐自己去实现。

#### 集成 Hibernate

##### 初始化

在Hibernate中，`Session`是封装了一个JDBC `Connection`的实例，而`SessionFactory`是封装了JDBC `DataSource`的实例，即`SessionFactory`持有连接池，每次需要操作数据库的时候，`SessionFactory`创建一个新的`Session`，相当于从连接池获取到一个新的`Connection`。

```java
public class AppConfig {
    @Bean
    LocalSessionFactoryBean createSessionFactory(@Autowired DataSource dataSource) {
        var props = new Properties();
        props.setProperty("hibernate.hbm2ddl.auto", "update"); // 生产环境不要使用
        props.setProperty("hibernate.dialect", "org.hibernate.dialect.HSQLDialect");
        props.setProperty("hibernate.show_sql", "true");
        var sessionFactoryBean = new LocalSessionFactoryBean();
        sessionFactoryBean.setDataSource(dataSource);
        // 扫描指定的package获取所有entity class:
        sessionFactoryBean.setPackagesToScan("com.itranswarp.learnjava.entity");
        sessionFactoryBean.setHibernateProperties(props);
        return sessionFactoryBean;
    }
}
```

##### 设置映射关系

```java
// 设置映射关系
@Entity
@Table(name="users)
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(nullable = false, updatable = false)
    public Long getId() { ... }

    @Column(nullable = false, unique = true, length = 100)
    public String getEmail() { ... }

    @Column(nullable = false, length = 100)
    public String getPassword() { ... }

    @Column(nullable = false, length = 100)
    public String getName() { ... }

    @Column(nullable = false, updatable = false)
    public Long getCreatedAt() { ... }
}
```

##### 基本操作

```java
// insert
sessionFactory.getCurrentSession().persist(user);
// delete
User user = sessionFactory.getCurrentSession().byId(User.class).load(id);
if (user != null) {
    sessionFactory.getCurrentSession().remove(user);
    return true;
}
// delete
User user = sessionFactory.getCurrentSession().byId(User.class).load(id);
user.setName(name);
sessionFactory.getCurrentSession().merge(user);
```

##### 使用高级查询（HQL）

```java
List<User> list = sessionFactory.getCurrentSession()
        .createQuery("from User u where u.email = ?1 and u.password = ?2", User.class)
        .setParameter(1, email).setParameter(2, password)
        .list();
```

和SQL相比，HQL使用类名和属性名，由Hibernate自动转换为实际的表名和列名。详细的HQL语法可以参考[Hibernate文档](https://docs.jboss.org/hibernate/orm/6.1/userguide/html_single/Hibernate_User_Guide.html#query-language)。

---

`NamedQuery` 可以在代码中直观地看到查询语句。

```java
@NamedQueries(
    @NamedQuery(
        // 查询名称:
        name = "login",
        // 查询语句:
        query = "SELECT u FROM User u WHERE u.email = :e AND u.password = :pwd"
    )
)
@Entity
public class User extends AbstractEntity {
    ...
}
```

```java
public User login(String email, String password) {
    List<User> list = sessionFactory.getCurrentSession()
        .createNamedQuery("login", User.class) // 创建NamedQuery
        .setParameter("e", email) // 绑定e参数
        .setParameter("pwd", password) // 绑定pwd参数
        .list();
    return list.isEmpty() ? null : list.get(0);
}
```

### 21.4 开发 Web 应用

Spring虽然都可以集成任何Web框架，但是，Spring本身也开发了一个MVC框架，就叫[Spring MVC](https://docs.spring.io/spring/docs/current/spring-framework-reference/web.html)。

## 22. Spring Boot 开发

#### 使用开发者工具

Spring Boot提供了一个开发者工具，可以监控classpath路径上的文件。只要源码或配置文件发生修改，Spring Boot应用可以自动重启。

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
</dependency>
```

默认配置下，针对`/static`、`/public`和`/templates`目录中的文件修改，不会自动重启，因为禁用缓存后，这些文件的修改可以实时更新。



