# MyBlogRebuild

基于 **Astro** 与开源主题 **Shirone** 定制的个人博客，采用「**代码与个人内容分离**」的 Git 架构：
仓库只托管主题代码、配置与示例内容，**个人文章、说说与配图全部只留在本地**，不进入版本库。

> **Upstream / 上游信息**
>
> - 主题（Theme）：[Shirone](https://github.com/LyraVoid/Shirone) — MIT License，作者 LyraVoid / matsuzaka-yuki
> - 框架（Framework）：[Astro](https://astro.build/) 7 + Svelte 5 + Tailwind CSS 4 + Stylus
> - 渊源（Origin）：Shirone 是 [Fuwari](https://github.com/saicaca/fuwari) 的重构演进版本，感谢原作者 [saicaca](https://github.com/saicaca) 与所有贡献者

---

## ✦ 项目简介与特性

| 能力 | 说明 |
| --- | --- |
| 设计语言 | Material 3 Expressive（M3E），HCT 动态取色、明暗主题、纹理背景 |
| 导航体验 | Swup 无刷新站内切换（保留外壳与滚动状态）、路由进度条、无障碍焦点管理 |
| 内容写作 | Markdown / MDX、KaTeX 数学公式、Mermaid 图表、Expressive Code 代码块、提示块 / 折叠面板 / 图片画廊 |
| 站内搜索 | **Pagefind** 纯静态全文索引，构建期生成，零后端 |
| 番剧进度 | **Bangumi** 追番数据以本地快照（`snapshot`）方式接入；封面为远程图，失败时自动回落到站内统一兜底图（`/assets/anime/ZZC.webp`） |
| 外链安全 | **`/go/` 静态跳转缓冲页**：全站外链自动拦截 → 展示目标域名 → 3 秒倒计时（可取消）后跳转，仅放行 `http(s)` |
| 页面模块 | 归档 / 分类 / 标签 / 系列 / 说说 / 友链 / 番剧 / 相册 / 罗盘 / 时间线 / 项目 / 设备 / 游戏 / 技能 / 关于 |
| 内容分离 | `.gitignore` 隔离个人内容，仓库仅保留最小可运行示例 |

## ✦ 目录结构

### 受 Git 管理（会推送到远程仓库）

```
src/
├── components/          # 组件（原子 / 分子 / 有机体）
├── config/              # 站点配置：site / profile / navBar / anime / comment …
├── layouts/             # Layout.astro、MainGridLayout.astro
├── pages/               # 路由（含 /go/ 缓冲页）
├── styles/              # 全局样式与设计令牌
├── types/ utils/ i18n/  # 类型、工具、多语言
├── data/                # 特色页数据源（anime / projects / timeline …）
└── content/
    ├── posts/hello-world.md   # ← 唯一入库的示例文章
    └── spec/about.md          # ← 唯一入库的「关于」页示例
public/
├── assets/              # 主题默认图标 / 番剧兜底图
├── favicon/  logo/      # 站点图标
└── images/.gitkeep      # 占位：个人配图目录本身被忽略
astro.config.mjs  package.json  tsconfig.json  .gitignore  README.md  LICENSE
```

### 仅存在于本地（被 `.gitignore` 隔离）

| 路径 | 内容 |
| --- | --- |
| `src/content/posts/*` | 个人文章（仅 `hello-world.md` 例外） |
| `src/content/moments/*` | 个人说说（仅 `.gitkeep` 例外） |
| `src/content/spec/*` | 个人页面（仅 `about.md` 例外） |
| `public/images/*` | 文章 / 说说配图（仅 `.gitkeep` 例外） |
| `src/data/anime-snapshots/*.json` | Bangumi 快照（`pnpm anime:sync` 生成） |
| `private-backups/` | 旧站备份与私密资料 |
| `BROKEN_ASSETS.md` | 断图排查报告 |
| `dist/` `.astro/` `node_modules/` | 构建产物与依赖 |

## ✦ 本地初始化与开发

环境要求：**Node.js ≥ 22.12**、**pnpm 9+**（仓库 `package.json` 声明 `pnpm@11.28.2`，`preinstall` 仅允许 pnpm）。

```bash
# 1. 克隆与安装
git clone https://github.com/fancilonely/MyBlogRebuild.git
cd MyBlogRebuild
corepack enable        # 若未安装 pnpm
pnpm install

# 2. 启动开发服务器（http://localhost:4321）
pnpm dev

# 3. 类型检查 / 构建 / 预览
pnpm check             # astro check
pnpm build             # 输出 dist/ 并生成 Pagefind 索引
pnpm preview
```

> Windows PowerShell 若限制脚本执行，请使用 `pnpm.cmd dev` / `pnpm.cmd build`。

### 写入你的第一篇文章

在 `src/content/posts/` 新建 `my-first-post.md`（该目录默认不进入 Git）：

```yaml
---
title: 我的第一篇文章          # 必填
published: 2026-01-01          # 必填，YYYY-MM-DD
description: 列表与 SEO 摘要    # 可选
category: 随笔                 # 可选，与 category_label 同步
tags: [Astro, 笔记]            # 可选
draft: false                   # 可选，true 时不参与构建
image: ./cover.webp            # 可选，封面（也可用 /images/… 或远程 URL）
---

正文使用 Markdown / MDX 书写。
```

说说的写法与之类似，文件放在 `src/content/moments/`。

### 站点配置（`src/config/`）

| 文件 | 作用 | 常用字段 |
| --- | --- | --- |
| `siteConfig.ts` | 站点核心 | `site`（站点 URL）、`title` / `subtitle`、`lang`、`timeZone`、`themeColor`、`banner.src`（首页横幅，`desktop` / `mobile`）、`favicon` |
| `profileConfig.ts` | 作者资料 | `name`、`bio`、`avatar`（头像路径）、`links`（社交链接） |
| `navBarConfig.ts` | 顶栏导航 | `links`（顺序 / 分组 / 图标 / `pageKey`） |
| `animeConfig.ts` | 番剧页 | `providers.bangumi.userId`（Bangumi 用户名或 UID）、`source`（`local` / `snapshot`）、`fallback` |
| `momentsConfig.ts` / `friendsConfig.ts` / `albumsConfig.ts` … | 各功能页 | 标题、描述、`enable` 开关、分类 |
| `commentConfig.ts` | 评论 | Twikoo / Giscus / Waline（默认关闭） |

> **关于头像**：`profileConfig.avatar` 默认指向 `src/assets/images/Fancyprofile.webp`，该文件已被
> `.gitignore` 隔离，**只存在于本站作者的本地环境**。克隆仓库后请自行替换：把头像放进
> `src/assets/images/`（写成 `assets/images/<文件名>`），或放进 `public/images/`
> （写成 `/images/<文件名>`）；也可以直接改回主题自带的 `assets/images/demo-avatar.webp` 占位图。

### 番剧数据（Bangumi）

```bash
# 先在 src/config/animeConfig.ts 中填入 Bangumi 用户名，并确认：
#   source: { kind: "snapshot", provider: "bangumi", file: "bangumi.json", fetchOnDev: true }
#   providers.bangumi: { enable: true, userId: "<你的用户名>" }
pnpm anime:sync --provider bangumi   # 生成 src/data/anime-snapshots/bangumi.json
```

快照文件被 `.gitignore` 忽略，因此**部署前需先执行一次 `anime:sync`**；若快照缺失，页面会按 `fallback` 回落到空列表，绝不显示主题示例数据。

## ✦ 构建与部署（Cloudflare Pages Direct Upload）

本项目是纯静态站点：`pnpm build` 产出 `dist/`，可直接上传，**无需把个人文章推送到 GitHub**。

```bash
pnpm build            # 产物在 dist/
```

**方式 A：Cloudflare Dashboard 直接上传（推荐，配合内容分离）**

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**；
2. 项目名任意（如 `my-blog`），将 `dist/` 整个目录拖入或 `wrangler pages deploy dist`；
3. 之后每次更新：本地 `pnpm build` → 重新上传 `dist/` 即可。个人内容始终只在本机。

```bash
# 可选：命令行直传（需先 npm i -g wrangler && wrangler login）
wrangler pages deploy dist --project-name my-blog
```

**方式 B：接 Git 自动构建**

Cloudflare Pages 连接本仓库 → 构建命令 `pnpm build` → 输出目录 `dist`。
注意：此方式只包含仓库内的代码与示例内容，你的个人文章不会被构建进去；
如需连内容一起上线，请改用方式 A（本地上传 `dist/`），或另建私有内容仓库。

> 部署到子路径（如 `https://user.github.io/MyBlogRebuild/`）时，需在 `siteConfig.ts` 中把 `base` 设为 `/MyBlogRebuild/`。

## ✦ License

本项目基于 [Shirone](https://github.com/LyraVoid/Shirone) 二次开发，遵循 **MIT License**，详见 [LICENSE](./LICENSE)。
仓库保留上游要求的原始版权声明：

```
MIT License
Copyright (c) 2024 saicaca
Copyright (c) 2026 matsuzaka-yuki
```

## ✦ Acknowledgements

- [Astro](https://astro.build/) — 静态站点框架
- [Shirone](https://github.com/LyraVoid/Shirone) — 主题本体（LyraVoid / matsuzaka-yuki）
- [Fuwari](https://github.com/saicaca/fuwari) — Shirone 的起点（saicaca）
- [Yozai（悠哉字体）](https://github.com/lxgw/yozai-font) — 中文字形（lxgw）
- [Pagefind](https://pagefind.app/)、[Swup](https://swup.js.org/)、[Iconify](https://iconify.design/)、[KaTeX](https://katex.org/)、[Mermaid](https://mermaid.js.org/)
