# Jmockit的使用总结

https://blog.csdn.net/qq_29698805/article/details/105588023

# 前言 

Deencapsulation.newUninitializedInstance(clazz)  
[跳过构造函数创建对象][Link 1]  
我几乎都是参考[JMockit中文网][JMockit]学习的`Jmockit`。在这必须得强烈安利一下啊。其实我刚开始看文档的时候，`MockUp`、`@Mock`、`@Test`、`@Mocked`、`@Injectable`、`@Capturing`、`Expectations`、`Verifications`那么多注解和类，傻傻分不清。后来慢慢总结了一下自己的理解思路。  
这里，我没有像原笔者从概念->语法->用法->原理那样讲解的那么透彻。我是从一种抛出问题->解决问题的方式来对我学习`Jmockit`进行总结。

# 一、 JMockit介绍 

JMockit是一款Java的 类/接口/对象的Mock工具，目前广泛应用于Java应用程序的单元测试中。因为公司中都是使用JMockit进行单元测试，所以我就学的它。开始学习时，总是会把那些各种注解混搭傻傻分不清，后来看了[这篇文章][Link 2]后，突然就能分的清了。  
JMockit有两种测试方式：

> 1、基于状态的Mock：  
> 是站在目标测试代码内部的，可以对传入的参数进行检查、匹配，才返回某些结果，类似白盒。  
> 主要使用`MockUp`和`@Mock`搭配使用实现Mock

> 2、基于行为的Mock：  
> 就是对Mock目标代码的行为进行模仿，更像是黑盒测试。  
> 主要使用`@Test`、`@Mocked`、`@Injectable`、`@Capturing`和`Expectations`搭配使用实现Mock

总结：  
其实从大的方向来讲，JMockit只有两种Mock方式：`new MockUp()` 和 `new Expectations()` 两种。  
（1）注解`@Mock`是和`new MockUp()`方式搭配使用。  
（2）注解`@Test`、`@Mocked`、`@Injectable`、`@Capturing`是和`new Expectations()`方式搭配使用。然后`@Mocked`、`@Injectable`、`@Capturing`又有不同的特性，就可以解决不同场景下的Mock了。

场景：  
下面来通过一个最简单的单元测试场景来学习JMockit的使用：  
现在有一个类，我们需要对其中的`公有方法、私有方法、静态方法、final方法`进行Mock。

```java
/**
 * @author Caocs
 * @date 2020/4/18
 */
public class Fun {
	// 静态方法
    public static String staticFun(int x) {
        return "this is a static function " + x;
    }

	// 公有方法
    public String publicFun(int x) {
        return "this is a public function " + x;
    }
    
	// final方法
    public final String finalFun(int x) {
        return "this is a final function " + x;
    }
    
	// 私有方法
    private String privateFun(int x) {
        return "this is a private function " + x;
    }
    
	// 为了方便测试私有方法是否被Mock
    public String callPrivateFun(int x){
        return privateFun(x)+" is called";
    }
}
```

## 1、基于状态的Mock 

这种写法我觉得非常简洁明了，而且已经能解决绝大部分的单元测试的需求了。针对不能解决的应用场景在后面也会分析。  
要讲基于状态的Mock，那么肯定是要明白MockUp和@Mock的作用和优缺点。

作用：  
如果我们想对Java中某个类的某个方法进行定制，只需要把该类传入MockUp类的构造函数即可。然后想Mock哪个方法，就在哪个方法上加@Mock注解。没有加@Mock注解的方法不会受影响。

示例代码：

