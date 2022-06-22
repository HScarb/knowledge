const {title} = require('../../package')
const {description} = require('../../package')

module.exports = {
  /**
   * Ref：https://v1.vuepress.vuejs.org/config/#title
   */
  title: '金甲虫的博客',
  /**
   * Ref：https://v1.vuepress.vuejs.org/config/#description
   */
  description: description,

  theme: 'reco',

  markdown: {
    toc: {
      includeLevel: [1, 2, 3, 4]
    }
  },

  /**
   * Extra tags to be injected to the page HTML `<head>`
   *
   * ref：https://v1.vuepress.vuejs.org/config/#head
   */
  head: [
    ['meta', {name: 'theme-color', content: '#3eaf7c'}],
    ['meta', {name: 'apple-mobile-web-app-capable', content: 'yes'}],
    ['meta', {name: 'apple-mobile-web-app-status-bar-style', content: 'black'}]
  ],

  /**
   * Theme configuration, here is the default theme configuration for VuePress.
   *
   * ref：https://v1.vuepress.vuejs.org/theme/default-theme-config.html
   */
  themeConfig: {
    repo: '',
    editLinks: false,
    docsDir: '',
    editLinkText: '',
    lastUpdated: false,
    subSidebar: 'auto',
    nav: [
      {
        text: 'Home',
        link: '/',
      },
      {
        text: 'Java',
        link: '/java/'
      },
      {
        text: 'RabbitMQ',
        link: '/rabbitmq/'
      },
      {
        text: 'RocketMQ',
        link: '/rocketmq/'
      },
      {
        text: 'Other',
        link: '/other/'
      },
      {
        text: 'Follow Me',
        items: [
          {text: 'Github', link: 'https://github.com/HScarb/knowledge'},
          {text: '掘金', link: 'https://juejin.cn/user/219558057345111/posts'}
        ]
      }
    ],
    sidebar: {
      '/guide/': [
        {
          title: 'Guide',
          collapsable: false,
          children: [
            '',
            'using-vue',
          ]
        }
      ],
    },
    locales: {
      '/': {
        lang: 'zh-CN'
      }
    },
  },

  /**
   * Apply plugins，ref：https://v1.vuepress.vuejs.org/zh/plugin/
   */
  plugins: [
    '@vuepress/plugin-back-to-top',
    '@vuepress/plugin-medium-zoom',
  ]
}
