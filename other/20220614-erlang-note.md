# Erlang 学习笔记

## 顺序编程

### 基本概念

#### Erlang shell

```bash
# 启动
erl
# 停止
q() # 对应 init:stop()
# 立即停止系统
erlang:halt()
```

```erlang
% 注释
```

可以挂接一个shell到集群里另一个Erlang节点上运行的Erlang系统，甚至还可以生成一个安全shell（ secure shell，即ssh）直接连接远程计算机上运行的Erlang系统。通过它，可以与Erlang节点系统中任何节点上的任何程序进行交互。

`f()` 命令让shell忘记现有的任何绑定。
`help()` 命令获取帮助。

```erlang
6> help().
** shell internal commands **
b()        -- display all variable bindings
e(N)       -- repeat the expression in query <N>
f()        -- forget all variable bindings
f(X)       -- forget the binding of variable X
h()        -- history
h(Mod)     -- help about module
h(Mod,Func)-- help about function in module
h(Mod,Func,Arity) -- help about function with arity in module
ht(Mod)    -- help about a module's types
ht(Mod,Type) -- help about type in module
ht(Mod,Type,Arity) -- help about type with arity in module
hcb(Mod)    -- help about a module's callbacks
hcb(Mod,CB) -- help about callback in module
hcb(Mod,CB,Arity) -- help about callback with arity in module
history(N) -- set how many previous commands to keep
results(N) -- set how many previous command results to keep
catch_exception(B) -- how exceptions are handled
v(N)       -- use the value of query <N>
rd(R,D)    -- define a record
rf()       -- remove all record information
rf(R)      -- remove record information about R
rl()       -- display all record information
rl(R)      -- display record information about R
rp(Term)   -- display Term using the shell's record information
rr(File)   -- read record information from File (wildcards allowed)
rr(F,R)    -- read selected record information from file(s)
rr(F,R,O)  -- read selected record information with options
** commands in module c **
bt(Pid)    -- stack backtrace for a process
c(Mod)     -- compile and load module or file <Mod>
cd(Dir)    -- change working directory
flush()    -- flush any messages sent to the shell
help()     -- help info
h(M)       -- module documentation
h(M,F)     -- module function documentation
h(M,F,A)   -- module function arity documentation
i()        -- information about the system
ni()       -- information about the networked system
i(X,Y,Z)   -- information about pid <X,Y,Z>
l(Module)  -- load or reload module
lm()       -- load all modified modules
lc([File]) -- compile a list of Erlang modules
ls()       -- list files in the current directory
ls(Dir)    -- list files in directory <Dir>
m()        -- which modules are loaded
m(Mod)     -- information about module <Mod>
mm()       -- list all modified modules
memory()   -- memory allocation information
memory(T)  -- memory allocation information of type <T>
nc(File)   -- compile and load code in <File> on all nodes
nl(Module) -- load module on all nodes
pid(X,Y,Z) -- convert X,Y,Z to a Pid
pwd()      -- print working directory
q()        -- quit - shorthand for init:stop()
regs()     -- information about registered processes
nregs()    -- information about all registered processes
uptime()   -- print node uptime
xm(M)      -- cross reference check a module
y(File)    -- generate a Yecc parser
** commands in module i (interpreter interface) **
ih()       -- print help for the i module
true
```

#### 整数运算

```erlang
1> 2 + 3 * 4.
14
```

Erlang可以用任意长度的整数执行整数运算。在Erlang里，整数运算是精确的，因此无需担心运算溢出或无法用特定字长（ word size）来表示某个整数。

#### 变量

```erlang
1> X = 123.
2> X.
123
```

* 所有变量名都必须以大写字母开头。
* Erlang 中的 `=` 是一个模式匹配操作符，当关联一个值与一个变量时，所下的是一种断言，也就是事实陈述。这个变量具有那个值，仅此而已。
* X 不是一个变量，是一次性赋值变量，只能被赋值一次。
* 变量的作用域是它定义时所处的语汇单元。不存在全局变量或私有变量的说法。

在Erlang里， =是一次模式匹配操作。 Lhs = Rhs 的真正意思是：计算右侧（ Rhs）的值，然后将结果与左侧（ Lhs）的模式相匹配。
我们第一次说 X = SomeExpression时， Erlang对自己说：“我要做些什么才能让这条语句为真？”因为X还没有值，它可以绑定X到SomeExpression这个值上，这条语句就成立了。