```java
import mockit.Mock;
import mockit.MockUp;
import org.junit.Assert;
import org.junit.Test;

/**
 * @author Caocs
 * @date 2020/4/18
 */
public class MockUpTest {
    @Test
    public void test() {
    	// 如果想Mock某个类，只需要把这个类传入MockUp类的构造函数即可
    	// 如果想Mock某个方法，就给哪个方法加上@Mock即可
    	// 公有方法、私有方法、静态方法、final方法都可以Mock
        MockUp<Fun> mockUpFun = new MockUp<Fun>(Fun.class) {
            @Mock // 匿名内部类中，不能加static修饰
            public String staticFun(int x){
                return "mock static";
            }
            @Mock
            public String publicFun(int x){
                return "mock public";
            }
            @Mock // final修饰符可以省略
            public final String finalFun(int x){
                return "mock final";
            }
            @Mock // 可以使用public修饰
            private String privateFun(int x){
                return "mock private";
            }
        };

        // 使用MockUp进行方法的Mock，是对该类的所有对象都生效的。
        Fun fun = new Fun(); // 所以此处new出来的实例也生效
        // Fun fun = mockUpFun.getMockInstance(); // 通过mockUpFun生成的实例也有效
        Assert.assertEquals("mock private is called",fun.callPrivateFun(10));
        Assert.assertEquals("mock static",Fun.staticFun(10));
        Assert.assertEquals("mock public",fun.publicFun(10));
        Assert.assertEquals("mock final",fun.finalFun(10));
    }
}
```

原理：  
`JMockit`在`new MockUp()`装载的类中的每个方法（只要是经`@Mock`修饰过的）中插入了一个分支，这个分支就是走`MockUp`类(即`new MockUp{ {}}匿名类`或`extends MockUp的子类`)的mock方法，因此就达到了Mock的目的。

总结：  
使用MockUp实现类中方法的Mock，  
（1）可以对指定方法进行Mock。想Mock哪个方法就在哪个方法上加@Mock。不加则不受影响。  
（2）对该类的所有对象都生效。无论是依赖注入或者new的多个实例对象，都会生效。

缺点：  
（1）一个类多个实例情况。因为是对该类的所有实例都有效，所以如果想对一个类的多个实例有不同的操作的时候，这种写法就很不适用了。  
（2）AOP动态生成的类。通过AOP动态生成的类，很可能我们连名称是什么都不知道，更不用提如何适用MockUp进行Mock啦。  
（3）需要Mock的方法过多。如果需要Mock的方法过多，我们就要写很多很多代码，很不方便。

适用场景：  
其实掌`MockUp`和`@Mock`就能帮我们解决大部分的Mock场景，而且使用方式直接明了。  
这种方式比较适用于对通用类的方法进行Mock。

## 2、基于行为的Mock 

根据上面方希，基于状态的Mock(`通过MockUp和@Mock方式`)存在多种无法适用的场景。JMockit还提供基于行为的Mock方式。  
要讲基于状态的Mock，那么肯定是要明白`Expectations`和`@Test`、`@Mocked`、`@Injectable`、`@Capturing`的作用和优缺点。

示例：  
根据我自己测试来看，如果导包的时候JMockit在JUnit后面，则如果想使用`测试参数`和`@Test`、`@Mocked`、`@Injectable`、`@Capturing`注解，必须添加在测试类上添加`@RunWith(JMockit.class)`注解。否则会不支持测试方法和注解的属性NullPointerException。但是使用上一节的MockUp方式则不必要。

```java
import java.util.Locale;
public class HelloJMockit {
    // 向JMockit打招呼
    public String sayHello() {
        Locale locale = Locale.getDefault();
        if (locale.equals(Locale.CHINA)) {
            // 在中国，就说中文
            return "你好，JMockit!";
        } else {
            // 在其它国家，就说英文
            return "Hello，JMockit!";
        }
    }
}
```

```java
// 除非在加载jar包时，JMockit包就在JUnit包前面，
// 否则，使用测试参数、@Mocked等注解的话，必须添加@RunWith(JMockit.class)
@RunWith(JMockit.class)
public class ProgramConstructureTest {
    @Mocked
    HelloJMockit helloJMockit; // 这是一个测试属性
 
    @Test
    public void test1() {
        // 录制(Record)
        new Expectations() {
            {
                helloJMockit.sayHello();
                result = "hello,david";
            }
        };
        // 重放(Replay)
        String msg = helloJMockit.sayHello();
        Assert.assertTrue(msg.equals("hello,david"));
        // 验证(Verification)
        new Verifications() {
            {
                helloJMockit.sayHello();
                times = 1;
            }
        };
    }
 
    @Test
    public void test2(@Mocked HelloJMockit helloJMockit /* 这是一个测试参数 */) {
        // 录制(Record)
        new Expectations() {
            {
                helloJMockit.sayHello();
                result = "hello,david";
            }
        };
        // 重放(Replay)
        String msg = helloJMockit.sayHello();
        Assert.assertTrue(msg.equals("hello,david"));
        // 验证(Verification)
        new Verifications() {
            {
                helloJMockit.sayHello();
                times = 1; // 验证helloJMockit.sayHello()这个方法调用了1次
            }
        };
    }
}
```

