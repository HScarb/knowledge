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

##### call

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

接受其他函数作为参数的函数。

#### 2.4.1 map/reduce

##### map

应用函数在每个数组元素。

```js
function pow(x) {
    return x * x;
}
var arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
var results = arr.map(pow); // [1, 4, 9, 16, 25, 36, 49, 64, 81]
```

##### reduce

把函数作用在数组上，把结果继续与序列的下一个元素做积累计算。

```js
var arr = [1, 3, 5, 7, 9];
arr.reduce(function (x, y) {
    return x * 10 + y;
}); // 13579
```

#### 2.4.2 filter

```js
var arr = [1, 2, 4, 5, 6, 9, 10, 15];
var r = arr.filter(function (x) {
    return x % 2 !== 0;
});
r; // [1, 5, 9, 15]

// 接收多个参数
var
    r,
    arr = ['apple', 'strawberry', 'banana', 'pear', 'apple', 'orange', 'orange', 'strawberry'];
r = arr.filter(function (element, index, self) {
    return self.indexOf(element) === index;
});
```

#### 2.4.3 sort

可以接收一个判断函数，返回 -1, 0, 1

#### 2.4.4 Array

* `every()`方法可以判断数组的所有元素是否满足测试条件。
* `find()`方法用于查找符合条件的第一个元素，如果找到了，返回这个元素，否则，返回`undefined`
* `findIndex()`也是查找符合条件的第一个元素，返回这个元素的索引，如果没有找到，返回`-1`
* `forEach()`和`map()`类似，它也把每个元素依次作用于传入的函数，但不会返回新的数组

### 2.5 闭包

#### 2.5.1 函数作为返回值

```js
function lazy_sum(arr) {
    var sum = function () {
        return arr.reduce(function (x, y) {
            return x + y;
        });
    }
    return sum;
}
var f = lazy_sum([1, 2, 3, 4, 5]); // function sum()
f(); // 15
```

这种程序结构称为“闭包（Closure）”。

#### 2.5.2 闭包

当一个函数返回了一个函数后，其内部的局部变量还被新函数引用（上面的 `arr`）。

注意不要引用任何循环变量，或者后续会发生变化的变量。如果一定要引用循环变量，**再创建一个函数，用该函数的参数绑定循环变量当前的值**，无论该循环变量后续如何更改，已绑定到函数参数的值不变。

```js
function count() {
    var arr = [];
    for (var i=1; i<=3; i++) {
        arr.push((function (n) {
            return function () {
                return n * n;
            }
        })(i));	// 创建一个匿名函数并立即执行，需要把整个函数定义括起来
    }
    return arr;
}

var results = count();
var f1 = results[0];
var f2 = results[1];
var f3 = results[2];

f1(); // 1
f2(); // 4
f3(); // 9
```

闭包可以封装一个私有变量

```js
function create_counter(initial) {
    var x = initial || 0;
    return {
        inc: function () {
            x += 1;
            return x;
        }
    }
}
var c1 = create_counter();
c1.inc(); // 1
c1.inc(); // 2
c1.inc(); // 3
```

### 2.6 箭头函数

是匿名函数的一种简写，和匿名函数不同的是内部的`this`是词法作用域，由上下文确定

```js
x => x * x
// 两个参数:
(x, y) => x * x + y * y

// 无参数:
() => 3.14

// 可变参数:
(x, y, ...rest) => {
    var i, sum = x + y;
    for (i=0; i<rest.length; i++) {
        sum += rest[i];
    }
    return sum;
}

// 返回对象，括号括起来
x => ({ foo: x })
```

### 2.7 Generator

像一个函数，可以返回多次。由`function*`定义（注意多出的`*`号），并且，除了`return`语句，还可以用`yield`返回多次。

```js
function* fib(max) {
    var
        t,
        a = 0,
        b = 1,
        n = 0;
    while (n < max) {
        yield a;
        [a, b] = [b, a + b];
        n ++;
    }
    return;
}

var f = fib(5);
f.next(); // {value: 0, done: false}
f.next(); // {value: 1, done: false}
f.next(); // {value: 1, done: false}
f.next(); // {value: 2, done: false}
f.next(); // {value: 3, done: false}
f.next(); // {value: undefined, done: true}

for (var x of fib(10)) {
    console.log(x); // 依次输出0, 1, 1, 2, 3, ...
}
```

## 3. 标准对象

包装对象，不建议使用

```js
var n = new Number(123); // 123,生成了新的包装类型
var b = new Boolean(true); // true,生成了新的包装类型
var s = new String('str'); // 'str',生成了新的包装类型
```

