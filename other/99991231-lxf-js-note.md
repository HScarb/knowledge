# lxf-js-note

## 1. 快速入门

### 1.2 数据类型和变量

#### 1.2.1 数据类型

JS 中定义了以下几种数据类型：

* Number

  ```js
  123; // 整数123
  0.456; // 浮点数0.456
  1.2345e3; // 科学计数法表示1.2345x1000，等同于1234.5
  -99; // 负数
  NaN; // NaN表示Not a Number，当无法计算结果时用NaN表示
  Infinity; // Infinity表示无限大，当数值超过了JavaScript的Number所能表示的最大值时，就表示为Infinity
  ```

* 字符串

* 布尔值

* `null` 和 `undefined`

* 数组

  ```js
  [1, 2, 3.14, 'Hello', null, true];
  new Array(1, 2, 3); // 创建了数组[1, 2, 3]
  ```

* 对象：由键-值组成的无序集合，键都是字符串类型，值可以是任意数据类型

  ```js
  var person = {
      name: 'Bob',
      age: 20,
      tags: ['js', 'web', 'mobile'],
      city: 'Beijing',
      hasCar: true,
      zipcode: null
  };
  person.name; // 'Bob'
  person.zipcode; // null
  ```

* 变量：变量名是大小写英文、数字、`$`和`_`的组合，且不能用数字开头

#### 1.2.2 比较运算符

* `==`：它会**自动转换数据类型**再比较，很多时候，会得到非常诡异的结果；

* `===`：它**不会自动转换数据类型**，如果数据类型不一致，返回`false`，如果一致，再比较。

* `NaN`这个特殊的Number与所有其他值都不相等，包括它自己。唯一能判断`NaN`的方法是通过`isNaN()`函数。
* 浮点数在运算过程中会产生误差。要比较两个浮点数是否相等，只能计算它们之差的绝对值，看是否小于某个阈值

#### 1.2.3 strict 模式

在strict模式下运行的JavaScript代码，强制通过`var`申明变量，避免变量自动被声明为全局变量。

```js
'use strict'; // 在JavaScript代码的第一行写上'use strict'
```

### 1.3 字符串

```js
`这是一个
多行
字符串`;
// 字符串连接
var message = '你好, ' + name + ', 你今年' + age + '岁了!';
// 模板字符串
var name = '小明';
var age = 20;
var message = `你好, ${name}, 你今年${age}岁了!`;

// 获取长度
var s = 'Hello, world!';
s.length; // 13
// 获取字符
var s = 'Hello, world!';
s[0]; // 'H'
s[6]; // ' '
s[7]; // 'w'
s[12]; // '!'
s[13]; // undefined 超出范围的索引不会报错，但一律返回undefined
```

### 1.4 数组

```js
// 直接给Array的length赋一个新的值会导致Array大小的变化
var arr = [1, 2, 3];
arr.length; // 3
arr.length = 6;
arr; // arr变为[1, 2, 3, undefined, undefined, undefined]
arr.length = 2;
arr; // arr变为[1, 2]

// 通过索引赋值时，索引超过了范围，同样会引起Array大小的变化
var arr = [1, 2, 3];
arr[5] = 'x';
arr; // arr变为[1, 2, 3, undefined, undefined, 'x']

// slice() 与 String 的 substring() 类似，截取部分元素：[x, y)
var arr = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
arr.slice(0, 3); // 从索引0开始，到索引3结束，但不包括索引3: ['A', 'B', 'C']
arr.slice(3); // 从索引3开始到结束: ['D', 'E', 'F', 'G']

// push()向Array的末尾添加若干元素，pop()则把Array的最后一个元素删除掉
var arr = [1, 2];
arr.push('A', 'B'); // 返回Array新的长度: 4
arr; // [1, 2, 'A', 'B']
arr.pop(); // pop()返回'B'
arr; // [1, 2, 'A']
arr.pop(); arr.pop(); arr.pop(); // 连续pop 3次
arr; // []
arr.pop(); // 空数组继续pop不会报错，而是返回undefined

// unshift()：往Array的头部添加若干元素，shift()：把Array的第一个元素删掉
var arr = [1, 2];
arr.unshift('A', 'B'); // 返回Array新的长度: 4
arr; // ['A', 'B', 1, 2]
arr.shift(); // 'A'
arr; // ['B', 1, 2]
arr.shift(); arr.shift(); arr.shift(); // 连续shift 3次
arr; // []
arr.shift(); // 空数组继续shift不会报错，而是返回undefined
arr; // []

// sort 排序
var arr = ['B', 'C', 'A'];
arr.sort();
arr; // ['A', 'B', 'C']

// splice：从指定索引开始删除若干元素，然后再从该位置添加若干元素
var arr = ['Microsoft', 'Apple', 'Yahoo', 'AOL', 'Excite', 'Oracle'];
// 从索引2开始删除3个元素,然后再添加两个元素:
arr.splice(2, 3, 'Google', 'Facebook'); // 返回删除的元素 ['Yahoo', 'AOL', 'Excite']
arr; // ['Microsoft', 'Apple', 'Google', 'Facebook', 'Oracle']
// 只删除,不添加:
arr.splice(2, 2); // ['Google', 'Facebook']
arr; // ['Microsoft', 'Apple', 'Oracle']
// 只添加,不删除:
arr.splice(2, 0, 'Google', 'Facebook'); // 返回[],因为没有删除任何元素
arr; // ['Microsoft', 'Apple', 'Google', 'Facebook', 'Oracle']

// concat 连接，返回一个新的 Array
var arr = ['A', 'B', 'C'];
arr.concat(1, 2, [3, 4]); // ['A', 'B', 'C', 1, 2, 3, 4]

// join 串联字符串
var arr = ['A', 'B', 'C', 1, 2, 3];
arr.join('-'); // 'A-B-C-1-2-3'
```