代码总结：

> > （1）在JMockit中，我们可以用JMockit的注解API来修饰它。这些API有`@Mocked`, `@Tested`, `@Injectable`, `@Capturing`。不同的注解有不同的含义。
>
> > （2）在上述例子中，我们用@Mocked修饰了测试属性HelloJMockit helloJMockit，表示helloJMockit这个测试属性，它的`实例化，属性赋值，方法调用的返回值全部由JMockit来接管`，接管后，helloJMockit的行为与HelloJMockit类定义的不一样了，而是由录制脚本来定义了。
>
> > （3）给测试方法加参数，原本在JUnit中是不允许的，但是如果`参数加了JMockit的注解API`(@Mocked, @Tested,@Injectable,@Capturing)后，则是允许的。

通常，在实际测试程序中，我们更倾向于通过JUnit/TestNG/SpringTest的Assert类对测试结果的验证， 对类的某个方法有没调用，调用多少次的测试场景并不是太多。因此在验证阶段，我们完全可以用JUnit/TestNG/SpringTest的Assert类取代new Verifications() \{ \{\}\}验证代码块。除非，你的测试程序关心类的某个方法有没有调用，调用多少次，你可以使用new Verifications() \{ \{\}\}验证代码块。如果你还关心方法的调用顺序，你可以使用new VerificationsInOrder() \{ \{\}\} .这里就不做详细的介绍了。

### （1）测试属性&测试参数 

a）测试属性：即测试类的一个属性。它作用于测试类的所有测试方法。  
b）测试参数：即测试方法的参数。它仅作用于当前测试方法。

### （2）Record-Replay-Verification结构 

在JMockit单元测试中最常见的写法：`录制代码块`，`重放测试逻辑`，`验证代码块`。Record-Replay-Verification 是JMockit测试程序的主要结构。  
a）Record: 即先录制某类/对象的某个方法调用，在当输入什么时，返回什么。  
b）Replay: 即重放测试逻辑。  
c）Verification: 重放后的验证。比如验证某个方法有没有被调用，调用多少次。  
其实，Record-Replay-Verification与JUnit程序的AAA(Arrange-Action-Assert)结构是一样的。  
Record对应Arrange，先准备一些测试数据，测试依赖。Replay对应Action，即执行测试逻辑。Verification对应Assert，即做测试验证。

### （3）注解`@Mocked`, `@Tested`, `@Injectable`, `@Capturing`的区别与用法 

#### 注解@Mocked的说明 

解释：

1.  使用@Mocked可以修饰类、接口、抽象类。
2.  使用@Mocked修饰，就是告诉JMockit生成一个Mocked对象，这个对象方法（包含静态方法，私有方法）都返回默认值。
3.  如果返回类型为原始类型（short、int、float、double、long），则返回0。
4.  如果返回类型为String类型，则返回null。
5.  如果返回类型是其他引用类型，则返回这个引用类型的Mocked对象。（这里就又需要Mock这个对象，就这样递归的定义下去）

注意：

1.  使用@Mocked修饰是对该类的所有实例都生效的。
2.  但是如果被@Mock修饰的对象是作为参数传入Expectations构造函数中时，会只针对该对象有效。

应用场景：  
当我们的测试程序依赖某个接口时，用@Mocked非常适合了。只需要@Mocked一个注解，JMockit就能帮我们生成这个接口的实例。

Expectations主要有两种使用方式：

1.  通过引用外部类的Mock对象(@Injectabe,@Mocked,@Capturing)来录制  
    对类的所有方法都mock了
2.  通过构建函数注入类/对象来录制  
    把待Mock的类传入Expectations的构造函数，可以达到只mock类的部分行为的目的

示例1：  
使用@Mocked实例化对象，Expectations不传参数。

