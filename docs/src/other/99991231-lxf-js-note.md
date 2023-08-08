---
title: lxf-js-note
author: Scarb
date: 9999-12-31
---

原文地址：[http://hscarb.github.io/other/99991231-lxf-js-note.html](http://hscarb.github.io/other/99991231-lxf-js-note.html)

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

// slice() 与 String 的 substring() 类似，截取部分元素
var arr = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
arr.slice(0, 3); // 从索引0开始，到索引3结束，但不包括索引3: ['A', 'B', 'C']
arr.slice(3); // 从索引3开始到结束: ['D', 'E', 'F', 'G']

// 
```



---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
