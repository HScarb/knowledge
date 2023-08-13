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


---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
