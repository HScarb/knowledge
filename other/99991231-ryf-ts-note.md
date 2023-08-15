# 阮一峰 TypeScript 教程 笔记

https://wangdoc.com/typescript/

## 1. 简介

### 1.3 动态类型与静态类型

TypeScript 引入了一个更强大、更严格的类型系统，属于静态类型语言。变量类型和属性都是静态的，不允许随机增删

## 2. 基本用法

### 2.3 TypeScript 的编译

TypeScript 官方没有做运行环境，只提供编译器。编译时，会将类型声明和类型相关的代码全部删除，只留下能运行的 JavaScript 代码，并且不会改变 JavaScript 的运行结果。

### 2.6 tsc 编译器

```bash
npm install -g typescript
tsc -v
tsc -h
tsc --all
```

```bash
pnpm add typescript -D
pnpm tsc
```

```bash
tsc file1.ts file2.ts --outFile app.js	# 多个文件编译成一个
tsc app.ts --outDir dist	# 指定保存到其他目录
tsc --target es2015 app.ts	# 指定编译后的 JavaScript 版本
tsc --noEmitOnError app.ts	# 报错就停止编译，不生成编译产物
tsc --noEmit app.ts			# 只检查类型是否正确，不生成 JavaScript 文件
```

#### 2.6.5 tsconfig.json

```bash
$ tsc file1.ts file2.ts --outFile dist/app.js
```

上面这个命令写成`tsconfig.json`，就是下面这样。

```json
{
  "files": ["file1.ts", "file2.ts"],
  "compilerOptions": {
    "outFile": "dist/app.js"
  }
}
```

有了这个配置文件，编译时直接调用`tsc`命令就可以了。

```bash
$ tsc
```

### 2.7 ts-node 模块

