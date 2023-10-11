# 一致性哈希 原理和实现

## 1. 背景

### 1.1 使用场景

在分布式系统（数据分片）中，为了提高系统容量，就会将数据水平切分到不同的节点来存储，这样每个节点保存的数据可能是不同的。

比如**一个分布式 KV（key-valu） 缓存系统，它的所有 key 分布在不同节点，但某个 key 应该到哪个或者哪些节点上获得，应该是确定的**。

在访问这个系统时，我们希望让对相同 key 的操作落在相同的节点上。

这里就需要使用到一致性哈希算法，将 key 通过一致性哈希计算之后可以得到相同的节点编号。

### 1.1 什么是一致性哈希算法

了解一致性哈希之前需要先了解**哈希算法**，它的作用是：对任意一组输入数据进行计算，得到一个固定长度的输出摘要。相同的输入一定得到相同的输出，不同的输入大概率得到不同的输出。

最简单的哈希算法是通过将 key 转换为整数，然后根据节点数取模，比如：

```java
public static int simpleHash(String key, int tableSize) {
    int sum = 0;
    for (char c : key.toCharArray()) {
        sum += (int) c;
    }
    return sum % tableSize;
}
```

其中 `tableSize` 为分布式系统的节点个数。

但是当节点数量发生变化时（增加或删除节点），这里的 `tableSize` 将发生改变，简单的哈希算法无法保证节点数量发生之后，对相同的 key 哈希仍然能够得到同样的结果。这就意味着如果仍然需要正常使用这个分布式系统，对同一个 key 对应的数据来说，它需要迁移到新的哈希结果对应的节点。

这就需要引入一致性哈希算法，它能够确保只发生少量的数据迁移。

## 2. 概要设计

上面说到，哈希算法是将 key 用某种方式转换成数字，然后根据节点数取模。当节点数量改变之后计算的结果自然也会改变。

### 2.1 哈希环

想要让节点数量改变后计算结果尽可能保持稳定，可以换一个思路：将节点相对均匀地放置在一个环上，然后将 key 经过 hash 的结果距离最近的节点作为哈希的结果。这个环被称为哈希环。

![img](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202310170128062.png)

如图所示，将 3 个节点均匀分布在范围为 [0, 2^32) 的范围中（也就是 `Long` 的范围），hash 之后的 key 在哈希环上查找下一个距离它最近的节点，作为哈希的结果。

下面展示增加和减少节点的场景，无论是增加还是减少节点，都只有较少的映射关系需要改变。

![img](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202310170128552.png)

![img](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202310170128751.png)

### 2.2 不均衡问题和虚拟节点

在实际情况下，每个节点在哈希环中的位置也是由 hash 函数计算得到，它的位置是随机的。也就是说可能会存在节点分布不均衡的问题。

![img](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202310170128876.png)

在上图中，节点分布不均衡，导致大量的哈希结果落在同一个节点上。

这里引入虚拟节点，即每个节点都在哈希环上“分身”成 N 个节点，这样每个节点的分布就相对更均匀。

如下图所示，每个节点“分身”成 3 个节点，节点数量多了之后分布也相对均匀。

![img](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202310170128954.png)

## 3. 详细设计

### 3.1 哈希算法

首先需要实现一个哈希算法，用哈希算法将字符串转换为 Long，对应哈希环上的位置。常见的哈希算法有：

| 算法       | 输出长度（位） | 输出长度（字节） |
| :--------- | :------------- | :--------------- |
| MD5        | 128 bits       | 16 bytes         |
| SHA-1      | 160 bits       | 20 bytes         |
| RipeMD-160 | 160 bits       | 20 bytes         |
| SHA-256    | 256 bits       | 32 bytes         |
| SHA-512    | 512 bits       | 64 bytes         |

可以采用取哈希算法得到结果的前 4 位，转换成 Long。

### 3.2 哈希环

哈希环实际上是一个 HashMap，Key 是长整型，表示哈希环上的位置；Value 是虚拟节点（可以是虚拟节点的名称，也可以是虚拟节点类，包含其名称）。

由于需要向后查找虚拟节点的位置，所以 HashMap 需要根据 Key 排序，在 Java 中的 TreeMap 即为按 Key 排序的 Map 实现。

### 3.3 添加和删除节点

首先需要确定节点的虚拟节点数量，比如 10 个。

#### 3.3.1 添加节点

添加节点时需指定节点名称，如 NodeA。实际添加时是添加 10 个虚拟节点，名称可以为 NodeA1,NodeA2, ..., NodeA10。

对虚拟节点名称使用哈希算法，计算出其在哈希环上的位置，并且放入哈希环。

#### 3.3.2 删除节点

根据虚拟节点的数量和名称，可以通过哈希算法计算出其所有虚拟节点在哈希环上的位置，然后移除即可。

### 3.4 路由

路由函数接收一个路由键 key，经过哈希函数计算得出哈希环上的位置，随即向后找离他最近的虚拟节点，即为路由到的节点。

在 Java 中可以使用 TreeMap，它底层实现是红黑树，可以根据 key 值找到下一个离它最近的节点。

## 4. Java 实现

这里引用 RocketMQ 中 `ConsistentHashRouter` 的实现，它用于在发送消息时按照一致性哈希的方式选择 Topic 的目标队列。

