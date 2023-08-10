import {searchProPlugin} from "vuepress-plugin-search-pro";

const {description} = require('../../package')
import { defineUserConfig } from "vuepress";
import theme from "./theme.js";
import {baiduSeoPlugin} from "vuepress-plugin-baidu-seo-next";

// @ts-ignore
export default defineUserConfig({
  port: 8000,
  base: "/",

  lang: "zh-CN",
  title: '金甲虫的博客',
  description: description,

  theme,
  plugins: [
    searchProPlugin({
      // 索引全部内容
      indexContent: true,
      // 为分类和标签添加索引
      // customFields: [
      //   {
      //     getter: (page) => page.frontmatter.category,
      //     formatter: "分类：$content",
      //   },
      //   {
      //     getter: (page) => page.frontmatter.tag,
      //     formatter: "标签：$content",
      //   },
      // ],
    }),
    baiduSeoPlugin({
      hm: '2bde43ef07349311aec5e2fa7104b5ae',
      ignoreLocal: false
    })
  ]
});