[ts-node](https://github.com/TypeStrong/ts-node) 是一个非官方的 npm 模块，可以直接运行 TypeScript 代码。

```bash
$ npm install -g ts-node
$ ts-node script.ts
$ ts-node
> const twice = (x:string) => x + x;
> twice('abc')
'abcabc'
> 
```

## 3. any 类型，unknown 类型，never 类型

TypeScript 有两个“顶层类型”（`any`和`unknown`），但是“底层类型”只有`never`唯一一个。

### 3.1 any 类型

没有任何限制，该类型的变量可以赋予任意类型的值。

对于开发者没有指定类型、TypeScript 必须自己推断类型的那些变量，如果无法推断出类型，TypeScript 就会认为该变量的类型是`any`。

`any`类型除了关闭类型检查，还会“污染”其他变量。它可以赋值给其他任何类型的变量（因为没有类型检查），导致其他变量出错。

```ts
let x:any = 'hello';
let y:number;

y = x; // 不报错

y * 123 // 不报错
y.toFixed() // 不报错
```

### 3.2 unknown 类型

与 `any` 含义相同，表示类型不确定。解决 `any` 类型污染问题。

限制：

1. 不能直接赋值给其他类型的变量（除了`any`类型和`unknown`类型）。

   ```ts
   let v:unknown = 123;
   
   let v1:boolean = v; // 报错
   let v2:number = v; // 报错
   ```

2. 不能直接调用 `unknown` 类型变量的方法和属性。

3. 能够进行的运算是有限的，只能进行比较运算（运算符`==`、`===`、`!=`、`!==`、`||`、`&&`、`?`）、取反运算（运算符`!`）、`typeof`运算符和`instanceof`运算符这几种，其他运算都会报错。

* 只有经过类型缩小（缩小 `unknown` 变量类型范围）才能使用

  ```ts
  let a:unknown = 1;
  
  if (typeof a === 'number') {
    let r = a + 10; // 正确
  }
  
  let s:unknown = 'hello';
  
  if (typeof s === 'string') {
    s.length; // 正确
  }
  ```

### 3.3 never 类型

空类型，不包含任何值。不能给它赋任何值。

使用场景：

* 在一些类型运算中，保证类型运算的完整性。

    ```ts
    function fn(x:string|number) {
      if (typeof x === 'string') {
        // ...
      } else if (typeof x === 'number') {
        // ...
      } else {
        x; // never 类型
      }
    }
```

* 可以赋值给任意其他类型

  ```ts
  function f():never {
    throw new Error('Error');
  }
  
  let v1:number = f(); // 不报错
  let v2:string = f(); // 不报错
  let v3:boolean = f(); // 不报错
```

## 4. 类型系统

### 4.1 基本类型

JavaScript 语言（注意，不是 TypeScript）将值分成8种类型。

- boolean
- string
- number
- bigint
- symbol
- object：对象、数组、函数
- undefined：未定义
- null：空

TypeScript 继承了 JavaScript 的类型设计，以上8种类型可以看作 TypeScript 的基本类型。

注意，上面所有类型的名称都是小写字母，首字母大写的`Number`、`String`、`Boolean`等在 JavaScript 语言中都是内置对象，而不是类型名称。

另外，undefined 和 null 既可以作为值，也可以作为类型，取决于在哪里使用它们。

### 4.2 包装对象类型

#### 4.2.1 包装对象的概念

JavaScript 的8种类型之中，五种属于原始类型（primitive value），代表最基本的、不可再分的值。

- boolean
- string
- number
- bigint
- symbol

五种原始类型的值，都有对应的包装对象（wrapper object）。指的是这些值在需要时，会自动产生的对象。

`Symbol()`和`BigInt()`不能作为构造函数使用，剩下三种可以。

- `Boolean()`
- `String()`
- `Number()`

```ts
const s = new String('hello');
typeof s // 'object'
s.charAt(1) // 'e'
```

#### 4.2.2 包装对象类型与字面量类型

`String`类型可以赋值为字符串的字面量，也可以赋值为包装对象。但是，`string`类型只能赋值为字面量，赋值为包装对象就会报错。

```ts
const s1:String = 'hello'; // 正确
const s2:String = new String('hello'); // 正确

const s3:string = 'hello'; // 正确
const s4:string = new String('hello'); // 报错
```

建议**只使用小写类型**，不使用大写类型。因为绝大部分使用原始类型的场合，都是使用字面量，不使用包装对象。而且，TypeScript 把很多内置方法的参数，定义成小写类型，使用大写类型会报错。

### 4.3 Object 类型与 object 类型

#### 4.3.1 Object 类型

所有可以转成对象的值，都是`Object`类型，这囊括了几乎所有的值。除了`undefined`和`null`这两个值不能转为对象，其他任何值都可以赋值给`Object`类型。

`{}`是`Object`类型的简写形式，所以使用`Object`时常常用空对象代替。

```ts
let obj:{};
 
obj = true;
obj = 'hi';
obj = 1;
obj = { foo: 123 };
obj = [1, 2];
obj = (a:number) => a + 1;
```

#### 4.3.2 object 类型

小写的`object`类型代表 JavaScript 里面的**狭义**对象，即可以用字面量表示的对象，只包含对象、数组和函数，不包括原始类型的值。

```ts
let obj:object;
 
obj = { foo: 123 };
obj = [1, 2];
obj = (a:number) => a + 1;
obj = true; // 报错
obj = 'hi'; // 报错
obj = 1; // 报错
```

大多数时候，我们使用对象类型，只希望包含真正的对象，不希望包含原始类型。所以，**建议总是使用小写类型`object`**，不使用大写类型`Object`。

### 4.4 undefined 和 null 的特殊性

任何其他类型的变量都可以赋值为`undefined`或`null`。

### 4.5 值类型

单个值也是一种类型，称为“值类型”。

遇到`const`命令声明的变量，如果代码里面没有注明类型，就会推断该变量是值类型。

```ts
let x:'hello';

x = 'hello'; // 正确
x = 'world'; // 报错

// x 的类型是 "https"
const x = 'https';

// y 的类型是 string
const y:string = 'https';
```

只包含单个值的值类型，用处不大。实际开发中，往往将多个值结合，作为联合类型使用。

### 4.6 联合类型

联合类型（union types）指的是多个类型组成的一个新类型，使用符号`|`表示。

联合类型`A|B`表示，任何一个类型只要属于`A`或`B`，就属于联合类型`A|B`。

```ts
let x:string|number;

x = 123; // 正确
x = 'abc'; // 正确
```

联合类型可以与值类型相结合，表示一个变量的值有若干种可能。

```ts
let setting:true|false;
let gender:'male'|'female';
let rainbowColor:'赤'|'橙'|'黄'|'绿'|'青'|'蓝'|'紫';
let name:string|null;
let x:
  | 'one'
  | 'two'
  | 'three'
  | 'four';
```

如果一个变量有多种类型，读取该变量时，往往需要进行“类型缩小”（type narrowing），区分该值到底属于哪一种类型，然后再进一步处理。

```ts
function getPort(scheme: 'http'|'https') {
  switch (scheme) {
    case 'http':
      return 80;
    case 'https':
      return 443;
  }
}
```

### 4.7 交叉类型

交叉类型`A&B`表示，任何一个类型必须同时属于`A`和`B`，才属于交叉类型`A&B`。

```ts
// 主要用途是表示对象的合成
let obj:
  { foo: string } &
  { bar: string };

obj = {
  foo: 'hello',
  bar: 'world'
};

// 为对象类型添加新属性
type A = { foo: number };

type B = A & { bar: number };
```

### 4.8 type 命令

`type`命令用来定义一个类型的别名。作用域是**块级作用域**。

```ts
type Age = number;

let age:Age = 55;
```

### 4.9 typeof 运算符

JavaScript 里面，`typeof`运算符只可能返回八种结果，而且都是字符串。

```js
typeof undefined; // "undefined"
typeof true; // "boolean"
typeof 1337; // "number"
typeof "foo"; // "string"
typeof {}; // "object"
typeof parseInt; // "function"
typeof Symbol(); // "symbol"
typeof 127n // "bigint"
```

TypeScript 将`typeof`运算符移植到了类型运算，它的操作数依然是一个值，但是返回的不是字符串，而是该值的 TypeScript 类型。

```ts
const a = { x: 0 };

type T0 = typeof a;   // { x: number }
type T1 = typeof a.x; // number

let a = 1;
let b:typeof a;

if (typeof a === 'number') {
  b = a;
}
```

`typeof`命令的参数不能是类型。

### 4.10 块级类型声明

类型可以声明在代码块（用大括号表示）里面，并且只在当前代码块有效。

```ts
if (true) {
  type T = number;
  let v:T = 5;
} else {
  type T = string;
  let v:T = 'hello';
}
```

### 4.11 类型的兼容

```ts
type T = number|string;

let a:number = 1;
let b:T = a;
```

如果类型`A`的值可以赋值给类型`B`，那么类型`A`就称为类型`B`的子类型（subtype）。在上例中，类型`number`就是类型`number|string`的子类型。

凡是可以使用父类型的地方，都可以使用子类型，但是反过来不行。

## 5. 数组

JavaScript 数组在 TypeScript 里面分成两种类型，分别是数组（array）和元组（tuple）。

### 5.1 简介

TypeScript 的数组所有成员类型必须相同。

```ts
let arr:number[] = [1, 2, 3];
let arr:(number|string)[];
let arr:any[];

// 另一种写法，用 Array 接口
let arr:Array<number> = [1, 2, 3];
let arr:Array<number|string>;
```

### 5.2 数组的类型推断

```ts
// 推断为 any[]
const arr = [];
// 赋值时会自动更新类型推断
arr.push(123);
arr // 推断类型为 number[]

arr.push('abc');
arr // 推断类型为 (string|number)[]
```

类型推断的自动更新只发生初始值为空数组的情况。如果初始值不是空数组，类型推断就不会更新。

### 5.3 只读数组，const 断言

JavaScript `const`命令声明的数组变量是可以改变成员。TypeScript 允许声明只读数组，方法是在数组类型前面加上`readonly`关键字。

TypeScript 将`readonly number[]`与`number[]`视为两种不一样的类型，后者是前者的子类型。（数组是只读数组的子类型）

```ts
const arr:readonly number[] = [0, 1];

arr[1] = 2; // 报错
arr.push(3); // 报错
delete arr[0]; // 报错

// 另外写法
const a1:ReadonlyArray<number> = [0, 1];
const a2:Readonly<number[]> = [0, 1];
```

### 5.4 多维数组

```ts
var multi:number[][] = [[1,2,3], [23,24,25]];
```

## 6. 元组

### 6.1 简介

TypeScript 特有的数据类型，各个成员的类型可以不同的数组。必须声明每个成员的类型。

```ts
// 数组的成员类型写在方括号外面（number[]），元组的成员类型是写在方括号里面（[number]）
const s:[string, string, boolean] = ['a', 'b', true];
// 问号后缀表示该成员是可选的，可选成员必须在必选成员之后
let a:[number, number?] = [1];
// 扩展运算符 ... 表示不限成员数量的元组，它可以用在任意位置
type NamedNums = [
  string,
  ...number[]
];
const a:NamedNums = ['A', 1, 2];
// 不确定元组成员类型和数量，可以放置任意数量和类型的成员
type Tuple = [...any[]];
// 方括号读取成员类型
type Tuple = [string, number];
type Age = Tuple[1]; // number
```

### 6.2 只读元组

```ts
type t = readonly [number, string]
type t = Readonly<[number, string]>		// 泛型写法Readonly<T>
```

### 6.4 扩展运算符

扩展运算符（`...`）将**数组**（注意，不是元组）转换成一个逗号分隔的序列，这时 TypeScript 会认为这个序列的成员数量是不确定的，因为数组的成员数量是不确定的。

```ts
const arr = [1, 2, 3];
console.log(...arr)
```

元组使用扩展运算符，成员数量是确定的。

## 7. symbol 类型

### 7.1 简介

Symbol 是 ES2015 新引入的一种原始类型的值。它类似于字符串，但是每一个 Symbol 值都是**独一无二**的，与其他任何值都不相等。

```ts
let x:symbol = Symbol();
let y:symbol = Symbol();

x === y // false
```

## 8. 函数

### 8.1 简介

需要在声明函数时，给出参数的类型和返回值的类型。缺乏足够信息，就会推断该参数的类型为`any`。

```ts
// 写法一
const hello = function (txt:string) {
  console.log('hello ' + txt);
}

// 写法二
const hello: (txt:string) => void = function (txt) {
  console.log('hello ' + txt);
};

// 用type命令为函数类型定义一个别名，便于指定给其他变量。
type MyFunc = (txt:string) => void;

const hello:MyFunc = function (txt) {
  console.log('hello ' + txt);
};
```

TypeScript 允许省略参数。

### 8.2 Function 类型

Function 类型表示函数

### 8.3 箭头函数

普通函数的一种简化写法。

```ts
const repeat = (str:string, times:number):string => str.repeat(times);

function greet(fn:(a:string) => void):void {
  fn('world');
}
```

### 8.4 可选参数

```ts
function f(x?:number) {
  // ...
}

f(); // OK
f(10); // OK
```

### 8.5 参数默认值

```ts
function createPoint(x:number = 0, y:number = 0):[number, number] {
  return [x, y];
}

createPoint() // [0, 0]
```

### 8.6 参数解构

可以用类型别名

```ts
type ABC = { a:number; b:number; c:number };

function sum({ a, b, c }:ABC) {
  console.log(a + b + c);
}
```

### 8.7 rest 参数

表示函数剩余的所有参数，可以试数组，也可以是元组。

```ts
// rest 参数为数组
function joinNumbers(...nums:number[]) {
  // ...
}

// rest 参数为元组
function f(...args:[boolean, number]) {
  // ...
}
```

### 8.8 readonly 只读参数

```ts
function arraySum(arr:readonly number[]) {
  // ...
  arr[0] = 0; // 报错
}
```

### 8.9 void 类型

表示函数没有返回值

```ts
function f():void {
  console.log('hello');
}
```

### 8.10 never 类型

`never`类型表示肯定不会出现的值。它用在函数的返回值，就表示某个函数肯定不会返回值，即函数不会正常执行结束。

#### 抛出错误的函数

```ts
function fail(msg:string):never {
  throw new Error(msg);
}
```

#### 无限执行的函数

```ts
const sing = function():never {
  while (true) {
    console.log('sing');
  }
};
```

### 8.11 局部类型

声明其他类型，只在函数内部有效

```ts
function hello(txt:string) {
  type message = string;
  let newTxt:message = 'hello ' + txt;
  return newTxt;
}

const newTxt:message = hello('world'); // 报错
```

### 8.12 高阶函数

函数的返回值还是一个函数，那么前一个函数就称为高阶函数（higher-order function）。

```ts
(someValue: number) => (multiplier: number) => someValue * multiplier;
```

### 8.13 函数重载

接受不同类型或不同个数的参数，并且根据参数的不同，会有不同的函数行为。

TypeScript 对于“函数重载”的类型声明方法是，逐一定义每一种情况的类型。

```ts
// 声明
function reverse(str:string):string;
function reverse(arr:any[]):any[];
// 完整类型声明，兼容前面的重载
function reverse(
  stringOrArray:string|any[]
):string|any[] {
  if (typeof stringOrArray === 'string')
    return stringOrArray.split('').reverse().join('');
  else
    return stringOrArray.slice().reverse();
}
```

### 8.14 构造函数

使用`new`命令调用。构造函数的类型写法，就是在参数列表前面加上`new`命令。

```ts
class Animal {
  numLegs:number = 4;
}
// 构造函数
type AnimalConstructor = new () => Animal;
// 传入一个构造函数
function create(c:AnimalConstructor):Animal {
  return new c();
}

const a = create(Animal);
```

## 9. 对象

### 9.1 简介

```ts
const obj:{
  x:number;		// 可以以分号结尾
  y:number;
  add(x:number, y:number): number;
} = { x: 1, y: 1 };

// 属性类型以逗号结尾
type MyObj = {
  x:number,
  y:number,
};
```

### 9.2 可选属性

在属性名后面加一个问号。

```ts
const obj: {
  x: number;
  y?: number;
} = { x: 1 };

// 可选属性读取之前，需要判断是否为undefined才能使用
// 写法一
let firstName = (user.firstName === undefined) ? 'Foo' : user.firstName;
let lastName = (user.lastName === undefined) ? 'Bar' : user.lastName;

// 写法二，使用Null判断运算符??
let firstName = user.firstName ?? 'Foo';
let lastName = user.lastName ?? 'Bar';
```

### 9.3 只读属性

```ts
const person:{
  readonly age: number
} = { age: 20 };

person.age = 21; // 报错

// 只能在对象初始化时赋值
type Point = {
  readonly x: number;
  readonly y: number;
};

const p:Point = { x: 0, y: 0 };

p.x = 100; // 报错
```

### 9.4 属性名的索引类型

```ts
type MyObj = {
  [property: string]: string	// 不管这个对象有多少属性，只要属性名为字符串，且属性值也是字符串，就符合这个类型声明。
};

const obj:MyObj = {
  foo: 'a',
  bar: 'b',
  baz: 'c',
};
```

### 9.5 解构赋值

用于直接从对象中提取属性

```ts
const {id, name, price} = product;
// 另一种写法：类型写法
const {id, name, price}:{
  id: string;
  name: string;
  price: number
} = product;
```

### 9.7 严格字面量检查

```ts
const point:{
  x:number;
  y:number;
} = {
  x: 1,
  y: 1,
  z: 1 // 报错
};

const myPoint = {
  x: 1,
  y: 1,
  z: 1
};

const point:{
  x:number;
  y:number;
} = myPoint; // 正确，等号右边是变量，不触发严格字面量检查
```

### 9.9 空对象

这种写法其实在 JavaScript 很常见：先声明一个空对象，然后向空对象添加属性。但是，TypeScript 不允许动态添加属性，所以对象不能分步生成，必须生成时一次性声明所有属性。

```ts
// 错误
const pt = {};
pt.x = 3;
pt.y = 4;

// 正确
const pt = {
  x: 3,
  y: 4
};
```

