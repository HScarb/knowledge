```erlang
observer_cli:start().
observer:start().
```

```erlang
rabbit_amqqueue:declare(rabbit_misc:r(<<"/">>, queue, <<"testqueue">>), false, false, [], none, <<"acting-user">>).
```

```erlang
dbg:start(), dbg:tracer(process, {fun dbg:dhandler/2, standard_io}), dbg:tpl(rabbitmq_amqpqueue, declare, x), dbg:p(all, c).
dbg:stop().
```