```java
import mockit.Expectations;
import mockit.Mocked;
import mockit.integration.junit4.JMockit;
import org.junit.Assert;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * @author Caocs
 * @date 2020/4/19
 */
// @RunWith(JMockit.class)
public class ExpectationsTest {
    @Test
    public void test(@Mocked Fun fun/* 使用测试参数，则仅在当前测试方法起作用*/) {
		/**
		* 如果Expectations构造函数中，没有传入任何参数
		* 那么，被@Mocked注解的类(接口/抽象类)中的方法会被全部Mock掉。规则如上所述。
		* 并且，如果在Expectations中指定方法，就会按照指定的来。
		*/
        new Expectations() {
            {
                fun.publicFun(1);
                result = "mock public";
                Fun.staticFun(1); // Mock 静态方法
                result = "mock static";
            }
        };

        Assert.assertEquals("mock public", fun.publicFun(1)); // 
        System.out.println(fun.callPrivateFun(1)); // null 说明fun对象的所有方法都被使用默认规则Mock掉了
        System.out.println(Fun.staticFun(1)); // mock static 说明静态方法也被Mock掉了
        Fun fun1 = new Fun(); // 用于测试new出来的新实例
        System.out.println(fun1.publicFun(1)); // mock public 说明如果在Expectations中指明方法的话，新实例的该方法也被指定了
        System.out.println(fun1.callPrivateFun(1)); // null 说明new出来的新实例对象的所有方法都被使用默认规则Mock掉了
    }
}
```

示例2：  
使用@Mocked实例化对象，Expectations传入类。

```java
/**
 * @author Caocs
 * @date 2020/4/19
 */
public class ExpectationsTest {    
    @Test
    public void test(@Mocked Fun fun/* 使用测试参数，则仅在当前测试方法起作用*/) {
		/**
		* 如果Expectations构造函数中，传入类
		* 那么，这个类只有在Expectations中指定的方法会被按照指定的来Mock
		* 并且，在Expectations中指定的方法是对该类的所有实例有效
		* 并且，其他没有被指定的方法并不会被Mock掉，还是执行原来的逻辑
		* 所以，这样就可以实现Mock指定类的指定方法
		*/
        new Expectations(Fun.class) {
            {
                fun.publicFun(1);
                result = "mock public";
            }
        };

        Assert.assertEquals("mock public", fun.publicFun(1));
        System.out.println(fun.callPrivateFun(1)); // this is a private function 1 is called 说明没有被指定的方法还是执行原来的逻辑
        Fun fun1 = new Fun();
        System.out.println(fun1.publicFun(1)); // mock public 说明新实例的指定方法也别Mock掉了
        System.out.println(fun1.callPrivateFun(1)); // this is a private function 1 is called 说明新实例的没有被指定的方法还是执行原来的逻辑
    }
}
```

示例3：  
使用@Mocked实例化对象，Expectations传入对象。

```java
/**
 * @author Caocs
 * @date 2020/4/19
 */
public class ExpectationsTest {
    @Test
    public void test(@Mocked Fun fun/* 使用测试参数，则仅在当前测试方法起作用*/) {
		/**
		* 如果Expectations构造函数中，传入对象
		* 那么，这个类只有在Expectations中指定的方法会被按照指定的来Mock
		* 并且，在Expectations中指定的方法是对该对象有效，对该类的其他实例无效
		* 并且，其他没有被指定的方法并不会被Mock掉，还是执行原来的逻辑
		* 所以，这样就可以实现Mock指定对象的指定方法
		*/
        new Expectations(fun) {
            {
                fun.publicFun(1);
                result = "mock public";
            }
        };

        Assert.assertEquals("mock public", fun.publicFun(1));
        System.out.println(fun.callPrivateFun(1)); // this is a private function 1 is called 说明没有被指定的方法还是执行原来的逻辑
        Fun fun1 = new Fun();
        System.out.println(fun1.publicFun(1)); // this is a public function 1 说明新实例的指定方法还是执行原来的逻辑
        System.out.println(fun1.callPrivateFun(1)); // this is a private function 1 is called 说明新实例的没有被指定的方法还是执行原来的逻辑
    }
}
```

#### 注解@Injectable的说明 

注解`@Injectable`只针对其修饰的实例，所以对类的静态方法、构造函数都没有影响。因为它只影响某一个实例嘛。

