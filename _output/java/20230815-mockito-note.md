# Mockito Note

https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/

https://github.com/eugenp/tutorials/tree/master/testing-modules/mockito-simple

### [difference between doReturn() and when()](https://stackoverflow.com/questions/20353846/mockito-difference-between-doreturn-and-when)

In the case of mocked objects, it does not matter if it's `when`/`thenReturn` or `doReturn`/`when`. Mocked objects never calls real methods.

Both approaches behave differently if you use a spied object (annotated with `@Spy`) instead of a mock (annotated with `@Mock`):

- `when(...) thenReturn(...)` **makes a real method call** just before the specified value will be returned. So if the called method throws an Exception you have to deal with it / mock it etc. Of course you still get your result (what you define in `thenReturn(...)`)
- `doReturn(...) when(...)` **does not call the method at all**.

### [Difference between @Mock and @InjectMocks](https://stackoverflow.com/questions/16467685/difference-between-mock-and-injectmocks)

`@Mock` creates a mock. `@InjectMocks` creates an **instance of the class** and injects the mocks that are created with the `@Mock` (or `@Spy`) annotations into this instance.

Note you must use `@RunWith(MockitoJUnitRunner.class)` or `Mockito.initMocks(this)` to initialize these mocks and inject them (JUnit 4).

With JUnit 5, you must use `@ExtendWith(MockitoExtension.class)`.

### mock singleton

```java
@RunWith(MockitoJUnitRunner.Silent.class)
public class Test {

    @Mock
    Singleton singleton;
    
    @Before
    public void setUp() throws Exception {
        setUpSingletons();
    }
    
    @After
    public void tearDown() throws Exception {
        resetSingletons();
    }
    
    private void setUpSingletons() throws Exception {
        final Field instance = Singleton.class.getDeclaredField("instance");
        instance.setAccessible(true);
        instance.set(instance, singleton);
    }
    
    private void resetSingletons() throws Exception {
        final Field instance = Singleton.class.getDeclaredField("instance");
        instance.setAccessible(true);
        instance.set(instance, null);
    }
    
    @Test
    public void test() {
        // ...
    }
}
```

### [Mocking Exception Throwing](https://www.baeldung.com/mockito-exceptions)

#### Non-Void Return Type

First, if our method return type is not `void`, we can use `when().thenThrow()`:

```java
@Test
void givenNonVoidReturnType_whenUsingWhenThen_thenExceptionIsThrown() {
    MyDictionary dictMock = mock(MyDictionary.class);
    when(dictMock.getMeaning(anyString())).thenThrow(NullPointerException.class);
    
    assertThrows(NullPointerException.class, () -> dictMock.getMeaning("word"));
}
```

#### Void Return Type

If our method returns `void`, we'll use `doThrow()`:

```java
@Test
void givenVoidReturnType_whenUsingDoThrow_thenExceptionIsThrown() {
    MyDictionary dictMock = mock(MyDictionary.class);
    doThrow(IllegalStateException.class).when(dictMock)
        .add(anyString(), anyString());
    
    assertThrows(IllegalStateException.class, () -> dictMock.add("word", "meaning"));
}
```

#### [Checked Exception](https://stackoverflow.com/questions/3762047/throw-checked-exceptions-from-mocks-with-mockito#answer-48261005)

A workaround is to use a [`willAnswer()`](https://static.javadoc.io/org.mockito/mockito-core/2.13.0/org/mockito/stubbing/OngoingStubbing.html#thenAnswer-org.mockito.stubbing.Answer-) method.

For example the following works (and doesn't throw a `MockitoException` but actually throws a checked `Exception` as required here) using `BDDMockito`:

```java
given(someObj.someMethod(stringArg1)).willAnswer( invocation -> { throw new Exception("abc msg"); });
```

The equivalent for plain Mockito would to use the `doAnswer` method

### [Mocking Static Methods](https://www.baeldung.com/mockito-mock-static-methods)

https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html#static_mocks

When using the [inline mock maker](https://javadoc.io/static/org.mockito/mockito-core/5.4.0/org/mockito/Mockito.html#0.2), it is possible to mock static method invocations within the current thread and a user-defined scope. This way, Mockito assures that concurrently and sequentially running tests do not interfere. To make sure a static mock remains temporary, it is recommended to define the scope within a try-with-resources construct. In the following example, the `Foo` type's static method would return `foo` unless mocked:

#### No Argument Static Method

```java
@Test
void givenStaticMethodWithNoArgs_whenMocked_thenReturnsMockSuccessfully() {
    assertThat(StaticUtils.name()).isEqualTo("Baeldung");

    try (MockedStatic<StaticUtils> utilities = Mockito.mockStatic(StaticUtils.class)) {
        utilities.when(StaticUtils::name).thenReturn("Eugen");
        assertThat(StaticUtils.name()).isEqualTo("Eugen");
    }

    assertThat(StaticUtils.name()).isEqualTo("Baeldung");
}
```

#### Static Method With Arguments

```java
@Test
void givenStaticMethodWithArgs_whenMocked_thenReturnsMockSuccessfully() {
    assertThat(StaticUtils.range(2, 6)).containsExactly(2, 3, 4, 5);

    try (MockedStatic<StaticUtils> utilities = Mockito.mockStatic(StaticUtils.class)) {
        utilities.when(() -> StaticUtils.range(2, 6))
          .thenReturn(Arrays.asList(10, 11, 12));

        assertThat(StaticUtils.range(2, 6)).containsExactly(10, 11, 12);
    }

    assertThat(StaticUtils.range(2, 6)).containsExactly(2, 3, 4, 5);
}
```

---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