- 不要使用`new Number()`、`new Boolean()`、`new String()`创建包装对象；
- 用`parseInt()`或`parseFloat()`来转换任意类型到`number`；
- 用`String()`来转换任意类型到`string`，或者直接调用某个对象的`toString()`方法；
- 通常不必把任意类型转换为`boolean`再判断，因为可以直接写`if (myVar) {...}`；
- `typeof`操作符可以判断出`number`、`boolean`、`string`、`function`和`undefined`；
- 判断`Array`要使用`Array.isArray(arr)`；
- 判断`null`请使用`myVar === null`；
- 判断某个全局变量是否存在用`typeof window.myVar === 'undefined'`；
- 函数内部判断某个变量是否存在用`typeof myVar === 'undefined'`。

### 3.1 Date

### 3.2 RegExp

### 3.3 JSON

JavaScript内置了JSON的解析。

#### 3.3.1 序列化

```js
var s = JSON.stringify(xiaoming);
// 第二个参数用于筛选需要输出的属性，null 为全部，也可以传入函数对每个键值对进行处理
// 第三个参数用来指定缩进
JSON.stringify(xiaoming, null, '  ');
```

#### 3.3.2 反序列化

```js
JSON.parse('[1,2,3,true]'); // [1, 2, 3, true]
JSON.parse('{"name":"小明","age":14}'); // Object {name: '小明', age: 14}
JSON.parse('true'); // true
JSON.parse('123.45'); // 123.45

// 接收函数，转换解析出的属性
var obj = JSON.parse('{"name":"小明","age":14}', function (key, value) {
    if (key === 'name') {
        return value + '同学';
    }
    return value;
});
console.log(JSON.stringify(obj)); // {name: '小明同学', age: 14}
```

## 4. 面向对象编程

JavaScript不区分类和实例的概念，而是通过原型（prototype）来实现面向对象编程。

```js
var Student = {
    name: 'Robot',
    height: 1.2,
    run: function () {
        console.log(this.name + ' is running...');
    }
};

var xiaoming = {
    name: '小明'
};
// 将 xiaoming 的原型指向对象 Student
xiaoming.__proto__ = Student;
```

JavaScript的原型链和Java的Class区别在于它没有“Class”的概念，所有对象都是实例，所谓继承关系不过是把一个对象的原型指向另一个对象而已。

可以在运行期修改原型对象。

`Object.create()`方法可以传入一个原型对象，并创建一个基于该原型的新对象

```js
// 原型对象:
var Student = {
    name: 'Robot',
    height: 1.2,
    run: function () {
        console.log(this.name + ' is running...');
    }
};

function createStudent(name) {
    // 基于Student原型创建一个新对象:
    var s = Object.create(Student);
    // 初始化新对象:
    s.name = name;
    return s;
}

var xiaoming = createStudent('小明');
xiaoming.run(); // 小明 is running...
xiaoming.__proto__ === Student; // true
```

### 4.1 创建对象

每个创建对象都有原型链，访问对象属性时会逐级往上查，直到 `Object.prototype`。

```js
arr ----> Array.prototype ----> Object.prototype ----> null
foo ----> Function.prototype ----> Object.prototype ----> null
```

#### 4.1.2 构造函数

用 `new` 关键字调用构造函数，可以返回一个对象。`this` 指向新创建的对象，默认返回 `this`。

```js
function Student(name) {
    this.name = name;
    this.hello = function () {
        alert('Hello, ' + this.name + '!');
    }
}
var xiaoming = new Student('小明');
xiaoming instanceof Student; // true

// xiaoming ----> Student.prototype ----> Object.prototype ----> null

// 让所有创建的对象共享一个 hello 函数，节省内存：将 Student.hello 移到 Student.prototype.hello
function Student(name) {
    this.name = name;
}
Student.prototype.hello = function () {
    alert('Hello, ' + this.name + '!');
};

// 编写工厂方法，参数灵活
function createStudent(props) {
    return new Student(props || {})
}
```

### 4.2 原型继承

用于扩展一个原型。

JavaScript的原型继承实现方式就是：

1. 定义新的构造函数，并在内部用`call()`调用希望“继承”的构造函数，并绑定`this`；
2. 借助中间函数`F`实现原型链继承，最好通过封装的`inherits`函数完成；
3. 继续在新的构造函数的原型上定义新方法。