```java
/**
 1. @author Caocs
 2. @date 2020/4/19
 */
public class InjectableTest {
    @Test
    public void test(@Injectable Fun fun/* 使用测试参数，则仅在当前测试方法起作用*/) {
        new Expectations() {
            {
                fun.publicFun(1);
                result = "mock public";
            }
        };

        Assert.assertEquals("mock public", fun.publicFun(1)); // 说明该对象的公有方法被Mock了
        System.out.println(Fun.staticFun(1)); // this is a static function 1 说明静态方法没有被Mock
        Fun fun1 = new Fun(); // @Injectable不会影响构造方法
        System.out.println(fun1.publicFun(1)); // this is a public function 1 说明new的实例对象方法没有被Mock
        System.out.println(fun1.callPrivateFun(1)); // this is a private function 1 is called
    }
}
```

#### 注解@Tested的说明 

使用@Tested修饰的类，表示我们要测试对象。JMockit也会帮我们实例化这个测试对象。

如何实例化@Tested修饰的类：

1.  如果该对象没有赋值，就去实例化它。
2.  首先，对构造函数实例化。
3.  若@Test对象的构造函数有参数，则JMockit通过测试属性和测试参数中查找@Injectable修饰的Mocked对象注入@Tested对象的构造函数来实例化。
4.  若@Test对象的构造函数没有参数，则用无参构造函数来实例化。
5.  然后，需要将@Tested对象中其他字段属性注入。
6.  JMockit通过属性查找的方式，把@Injectable对象注入到@Tested对象中。
7.  注入的匹配规则：先类型，再名称（构造函数参数名，类的属性名）。若找到多个可以注入的@Injectable，则选择最优先定义的@Injectable对象。

注意：  
当然，我们的测试程序要尽量避免这种情况出现。  
因为给哪个测试属性、测试参数加@Injectable，是人为控制的

应用场景：  
当我们需要手动管理被测试类的依赖时，就需要用到@Tested和@Injectable。  
两者搭配使用，JMockit就能帮我们轻松搞定被测试类及其依赖注入细节。

@Tested & @Injectable 搭配使用  
其实，我们在使用的过程中，往往将@Tested & @Injectable 搭配使用。  
示例1：

```java
public interface MailService {
    public boolean sendMail(long userId, String content);
}
public interface UserCheckService {  
    public boolean check(long userId);
}

public class OrderService {
    // 邮件服务类，用于向某用户发邮件。
    @Resource
    MailService mailService;
    // 用户身份校验类，用于校验某个用户是不是合法用户
    UserCheckService userCheckService;
    // 构造函数
    public OrderService(UserCheckService userCheckService) {
        this.userCheckService = userCheckService;
    }
    public boolean submitOrder(long buyerId, long itemId) {
        // 先校验用户身份
        if (!userCheckService.check(buyerId)) {
            // 用户身份不合法
            return false;
        }
        if (!this.mailService.sendMail(buyerId, "下单成功")) {
            // 邮件发送成功
            return false;
        }
        return true;
    }
}
```

```java
@RunWith(JMockit.class)
public class TestedAndInjectable {
    @Test
    public void testSubmitOrder(@Tested OrderService orderService, // @Tested修饰的类，表示是我们要测试对象,在这里表示，我想测试订单服务类。JMockit也会帮我们实例化这个测试对象
                                @Injectable MailService mailService,
                                @Injectable UserCheckService userCheckService) {
        //测试用户ID
        long testUserId = 123456l;
        //测试商品id
        long testItemId = 456789l;
        new Expectations() {
            {
                // 当向testUserId发邮件时，假设都发成功了
                mailService.sendMail(testUserId, anyString);
                result = true;
                // 当检验testUserId的身份时，假设该用户都是合法的
                userCheckService.check(testUserId);
                result = true;
            }
        };
        // JMockit帮我们实例化了userCheckService了，并通过OrderService的构造函数，注入到orderService对象中。
        // JMockit帮我们实例化了mailService了，并通过OrderService的属性，注入到orderService对象中。
        Assert.assertTrue(orderService.submitOrder(testUserId, testItemId));
    }
}
```

#### 注解@Capturing的说明 

应用场景：  
注解`@Capturing`主要用于`子类/实现类`的Mock我们只知道父类或接口时，但我们却需要控制它所有子类的行为时，子类可能有多个实现（可能有人工写的，也可能是AOP代理自动生成时），就用`@Capturing`。