这符合了 Erlang 这种函数式编程语言的不可变状态。

#### 浮点数

```erlang
1> 5/3.
1.6666666666666667  % 用 / 给两个整数做除法时，结果会自动转换成浮点数。
2> 4/2.
2.0     % 整除结果仍是浮点数
3> 5 div 3.
1       % N 除以 M 然后舍去余数
4> 5 rem 3.
2       % N 除以 M 后剩下的余数
5> 4 div 2.
2

% 浮点数的程序会存在和C等语言一样的浮点数取整与精度问题
```

#### 原子

* 表示常量值，也可以视作枚举类型。
* 原子是全局性的，而且不需要宏定义或包含文件就能实现。
* 原子以小写字母开头，后接一串字母、数字、下划线（_）或at（@）符号。
* 也可以放在单引号内，以大写字母开头或包含字母数字以外字符的原子。
* 原子的值就是它本身

#### 元组

* 数量固定的项目归组成单一的实体
* 元组里的字段没有名字，常用做法是将元组第一个元素设为一个原子，用来表示元组是什么。

```erlang
{point, 10, 5}.

Person = {person, {name, joe}, {height, 1.82}, {footsize, 42}, {eyecolour, brown}}.

% 用模式匹配的方式提取元组的值
Point = {point, 10, 45}.
{point, X, Y} = Point.

% 用_作为占位符
Person = {person, {name, joe, armstrong}, {footsize, 42}}.
{_,{_,Who,_},_}=Person.
Who.
> joe
```

#### 列表

```erlang
[8,hello,0,{cost,apple,10},3]
```

* 用来存放任意数量的事物
* 第一个元素称为列表头，剩下元素是列表尾。
* 访问列表头是一种非常高效的操作，因此基本上所有的列表处理函数都从提取列表头开始，然后对它做一些操作，接着处理列表尾。
* 如果T是一个列表，那么[H|T]也是一个列表， 它的头是H，尾是T。竖线（|） 把列表的头与尾分隔开。 []是一个空列表。

```erlang
% 扩展列表
7> Things = [{apples,10},{pears,6},{milk,3}].
[{apples,10},{pears,6},{milk,3}]
8> Things1=[{oranges,4},{newspaper,1}|Things].
[{oranges,4},{newspaper,1},{apples,10},{pears,6},{milk,3}]

% 提取列表元素，[X|Y] = L（ X和Y都是未绑定变量）会提取列表头作为X，列表尾作为Y。
9> [Buy1|Things2]=Things1.
[{oranges,4},{newspaper,1},{apples,10},{pears,6},{milk,3}]
10> Buy1.
{oranges,4}
11> Things2.
[{newspaper,1},{apples,10},{pears,6},{milk,3}]
%%
12> [Buy2,Buy3|Things3]=Things2.
[{newspaper,1},{apples,10},{pears,6},{milk,3}]
13> Buy2.
{newspaper,1}
14> Buy3.
{apples,10}
15> Things3.
[{pears,6},{milk,3}]
```

#### 字符串

严格来说，Erlang 里没有字符串。用整数组成的列表或一个二进制型表示字符串。当用整数列表表示字符串时，列表里的每个元素代表了一个Unicode字符。

```erlang
16> Name="Hello".   % "Hello"其实只是一个列表的简写，这个列表包含了代表字符串里各个字符的整数字符代码
"Hello"

% shell打印某个列表的值时，如果列表内的所有整数都代表可打印字符，它就会将其打印成字符串字面量。否则，打印成列表记法
17> [1,2,3].
[1,2,3]
18> [83,117,114,112,114,105,115,101].
"Surprise"
19> [1,83,117,114,112,114,105,115,101].
[1,83,117,114,112,114,105,115,101]

% 如果shell将某个整数列表打印成字符串，而你其实想让它打印成一列整数，那就必须使用格式化的写语句
1> X = [97,98,99].
"abc"
3> io:format("~w~n",[X]).
[97,98,99]

% $a实际上就是代表字符a的整数
20> I = $s.
115
22> [$S,117,114,112,114,105,115,101].
"Surprise"

% 必须使用特殊的语法才能输入某些字符，在打印列表时也要选择正确的格式惯例。
23> X="a\x{221e}b".
[97,8734,98]
24> io:format("~ts~n",[X]).
a\x{221E}b
```