```js
function inherits(Child, Parent) {
    var F = function () {};
    F.prototype = Parent.prototype;
    Child.prototype = new F();
    Child.prototype.constructor = Child;
}

function Student(props) {
    this.name = props.name || 'Unnamed';
}

Student.prototype.hello = function () {
    alert('Hello, ' + this.name + '!');
}

function PrimaryStudent(props) {
    Student.call(this, props);
    this.grade = props.grade || 1;
}

// 实现原型继承链:
inherits(PrimaryStudent, Student);

// 绑定其他方法到PrimaryStudent原型:
PrimaryStudent.prototype.getGrade = function () {
    return this.grade;
};
```

### 4.3 class 继承

`class`的作用就是让JavaScript引擎去实现原来需要我们自己编写的原型链代码。简而言之，用`class`的好处就是极大地简化了原型链代码。

#### 4.3.1 class 定义

```js
class Student {
    constructor(name) {
        this.name = name;
    }

    hello() {
        alert('Hello, ' + this.name + '!');
    }
}
```

#### 4.3.2 class 继承

```js
class PrimaryStudent extends Student {
    constructor(name, grade) {
        super(name); // 记得用super调用父类的构造方法!
        this.grade = grade;
    }

    myGrade() {
        alert('I am at grade ' + this.grade);
    }
}
```

## 5. 浏览器

## 6. 错误处理

高级语言通常都提供了更抽象的错误处理逻辑try ... catch ... finally，JavaScript也不例外。

### 6.1 错误类型

JavaScript有一个标准的`Error`对象表示错误，还有从`Error`派生的`TypeError`、`ReferenceError`等错误对象。

```js
try {
    ...
} catch (e) {
    if (e instanceof TypeError) {
        alert('Type error!');
    } else if (e instanceof Error) {
        alert(e.message);
    } else {
        alert('Error: ' + e);
    }
}
```

### 6.2 抛出错误

```js
throw new Error('输入错误');
```

### 6.3 错误传播

如果在一个函数内部发生了错误，它自身没有捕获，错误就会被抛到外层调用函数，一直沿着函数调用链向上抛出，直到被JavaScript引擎捕获，代码终止执行。

不必在每一个函数内部捕获错误，只需要在合适的地方来个统一捕获。

### 6.4 异步错误处理

JavaScript引擎是一个事件驱动的执行引擎，代码总是以单线程执行，而回调函数的执行需要等到下一个满足条件的事件出现后，才会被执行。涉及到异步代码，无法在调用时捕获异常，原因就是在捕获的当时，回调函数并未执行。

## 9. Node.js

基于JavaScript语言和V8引擎的开源Web服务器项目，第一次把JavaScript带入到后端服务器开发。

优势

* 借助JavaScript天生的事件驱动机制加V8高性能引擎，使编写高性能Web服务轻而易举。
* JavaScript语言本身是完善的函数式语言，在Node环境下，通过模块化的JavaScript代码，加上函数式编程，并且无需考虑浏览器兼容性问题，直接使用最新的ECMAScript 6标准，可以完全满足工程上的需求。

全局启用严格模式

```bash
node --use_strict calc.js
```

### 9.1 模块

Node环境中，一个.js文件就称之为一个模块（module）。可以被其他地方引用，也可以引用其他模块。

```js
// hello.js
var s = 'Hello';

function greet(name) {
    console.log(s + ', ' + name + '!');
}
// 堆外暴露变量
module.exports = greet;
```

```js
// 引入hello模块，用相对路径
var greet = require('./hello');

var s = 'Michael';

greet(s); // Hello, Michael!
```

#### 9.1.1 CommonJS 规范

##### 模块路径搜索

如果只写模块名，Node会依次在内置模块、全局模块和当前模块下查找`hello.js`

#### 9.1.2 模块的实现原理

把一段JavaScript代码用一个函数包装起来，这段代码的所有“全局”变量就变成了函数内部的局部变量。

```js
// 准备module对象:
var module = {
    id: 'hello',
    exports: {}
};
var load = function (module) {
    // 读取的hello.js代码:
    function greet(name) {
        console.log('Hello, ' + name + '!');
    }
    
    module.exports = greet;
    // hello.js代码结束
    return module.exports;
};
var exported = load(module);
// 保存module:
save(module, exported);
```

#### 9.1.3 module.exports vs exports

如果要输出一个键值对象`{}`，可以利用`exports`这个已存在的空对象`{}`，并继续在上面添加新的键值；

如果要输出一个函数或数组，必须直接对`module.exports`对象赋值。

所以我们可以得出结论：直接对`module.exports`赋值，可以应对任何情况：

```js
module.exports = {
    foo: function () { return 'foo'; }
};
```

或者：

```js
module.exports = function () { return 'foo'; };
```

最终，我们*强烈建议*使用`module.exports = xxx`的方式来输出模块变量，这样，你只需要记忆一种方法。

### 9.2 基本模块


---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
