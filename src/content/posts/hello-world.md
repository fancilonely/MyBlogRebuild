---
title: Hello World
published: 2024-01-29
description: 示例文章：验证「代码与个人内容分离」架构下仓库仍可直接运行。
tags: [示例, Astro]
category: 随笔
# 示例文章保持 draft: true —— 留在仓库里作为 Frontmatter 格式参考，但不参与线上构建。
# 本地想看效果时改成 false，构建后访问 /posts/hello-world/。
draft: true
---

欢迎使用 **Shirone** 主题 👋

这是一篇示例文章，随仓库一起提供，用于保证 clone 之后即使没有任何个人内容，站点也能正常构建与预览。

## 最小 Frontmatter 规范

```yaml
---
title: Hello World        # 必填：文章标题
published: 2024-01-29     # 必填：发布日期（YYYY-MM-DD）
description: 摘要         # 可选：列表摘要 / SEO 描述
category: 随笔            # 可选：分类名（与 category_label 同步）
tags: [示例, Astro]       # 可选：标签数组
draft: false              # 可选：true 时不出现在构建产物中
---
```

## 支持的内容能力

- Markdown / MDX、数学公式（KaTeX）、Mermaid 图表
- 代码高亮（Expressive Code）、提示块、折叠面板、图片画廊
- 站内搜索（Pagefind）、RSS / Sitemap

> 把你自己的 `.md` 放进 `src/content/posts/` 即可开始写作；这些文件默认不会进入 Git。
