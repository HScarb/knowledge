# 关于 Java 中的 DO、DTO、BO、AO、VO、POJO

https://www.v2ex.com/t/834173

阿里巴巴 JAVA 开发手册是这样定义的：

DO （ Data Object ）：与数据库表结构一一对应，通过 DAO 层向上传输数据源对象。
DTO （ Data Transfer Object ）：数据传输对象，Service 或 Manager 向外传输的对象。
BO （ Business Object ）：业务对象。 由 Service 层输出的封装业务逻辑的对象。
AO （ Application Object ）：应用对象。 在 Web 层与 Service 层之间抽象的复用对象模型，极为贴近展示层，复用度不高。
VO （ View Object ）：显示层对象，通常是 Web 向模板渲染引擎层传输的对象。
POJO （ Plain Ordinary Java Object ）：在本手册中，POJO 专指只有 setter/getter/toString 的简单类，包括 DO/DTO/BO/VO 等。

![img](./20231116-java-dto-vo-bo.assets/DkO4zJw.jpeg)