```java
/**
 * Represent a node which should be mapped to a hash ring
 */
public interface Node {
    /**
     * @return the key which will be used for hash mapping
     */
    String getKey();
}

public class VirtualNode<T extends Node> implements Node {
    final T physicalNode;
    final int replicaIndex;

    public VirtualNode(T physicalNode, int replicaIndex) {
        this.replicaIndex = replicaIndex;
        this.physicalNode = physicalNode;
    }

    @Override
    public String getKey() {
        return physicalNode.getKey() + "-" + replicaIndex;
    }

    public boolean isVirtualNodeOf(T pNode) {
        return physicalNode.getKey().equals(pNode.getKey());
    }

    public T getPhysicalNode() {
        return physicalNode;
    }
}
```

```java
/**
 * To hash Node objects to a hash ring with a certain amount of virtual node.
 * Method routeNode will return a Node instance which the object key should be allocated to according to consistent hash
 * algorithm
 */
public class ConsistentHashRouter<T extends Node> {
    /**
     * 一致性哈希环
     */
    private final SortedMap<Long /* 哈希环位置，0~2^32-1 */, VirtualNode<T> /* 虚拟节点 */> ring = new TreeMap<>();
    private final HashFunction hashFunction;

    public ConsistentHashRouter(Collection<T> pNodes, int vNodeCount) {
        this(pNodes, vNodeCount, new MD5Hash());
    }

    /**
     * @param pNodes collections of physical nodes
     * @param vNodeCount amounts of virtual nodes
     * @param hashFunction hash Function to hash Node instances
     */
    public ConsistentHashRouter(Collection<T> pNodes, int vNodeCount, HashFunction hashFunction) {
        if (hashFunction == null) {
            throw new NullPointerException("Hash Function is null");
        }
        this.hashFunction = hashFunction;
        if (pNodes != null) {
            // 在哈希环中为每个物理节点添加 vNodeCount 个虚拟节点
            for (T pNode : pNodes) {
                addNode(pNode, vNodeCount);
            }
        }
    }

    /**
     * 在哈希环中为每个物理节点添加 vNodeCount 个虚拟节点
     * add physic node to the hash ring with some virtual nodes
     *
     * @param pNode physical node needs added to hash ring
     * @param vNodeCount the number of virtual node of the physical node. Value should be greater than or equals to 0
     */
    public void addNode(T pNode, int vNodeCount) {
        if (vNodeCount < 0)
            throw new IllegalArgumentException("illegal virtual node counts :" + vNodeCount);
        int existingReplicas = getExistingReplicas(pNode);
        for (int i = 0; i < vNodeCount; i++) {
            VirtualNode<T> vNode = new VirtualNode<>(pNode, i + existingReplicas);
            ring.put(hashFunction.hash(vNode.getKey()), vNode);
        }
    }

    /**
     * 从哈希环中移除物理节点
     * remove the physical node from the hash ring
     */
    public void removeNode(T pNode) {
        Iterator<Long> it = ring.keySet().iterator();
        while (it.hasNext()) {
            Long key = it.next();
            VirtualNode<T> virtualNode = ring.get(key);
            if (virtualNode.isVirtualNodeOf(pNode)) {
                it.remove();
            }
        }
    }

    /**
     * 找到对应 key 在哈希环上顺时针最近的物理节点
     * with a specified key, route the nearest Node instance in the current hash ring
     *
     * @param objectKey the object key to find a nearest Node
     */
    public T routeNode(String objectKey) {
        if (ring.isEmpty()) {
            return null;
        }
        Long hashVal = hashFunction.hash(objectKey);
        SortedMap<Long, VirtualNode<T>> tailMap = ring.tailMap(hashVal);
        Long nodeHashVal = !tailMap.isEmpty() ? tailMap.firstKey() : ring.firstKey();
        return ring.get(nodeHashVal).getPhysicalNode();
    }

    /**
     * 获取物理节点在哈希环中已经存在的虚拟节点数量
     *
     * @param pNode 物理节点
     * @return 在哈希环中已经存在的虚拟节点数量
     */
    public int getExistingReplicas(T pNode) {
        int replicas = 0;
        for (VirtualNode<T> vNode : ring.values()) {
            if (vNode.isVirtualNodeOf(pNode)) {
                replicas++;
            }
        }
        return replicas;
    }

    /**
     * 默认的一致性哈希方法，取 MD5 值的前 4 位
     */
    //default hash function
    public static class MD5Hash implements HashFunction {
        MessageDigest instance;

        public MD5Hash() {
            try {
                instance = MessageDigest.getInstance("MD5");
            } catch (NoSuchAlgorithmException e) {
            }
        }

        @Override
        public long hash(String key) {
            instance.reset();
            instance.update(key.getBytes(StandardCharsets.UTF_8));
            byte[] digest = instance.digest();

            long h = 0;
            // 取 MD5 值的前 4 位，转换成长整型
            for (int i = 0; i < 4; i++) {
                h <<= 8;
                h |= ((int) digest[i]) & 0xFF;
            }
            return h;
        }
    }
}
```

## 参考资料

* [什么是一致性哈希？](https://www.xiaolincoding.com/os/8_network_system/hash.html)
* [哈希算法](https://www.liaoxuefeng.com/wiki/1252599548343744/1304227729113121)

---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
