import { navbar } from "vuepress-theme-hope";

export default navbar([
  {
    text: 'Home',
    link: '/',
  },
  {
    text: 'RocketMQ',
    link: '/rocketmq/'
  },
  {
    text: 'RabbitMQ',
    link: '/rabbitmq/'
  },
  {
    text: 'Java',
    link: '/java/'
  },
  {
    text: 'Other',
    link: '/other/'
  },
  {
    text: "Follow Me",
    link: "https://github.com/HScarb",
    children: [
      {text: 'Github', link: 'https://github.com/HScarb'},
      {text: '掘金', link: 'https://juejin.cn/user/219558057345111/posts'}
    ]
  },
]);
