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

### 模块与函数

#### 模块

模块是Erlang的基本代码单元。模块保存在扩展名为 `.erl` 的文件里，而且必须先编译才能运行模块里的代码。编译后的模块以 `.beam` 作为扩展名。

* 逗号 `,` 分隔函数调用、数据构造和模式中的参数。
* 分号 `;` 分隔子句。我们能在很多地方看到子句，例如函数定义，以及case、 if、try..catch和receive表达式。
* 句号 `.`（后接空白）分隔函数整体，以及shell里的表达式。

```erlang
% geometry.erl
-module(geometry)   % 模块声明，模块名必须与存放该模块的主文件名相同
-export([area/1])   % 导出声明，Name/N 指带有 N 个参数的函数 Name。已导出函数相当于公共方法，未导出函数相当于私有方法

% 函数定义，area 函数有两个子句
area({rectangle, Width, Height}) -> Width * Height;     % 子句以分号隔开
area({square, Side}) -> Side * Side.                    % 以句号结尾
```

```erlang
1> c(geometry).         % 在 erlang shell 中编译，编译之后产生 geometry.beam 目标代码块
{ok,geometry}
2> geometry:area({rectangle, 10, 5}).   % 调用函数，要附上模块名
50
3> geometry:area({square, 3}). 
9
```

```erlang
-module(geometry).
-export([area/1, test/0]).

% 添加测试，测试仅仅需要模式匹配和=
test() ->
  12 = area({rectangle, 3, 4}),
  144 = area({square, 12}),
  tests_worked.

area({rectangle, Width, Height}) ->
  Width * Height;
area({square, Side}) ->
  Side * Side.
```

```erlang
5> c(geometry).
{ok,geometry}
6> geometry:test().
tests_worked
```

```erlang
% 情况分析函数
total([{What, N} | T]) -> shop:cost(What) * N + total(T);
total([]) -> 0.
```

#### 高阶函数 fun

* Erlang 是函数式编程语言，表示函数可以被用作参数，也可以返回函数。
* 操作其他函数的函数被称为高阶函数。
* 代表函数的数据类型是 `fun`。

```erlang
1> Double = fun(X) -> 2 * X end.
#Fun<erl_eval.44.65746770>
2> Double(2).
4
% fun 可以有多个子句
3> TempConvert = fun({c, C}) -> {f, 32 + C * 9 / 5};
                    ({f, F}) -> {c, (F - 32) * 5 / 9}
                 end.
#Fun<erl_eval.44.65746770>
4> TempConvert({c, 100}).
{f,212.0}
5> TempConvert({f, 212}).
{c,100.0}
```

```erlang
% 标准库高阶函数
%% map
6> L = [1,2,3,4].
[1,2,3,4]
7> lists:map(fun(X) -> 2 * X end, L).
[2,4,6,8]

%% filter
8> Even = fun(X) -> (X rem 2) =:= 0 end.
#Fun<erl_eval.44.65746770>
9> Even(8).
true
10> Even(7).
false
11> lists:map(Even, [1,2,3,4,5,6,7,8]).
[false,true,false,true,false,true,false,true]
12> lists:filter(Even, [1,2,3,4,5,6,7,8]).
[2,4,6,8]
```

```erlang
% 返回 fun 的函数，括号内的东西就是返回值
13> MakeTest = fun(L) -> (fun(X) -> lists:member(X, L) end) end.
#Fun<erl_eval.44.65746770>
15> Fruit = [apple, pear, orange].
[apple,pear,orange]
16> IsFruit = MakeTest(Fruit).
#Fun<erl_eval.44.65746770>
17> IsFruit(pear).
true
18> IsFruit(dog).
false
19> lists:filter(IsFruit, [dog,orange,cat,apple,bear]).
[orange,apple]

22> Mult = fun(Times) -> (fun(X) -> X * Times end) end.
#Fun<erl_eval.44.65746770>
23> Triple = Mult(3).
#Fun<erl_eval.44.65746770>
24> Triple(5).
15
```

##### 实现 for

```erlang
% Erlang 没有 for 循环，而是需要自己编写控制结构

% 创建列表[F(1), F(2), ..., F(10)]
for(Max, Max, F) -> [F(Max)];
for(I, Max, F) -> [F(I) | for(I + 1, Max, F)].

9> lib_misc:for(1,10,fun(I)->I end).
[1,2,3,4,5,6,7,8,9,10]
10> lib_misc:for(1,10,fun(I)->I*I end). 
[1,4,9,16,25,36,49,64,81,100]
```

#### 列表处理 & 列表推导