### 1.5 对象

```js
var xiaoming = {
    name: '小明',
    'middle-school': 'No.1 Middle School'
};
xiaoming['middle-school']; // 'No.1 Middle School'

'name' in xiaoming; // true
'grade' in xiaoming; // false
'toString' in xiaoming; // true，in判断一个属性存在，这个属性不一定是xiaoming的，它可能是xiaoming继承得到的

delete xiaoming['name']; // 删除name属性
xiaoming.name; // undefined
delete xiaoming.school; // 删除一个不存在的school属性也不会报错

// 判断一个属性是否是xiaoming自身拥有的，而不是继承得到的，可以用hasOwnProperty()方法
var xiaoming = {
    name: '小明'
};
xiaoming.hasOwnProperty('name'); // true
xiaoming.hasOwnProperty('toString'); // false
```

### 1.8 Map 和 Set

为了解决对象的 Key 必须为字符串的问题，ES6 引入了 `Map` 和 `Set `。

#### 1.8.1 Map

```js
var m = new Map([['Michael', 95], ['Bob', 75], ['Tracy', 85]]);
m.get('Michael'); // 95
var m = new Map(); // 空Map
m.set('Adam', 67); // 添加新的key-value
m.set('Bob', 59);
m.has('Adam'); // 是否存在key 'Adam': true
m.get('Adam'); // 67
m.delete('Adam'); // 删除key 'Adam'
m.get('Adam'); // undefined
```

#### 1.8.2 Set

Key 不能重复

```js
var s1 = new Set(); // 空Set
var s2 = new Set([1, 2, 3]); // 含1, 2, 3
```

### 1.9 iterable

遍历`Array`可以采用下标循环，遍历`Map`和`Set`就无法使用下标。为了统一集合类型，ES6标准引入了新的`iterable`类型，`Array`、`Map`和`Set`都属于`iterable`类型。

具有`iterable`类型的集合可以通过新的`for ... of`循环来遍历。

---

* `for ... in ` ：便利对象的属性名称

* `for ... of `：只遍历集合本身的元素

  ```js
  var a = ['A', 'B', 'C'];
  var s = new Set(['A', 'B', 'C']);
  var m = new Map([[1, 'x'], [2, 'y'], [3, 'z']]);
  for (var x of a) { // 遍历Array
      console.log(x);
  }
  for (var x of s) { // 遍历Set
      console.log(x);
  }
  for (var x of m) { // 遍历Map
      console.log(x[0] + '=' + x[1]);
  }
  ```

* `forEach`：iterator 内置的方法，每次迭代就自动回调该函数

  ```js
  var a = ['A', 'B', 'C'];
  // 如果对某些参数不感兴趣，JavaScript的函数调用不要求参数必须一致，可以忽略它们
  a.forEach(function (element, index, array) {
      // element: 指向当前元素的值
      // index: 指向当前索引
      // array: 指向Array对象本身
      console.log(element + ', index = ' + index);
  });
  ```

## 2. 函数

### 2.1 函数定义和调用

#### 2.1.1 函数定义

```js
function abs(x) {
    if (x >= 0) {
        return x;
    } else {
        return -x;
    }
}

var abs = function (x) {
    if (x >= 0) {
        return x;
    } else {
        return -x;
    }
};
```

#### 2.1.2 调用函数

传入参数个数多或者少都允许，少的话变量会被赋值为 `undefined`。

##### arguments

`arguments` 只在函数内部起作用，并且永远指向**当前函数的调用者传入的所有参数**。`arguments`类似`Array`但它不是一个`Array`，常用于判断传入参数的个数。

##### rest

表示除了已定义参数之外的参数。`rest` 只能写在最后，前面用`...`标识

