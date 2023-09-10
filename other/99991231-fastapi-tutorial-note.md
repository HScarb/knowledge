# FastAPI Toturial Note

https://github.com/liaogx/fastapi-tutorial

http://www.imooc.com/learn/1299

## 2. FastAPI 介绍和项目准备

### 2.6 Pydantic 基础教程

#### 2.6.1 基本用法，校验

```python
print("\033[31m1. --- Pydantic的基本用法。Pycharm可以安装Pydantic插件 ---\033[0m")


class User(BaseModel):
    id: int  # 必须字段
    name: str = "John Snow"  # 有默认值，选填字段
    signup_ts: Optional[datetime] = None
    friends: List[int] = []  # 列表中元素是int类型或者可以直接转换成int类型


external_data = {
    "id": "123",
    "signup_ts": "2020-12-22 12:22",
    "friends": [1, 2, "3"],  # "3"是可以int("3")的
}
user = User(**external_data)
print(user.id, user.friends)  # 实例化后调用属性
print(repr(user.signup_ts))
print(user.dict())
```

#### 2.6.2 校验错误处理，序列化

```python
print("\033[31m2. --- 校验失败处理 ---\033[0m")
try:
    User(id=1, signup_ts=datetime.today(), friends=[1, 2, "not number"])
except ValidationError as e:
    print(e.json())
```

#### 2.6.3 模型类的属性和方法

```python
print(user.model_dump())
print(user.model_dump_json())

print(user.model_copy())  # 这里是浅拷贝
print(User.model_validate(external_data))   # 解析并校验
print(User.model_validate_json('{"id": "123", "signup_ts": "2020-12-22 12:22", "friends": [1, 2, "3"]}')) # 从 JSON 解析

# 从文件解析
path = Path('pydantic_tutorial.json')
path.write_text('{"id": "123", "signup_ts": "2020-12-22 12:22", "friends": [1, 2, "3"]}')
print(User.parse_file(path))

# 打印包含模型的 JSON Schema
print(user.model_json_schema()) # {'properties': {'id': {'title': 'Id', 'type': 'integer'}, 'name': {'default': 'John Snow', 'title': 'Name', 'type': 'string'}, 'signup_ts': {'anyOf': [{'format': 'date-time', 'type': 'string'}, {'type': 'null'}], 'default': None, 'title': 'Signup Ts'}, 'friends': {'default': [], 'items': {'type': 'integer'}, 'title': 'Friends', 'type': 'array'}}, 'required': ['id'], 'title': 'User', 'type': 'object'}

print(User.model_construct(**external_data)) # 不检验数据直接创建模型类，不建议在construct方法中传入未经验证的数据
print(User.model_fields.keys())  # 输出字段列表。定义模型类的时候，所有字段都注明类型，字段顺序就不会乱
```

#### 2.6.4 递归模型

```python
class Sound(BaseModel):
    sound: str

class Dog(BaseModel):
    birthday: date
    weight: float = Optional[None]
    sound: List[Sound]  # 递归模型

dogs = Dog(birthday=date.today(), weight=6.66, sound=[{"sound": "wang wang ~"}, {"sound": "ying ying ~"}])
print(dogs.model_dump()) # {'birthday': datetime.date(2023, 8, 28), 'weight': 6.66, 'sound': [{'sound': 'wang wang ~'}, {'sound': 'ying ying ~'}]}
```

#### 2.6.5 ORM 模型

```python
Base = declarative_base()


class CompanyOrm(Base):
    __tablename__ = 'companies'
    id = Column(Integer, primary_key=True, nullable=False)
    public_key = Column(String(20), index=True, nullable=False, unique=True)
    name = Column(String(63), unique=True)
    domains = Column(ARRAY(String(255)))


class CompanyModel(BaseModel):
    id: int
    public_key: constr(max_length=20)
    name: constr(max_length=63)
    domains: List[constr(max_length=255)]

    class Config:
        from_attributes = True


co_orm = CompanyOrm(
    id=123,
    public_key='foobar',
    name='Testing',
    domains=['example.com', 'foobar.com'],
)

print(CompanyModel.model_validate(co_orm)) # 从 ORM 对象解析
```