```erlang
%% 列表求和函数
sum([H | T]) -> H + sum(T);
sum([]) -> 0.

%% map 函数
map(_, []) -> [];
map(F, [H | T]) -> [F(H) | map(F, T)].

total(L) -> sum(map(fun({What, N}) -> shop:cost(What) * N end, L)).
```

列表推导（list comprehension）是无需使用fun、 map或filter就能创建列表的表达式。它让程序变得更短，更容易理解。

```erlang
1> L = [1,2,3,4,5]. 
[1,2,3,4,5]
2> [2*X||X<-L]. % [F(X) || X <- L]：由 F(X) 组成的列表（X 从列表 L 中提取）
[2,4,6,8,10]
```

列表推导的常规形式

```erlang
[X || Qualifier1, Qualifier2, ...]
```

X 是任一表达式，后面的限定符可以是生成器、位串生成器或过滤器。

* 生成器（generator）的写法是 `Pattern <- ListExpr` ，其中的 `ListExp` 必须是一个能够得出列表的表达式。
* 位串（bitstring）生成器的写法是 `BitStringPattern <= BitStringExpr` ，其中的 `BitStringExpr` 必须是一个能够得出位串的表达式。
* 过滤器（filter）既可以是**判断函数（即返回true或false的函数）**，也可以是**布尔表达式**。请注意，列表推导里的生成器部分起着过滤器的作用

```erlang
%% 快速排序
qsort([]) -> [];
qsort([Pivot | T]) ->
  qsort([X || X <- T, X < Pivot])         % 生成器 + 过滤器，生成一个比 Pivot 小的数组成的列表，递归
  ++ [Pivot]                              % ++ 是中缀插入操作符，在中间插入 Pivot
  ++ qsort([X || X <- T, X >= Pivot]).

%% 毕达哥拉斯三元数组
%% 提取1到N的所有A值，1到N的所有B值，1到N的所有C值，条件是A + B + C小于等于N并且A*A + B*B = C*C。
pythag(N) ->
  [
    {A, B, C} ||
    A <- lists:seq(1, N),
    B <- lists:seq(1, N),
    C <- lists:seq(1, N),
    A + B + C =< N,
    A * A + B * B =:= C * C
  ].
```

#### 内置函数

built-in function，是那些作为Erlang语言定义一部分的函数。有些内置函数是用Erlang实现的，但大多数是用Erlang虚拟机里的底层操作实现的。最常用的内置函数（例如list_to_tuple）是自动导入的。

```erlang
4> list_to_tuple([12,cat,"hello"]).
{12,cat,"hello"}
5> time().
{22,55,25}
```

#### 关卡

* 关卡（guard）是一种结构，可以用它来增加模式匹配的威力，它通过 `when` 引入。通过使用关卡，可以对某个模式里的变量执行简单的测试和比较。
  * 关卡由一系列关卡表达式组成，由 `,` 分割，都为 true 是值采薇 true。（AND）
* 关卡序列（guard sequence）是指单一或一系列的关卡，用 `;` 分割，只要一个为 true，它的值就为 true。（OR）
* 原子 true 关卡防止在某个 if 表达式的最后。

```erlang
% Guard 是用于增强模式匹配的结构。
% Guard 可用于简单的测试和比较。
% Guard 可用于函数定义的头部，以`when`关键字开头，或者其他可以使用表达式的地方。
max(X, Y) when X > Y -> X;
max(X, Y) -> Y.

% guard 可以由一系列 guard 表达式组成，这些表达式以逗号分隔。
% `GuardExpr1, GuardExpr2, ..., GuardExprN` 为真，当且仅当每个 guard 表达式均为真。
is_cat(A) when is_atom(A), A =:= cat -> true;
is_cat(A) -> false.
is_dog(A) when is_atom(A), A =:= dog -> true;
is_dog(A) -> false.

% guard 序列 `G1; G2; ...; Gn` 为真，当且仅当其中任意一个 guard 表达式为真。
is_pet(A) when is_dog(A); is_cat(A) -> true;
is_pet(A) -> false.
```

#### case

```erlang
case Expression of
  Pattern1 [when Guard1] -> Body1;
  Pattern2 [when Guard2] -> Body2;
  ...
end

% `case` 表达式。
% `filter` 返回由列表`L`中所有满足`P(x)`为真的元素`X`组成的列表。
filter(P, [H|T]) ->
  case P(H) of
    true -> [H|filter(P, T)];
    false -> filter(P, T)
  end;
filter(P, []) -> [].
filter(fun(X) -> X rem 2 == 0 end, [1, 2, 3, 4]). % [2, 4]
```

