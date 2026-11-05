# 海青马的个人博客

一个以中文写作为主的静态个人博客，记录学习、代码和日常。博客主人是海青马（Haiqingma），GitHub 账号为 `haiqingma989-cell`。博客使用独立仓库 `blog`，目标地址为 [海青马的博客](https://haiqingma989-cell.github.io/blog/)；首次部署成功后才会提供博客页面。

博客与学术网站分开维护。本次没有修改学术网站的仓库、页面或发布配置，也没有在博客中加入学术主页入口。`/blog/` 是 GitHub Pages 项目站点的默认路径形式，不代表博客拥有另一个域名。

## 本地运行

需要 Node.js 24 和 npm。进入本项目目录后运行：

```bash
npm install
npm run dev
```

打开终端显示的本地地址。开发时修改内容即可检查效果。构建静态页面：

```bash
npm run build
```

构建结果位于 `dist/`，可以由 GitHub Pages 托管。请将 `package-lock.json` 一起提交；部署工作流使用 `npm ci` 安装锁定的依赖。

## 在浏览器里写文章

访问站点中的 `/editor/` 页面，部署后的完整路径为 `/blog/editor/`。本地按终端显示的站点地址进入编辑器。编辑器支持 Markdown 与可视化编辑、公式和图表，以及文件导入和导出。草稿保存在当前浏览器的本地存储中。

这不是账号后台，没有云同步。浏览器里的草稿只在本机保存，不会自动提交到 GitHub，也不会因为点击保存就公开。清除浏览器数据、更换浏览器或设备后，本地草稿可能不可用；重要内容请及时导出文件。

公开一篇文章的流程是：在编辑器中整理内容，导出 Markdown 文件，放入 `content/posts/`，然后提交并推送到仓库。只有进入仓库并经过部署的内容才会出现在公开博客中。

## 直接编辑 Markdown 文件

文章位于 `content/posts/`，可以通过 GitHub 网页、VS Code 或 Obsidian 直接编辑。无需打开浏览器编辑器。文件开头用 YAML frontmatter 描述文章信息，正文从二级标题开始，页面会单独渲染文章标题：

```markdown
---
title: "我的新笔记"
slug: "my-new-note"
date: "2026-11-05"
category: "学习笔记"
tags: ["笔记", "示例"]
description: "一句具体的内容介绍。"
featured: false
cover: "writing"
---

## 今天想记录的事

从这里开始写正文。
```

`slug` 使用唯一的 ASCII 小写字母、数字和连字符。`date` 使用 `YYYY-MM-DD`。`cover` 可选 `journal`、`writing` 或 `math`，`featured` 为 `true` 或 `false`。标题等含有标点的文本建议加引号。

公式使用行内 `$x^2$` 或独占一段的 `$$ ... $$`。图表放在标记为 `mermaid` 的代码围栏中。普通代码注明语言，图片使用 Markdown 图片语法，例如 `![图片说明](/images/example.png)`。本项目已有三篇文章可作内容格式参考，其中写作与数学文章显著标为“示例”。

图片等静态文件放入 `public/`。例如，添加 `public/images/example.png` 后，正文可写 `![图片说明](/images/example.png)`；站点渲染时会添加基础路径 `/blog/`，部署后实际资源地址为 `/blog/images/example.png`。

## 部署到 GitHub Pages

1. 在 `haiqingma989-cell` 账号下创建或使用独立仓库 `blog`。
2. 将本项目目录中的文件作为该仓库的根目录，提交源码和 `package-lock.json`，推送到 `main` 分支。
3. 在仓库的 **Settings → Pages → Build and deployment** 中，将 **Source** 设为 **GitHub Actions**。
4. 在 **Actions** 查看 `Deploy blog to GitHub Pages`。工作流会安装依赖、运行 `npm run build`，再发布 `dist/`。
5. 部署成功后，通过部署任务显示的站点链接访问博客。

后续提交到 `main` 会自动触发更新，也可以在 Actions 页面手动运行工作流。文章提交到仓库后，还需要等待工作流成功，公开页面才会更新。部署失败时先查看对应步骤的日志。

这是项目 Pages 站点，`site.config.mjs` 中的基础路径应保持为 `/blog/`。如果以后更改仓库名称，需要同步调整基础路径和链接处理，再重新构建部署。

## 目录

| 路径 | 内容 |
| --- | --- |
| `content/posts/` | 公开文章的 Markdown 源文件 |
| `public/` | 图片等静态文件 |
| `src/` | 页面与编辑器代码 |
| `scripts/` | 内容处理与构建脚本 |
| `.github/workflows/pages.yml` | GitHub Pages 构建与部署 |

本目录可以作为独立的 `blog` 仓库使用，构建与发布只依赖本项目内的文件。