示例1：  
其实我从来没用过哈哈哈哈。借用一下[JMockit中文网][JMockit 1]的代码。

```java
//@Capturing注解用途
public class CapturingTest {
    // 测试用户ID
    long testUserId = 123456l;
    // 权限检验类，可能是人工写的
    IPrivilege privilegeManager1 = new IPrivilege() {
        @Override
        public boolean isAllow(long userId) {
            if (userId == testUserId) {
                return false;
            }
            return true;
        }
    };
    // 权限检验类，可能是JDK动态代理生成。我们通常AOP来做权限校验。
    IPrivilege privilegeManager2 = (IPrivilege) Proxy.newProxyInstance(IPrivilege.class.getClassLoader(),
            new Class[] {
      IPrivilege.class }, new InvocationHandler() {
                @Override
                public Object invoke(Object proxy, Method method, Object[] args) {
                    if ((long) args[0] == testUserId) {
                        return false;
                    }
                    return true;
                }
            });
 
    // 有Cautring情形
    @Test
    public void testCaputring(@Capturing IPrivilege privilegeManager) {

        // 加上了JMockit的API @Capturing,
        // JMockit会帮我们实例化这个对象，它除了具有@Mocked的特点，还能影响它的子类/实现类
        new Expectations() {
            {
                // 对IPrivilege的所有实现类录制，假设测试用户有权限
                privilegeManager.isAllow(testUserId);
                result = true;
            }
        };
        // 不管权限校验的实现类是哪个，这个测试用户都有权限
        Assert.assertTrue(privilegeManager1.isAllow(testUserId));
        Assert.assertTrue(privilegeManager2.isAllow(testUserId));
    }
    // 没有Cautring情形
    @Test
    public void testWithoutCaputring() {
        // 不管权限校验的实现类是哪个，这个测试用户没有权限
        Assert.assertTrue(!privilegeManager1.isAllow(testUserId));
        Assert.assertTrue(!privilegeManager2.isAllow(testUserId));
    }
}
```

### （4）总结 

|             | 实例范围           | 方法范围                     |
| ----------- | ------------------ | ---------------------------- |
| @Mocked     | 类的所有实例都有效 | 静态方法、私有方法、公有方法 |
| @Injectable | 只对修饰的实例有效 | 对静态方法，构造函数无效     |
| @Tested     | 标识被测试的对象   |                              |
| @Capturing  | 子类、实现类都有效 | 静态方法、私有方法、公有方法 |

其实我的总结就是：

1.  如果能使用MockUp，则直接使用MockUp。
2.  如果不行，再考虑使用@Mocked进行Mock。（但是使用@Mocked方式和MockUp方式我觉得大同小异，只是可以针对性Mock方法。）
3.  如果需要手动管理被测试类的依赖注入，就使用@Tested和@Injectable搭配的方式。我觉得这种写法的可能性都已经很小很小了。
4.  如果需要对子类、实现类进行Mock，就使用@Capturing的方式。其实我从来没遇到过哈哈哈。

# 参考文章： 

[JMockit中文网][JMockit] 个人强烈推荐  
[使用Junit4和JMockit进行单元测试][Link 2]  
[浅谈Jmockit使用][Jmockit]  
[spring+jmockit单元测试][spring_jmockit]  
[单元测试之初步使用篇(testng + jmockit + springboot)][testng _ jmockit _ springboot]


[Link 1]: https://yanbin.blog/create-java-instance-bypass-constructor/
[JMockit]: http://jmockit.cn/index.htm
[Link 2]: https://blog.csdn.net/yizhenn/article/details/52384582
[JMockit 1]: http://jmockit.cn/showArticle.htm?channel=2&id=7
[Jmockit]: https://blog.csdn.net/changsu4615/article/details/46802517?depth_1-utm_source=distribute.pc_relevant.none-task-blog-BlogCommendFromBaidu-5&utm_source=distribute.pc_relevant.none-task-blog-BlogCommendFromBaidu-5
[spring_jmockit]: https://blog.csdn.net/liu306487103/article/details/89450977
[testng _ jmockit _ springboot]: https://blog.csdn.net/sinat_33055617/article/details/81056951