1. `Expression` 被执行，假设它的值为 `Value` 
2. `Value` 轮流与 `Pattern1`（带有可选的关卡 `Guard1`）、`Pattern2` 等模式进行匹配，直到匹配成功。
3. 一旦发现匹配，相应的表达式序列就会执行，而表达式序列执行的结果就是 `case` 表达式的值。如果所有模式都不匹配，就会发生异常错误（exception）。

#### if

```erlang
if
  Guard1 -> Expr_seq1;
  Guard2 -> Expr_seq2;
  ...
end

% `if` 表达式。
max(X, Y) ->
  if
    X > Y -> X;
    X < Y -> Y;
    true -> nil;
  end.
```

1. 执行 `Guard1`。 如果得到的值为 `true`，那么if的值就是执行表达式序列 `Expr_seq1` 所得到的值。
2. 如果 `Guard1` 不成功，就会执行 `Guard2`， 以此类推，直到某个关卡成功为止。
3. if表达式必须至少有一个关卡的执行结果为true， 否则就会发生异常错误。
4. 很多时候， `if` 表达式的最后一个关卡是原子 `true`， 确保当其他关卡都失败时表达式的最后部分会被执行。（相当于最后带 else）因为 erlang 的所有表达式都应该有值。

#### 归集器

只遍历列表一次，返回两个列表。

```erlang
%% 归集器
odds_and_even(L) -> odds_and_evens_acc(L, [], []).
odds_and_evens_acc([H|T], Odds, Evens) ->
  case (H rem 2) of
    1 -> odds_and_evens_acc(T, [H|Odds], Evens);
    0 -> odds_and_evens_acc(T, Odds, [H|Evens])
  end;
odds_and_evens_acc([], Odds, Evens) ->
  {Odds, Evens}.
```

### 记录（record）与映射组（map）

**元组**用于保存固定数量的元素，而**列表**用于保存可变数量的元素。**记录**其实就是**元组**的另一种形式。

* 使用 record：有一大堆元组，并且每个元组都有相同的结构
* 使用 map：键值对

#### record

```erlang
% Record 可以将元组中的元素绑定到特定的名称。
% Record 定义可以包含在 Erlang 源代码中，也可以放在后缀为`.hrl`的文件中（Erlang 源代码中 include 这些文件）。
-record(todo, {
  status = reminder,  % Default value
  who = joe,
  text
}).

% 在定义某个 record 之前，我们需要在 shell 中导入 record 的定义。
% 我们可以使用 shell 函数`rr` (read records 的简称）。
rr("records.hrl").  % [todo]

% 创建和更新 record。
X = #todo{}.  % 创建 todo，所有键都是原子
% #todo{status = reminder, who = joe, text = undefined}
X1 = #todo{status = urgent, text = "Fix errata in book"}.
% #todo{status = urgent, who = joe, text = "Fix errata in book"}
X2 = X1#todo{status = done}.  % 创建 X1 的副本，并修改 status 为 done
% #todo{status = done,who = joe,text = "Fix errata in book"}

% 提取 record 字段
> #todo{who=W, text=Txt} = X2.
> W.
joe
> Txt.
"Fix errata in book"
% 如果只是想要记录里的单个字段，就可以使用“点语法”来提取该字段。
> X2#todo.text.
"Fix errata in book"

% 让 shell 忘掉 todo 定义
rf(todo).
```

#### map

* 映射组在系统内部是作为有序集合存储的，打印时总是使用各键排序后的顺序。
* 表达式K => V有两种用途，一种是将现有键K的值更新为新值V，另一种是给映射组添加一个全新的K-V对。这个操作总是成功的。
* 表达式K := V的作用是将现有键K的值更新为新值V。 如果被更新的映射组不包含键K，这个操作就会失败。
* 映射组在比较时首先会比大小，然后再按照键的排序比较键和值。

```erlang
% 创建 map
> F1 = #{a => 1, b => 2}. 
#{a => 1,b => 2}

% => 更新或设值
11> F3 = F1#{c=>xx}.
#{a => 1,b => 2,c => xx}
% := 只能更新值
12> F4=F1#{c := 3}.
** exception error: bad key: c
     in function  maps:update/3
        called as maps:update(c,3,#{a => 1,b => 2})
        *** argument 3: not a map
     in call from erl_eval:'-expr/5-fun-0-'/2 (erl_eval.erl, line 256)
     in call from lists:foldl/3 (lists.erl, line 1267)
13> F4 = F3#{c := 3}. 
#{a => 1,b => 2,c => 3}
```

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202206160157999.png)
![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202206160157692.png)
---
![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202206160159946.png)