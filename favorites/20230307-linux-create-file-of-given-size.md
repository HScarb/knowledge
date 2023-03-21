# Create a File of a Certain Size in Linux

https://www.baeldung.com/linux/create-file-of-given-size

## 1. Overview

As Linux users, we frequently perform various operations on files. A common operation is to create a file of a certain size.

In this tutorial, we’ll discuss the various ways to achieve this.

## 2. Using the *fallocate* Command

[*fallocate*](https://man7.org/linux/man-pages/man1/fallocate.1.html) is a simple command to allocate disk space by creating a file. Let’s create a file of 100 MiB:

```bash
$ fallocate -l 100M file1.txt
$ ls -lh file1.txt 
-rw-rw-r-- 1 groot groot 100M May 15 20:26 file1.txt
Copy
```

In this case, we’re using the *-l* argument to represent the length of the file in bytes.

The *fallocate* command also accepts sizes in human-readable formats like *Kilobytes (K)*, *Megabytes (M)*, and *Gigabytes (G)*.

## 3. Using the *truncate* Command

The *[truncate](https://man7.org/linux/man-pages/man1/truncate.1.html)* command can extend or shrink the file to a given size. Let’s use it to create a file of 200 MiB:

```bash
$ truncate -s 200M file2.txt
$ ls -lh file2.txt
-rw-rw-r-- 1 groot groot 200M May 15 20:36 file2.txtCopy
```

Here, we’re using the *-s* argument to represent the size of the file in bytes.

**Note, if the file exists and it’s smaller than what is specified with the \*-s\* option, then the file size is increased to the requested size with ASCII NUL bytes. If the existing file is greater in size, then it’s truncated to the requested size.**

## 4. Using the *head* and *tail* Commands

The [*head*](https://www.baeldung.com/linux/head-tail-commands) command can be used with the */dev/zero* file to create a file filled with a set number of ASCII NUL characters:

```bash
$ head --bytes 300K /dev/zero > file3.txt
$ ls -lh file3.txt
-rw-rw-r-- 1 groot groot 300K May 15 20:47 file3.txtCopy
```

In this case, the *–bytes* option represents the desired file size in bytes.

Similarly, the [*tail*](https://www.baeldung.com/linux/head-tail-commands) command can be used in the same way:

```bash
$ tail --bytes 1G /dev/zero > file4.txt
$ ls -lh file4.txt
-rw-rw-r-- 1 groot groot 1.0G May 15 20:52 file4.txtCopy
```

## 5. Using the *dd* Command

The [*dd*](https://man7.org/linux/man-pages/man1/dd.1.html) command converts and copies the file. Let’s use *dd* to create a file of 10 MiB:

```bash
$ dd if=/dev/zero of=file5.txt bs=1M count=10
10+0 records in
10+0 records out
10485760 bytes (10 MB, 10 MiB) copied, 0.0387031 s, 271 MB/s
$ ls -lh file5.txt
-rw-rw-r-- 1 groot groot 10M May 15 20:58 file5.txtCopy
```

Let’s take a look at the arguments:

- *if* represents input file
- *of* represents output file
- *bs* represents block size in bytes
- *count* represents the number of blocks to be copied

## 6. Conclusion

In this tutorial, we discussed five practical methods to create a file of a certain size. These commands can be used in day-to-day life while working with the Linux system.

## 如何选择

https://zhuanlan.zhihu.com/p/453638697

`dd` 、`yes`、`fallocate`、`truncate` 这几个命令都可以创建大文件, 在日常的使用中，我们该如何选择呢 ?

对速度没有很高的要求的情况下，一般首选 `dd` ，如果希望创建的文件中写入自定义的内容的话，使用 `yes`

如果想快速的创建大文件，比如 1 秒内创建一个 100G 的文件，选择 `fallocate` 和 `truncate` ，如果还需要确保文件是实际占用磁盘空间的话，就只剩下 `fallocate` 可选了

大部分情况下，`fallocate` 都能满足要求，所以不想仔细分析的话，使用 `fallocate` 就行了