```js
function foo(a, b, ...rest) {
    console.log('a = ' + a);
    console.log('b = ' + b);
    console.log(rest);
}

foo(1, 2, 3, 4, 5);
// 结果:
// a = 1
// b = 2
// Array [ 3, 4, 5 ]

foo(1);
// 结果:
// a = 1
// b = undefined
// Array []
```

### 2.2 变量作用域与解构赋值

`var`申明的变量有作用域。内部函数可以访问外部函数定义的变量。在查找变量时从自身函数定义开始，从“内”向“外”查找。

#### 2.2.1 变量提升

JavaScript的函数会先扫描整个函数体的语句，把所有申明的**变量“提升”到函数顶部**。所以应在函数内部**先声明所有变量**。

```js
function foo() {
    var
        x = 1, // x初始化为1
        y = x + 1, // y初始化为2
        z, i; // z和i为undefined
    // 其他语句:
    for (i=0; i<100; i++) {
        ...
    }
}
```

#### 2.2.2 全局作用域

不在任何函数内定义的变量就具有全局作用域，它们作为属性被绑定到 JS 的全局对象 `window`。

#### 2.2.3 名字空间

减少命名冲突的方法是把自己的所有变量和函数全部绑定到一个全局变量中。

```js
// 唯一的全局变量MYAPP:
var MYAPP = {};

// 其他变量:
MYAPP.name = 'myapp';
MYAPP.version = 1.0;

// 其他函数:
MYAPP.foo = function () {
    return 'foo';
};
```

#### 2.2.4 局部作用域

`var` 变量的作用域是函数维度的，无法定义在 `for` 循环中局部作用域的变量。

`let`替代`var`可以申明一个块级作用域的变量

```js
function foo() {
    var sum = 0;
    for (let i=0; i<100; i++) {
        sum += i;
    }
    // SyntaxError:
    i += 1;
}
```

#### 2.2.5 常量

`const`定义常量，`const`与`let`都具有块级作用域，一般常量用全部大写的名称。

#### 2.2.6 解构赋值

同时对一组变量进行赋值，多个变量用中括号括起来。

```js
var [x, y, z] = ['hello', 'JavaScript', 'ES6'];
let [x, [y, z]] = ['hello', ['JavaScript', 'ES6']];
let [, , z] = ['hello', 'JavaScript', 'ES6']; // 忽略前两个元素，只对z赋值第三个元素

var person = {
    name: '小明',
    age: 20,
    gender: 'male',
    passport: 'G-12345678',
    school: 'No.4 middle school',
    address: {
        city: 'Beijing',
        street: 'No.1 Road',
        zipcode: '100001'
    }
};
var {name, address: {city, zip}} = person;
name; // '小明'
city; // 'Beijing'
zip; // undefined, 因为属性名是zipcode而不是zip
// 注意: address不是变量，而是为了让city和zip获得嵌套的address对象的属性:
address; // Uncaught ReferenceError: address is not defined

var person = {
    name: '小明',
    age: 20,
    gender: 'male',
    passport: 'G-12345678',
    school: 'No.4 middle school'
};

// 把passport属性赋值给变量id:
// 对singe设置默认值
let {name, passport:id, single=true} = person;
name; // '小明'
id; // 'G-12345678'
// 注意: passport不是变量，而是为了让变量id获得passport属性:
passport; // Uncaught ReferenceError: passport is not defined
```

其他使用场景

```js
var x=1, y=2;
[x, y] = [y, x]

// 快速获取当前页面的域名和路径
var {hostname:domain, pathname:path} = location;

function buildDate({year, month, day, hour=0, minute=0, second=0}) {
    return new Date(year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second);
}
buildDate({ year: 2017, month: 1, day: 1 });
// Sun Jan 01 2017 00:00:00 GMT+0800 (CST)
```

### 2.3 方法

绑定到对象上的函数，内部可以使用 `this`，表示当前对象。

在一个独立函数调用中，根据是否是strict模式，`this`指向`undefined`或`window`。

#### 2.3.1 apply

apply 方法指定 `this` 指向哪个对象，它接收两个参数，第一个参数就是需要绑定的`this`变量，第二个参数是`Array`，表示函数本身的参数。

另一个与`apply()`类似的方法是`call()`，唯一区别是：

- `apply()`把参数打包成`Array`再传入；
- `call()`把参数按顺序传入。

```js
Math.max.apply(null, [3, 5, 4]); // 5
Math.max.call(null, 3, 5, 4); // 5
// 对普通函数，通常把this绑定为null
```

#### 2.3.2 装饰器

```js
// 用自定义函数替换原函数
var count = 0;
var oldParseInt = parseInt; // 保存原函数

window.parseInt = function () {
    count += 1;
    return oldParseInt.apply(null, arguments); // 调用原函数
};
```

### 2.4 高阶函数

### 2.5 闭包

