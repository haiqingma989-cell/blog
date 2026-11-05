# Haiqingma's notes

A personal blog for notes on learning, code, and everyday life.

This project lives in the independent `blog` repository at [haiqingma989-cell.github.io/blog/](https://haiqingma989-cell.github.io/blog/). It contains no academic website content or links. The academic website is unchanged. `/blog/` is the GitHub Pages project path, not a separate domain.

## Run locally

Use Node.js 24 and npm:

```bash
npm install
npm run dev
```

Open the address printed in the terminal. To build the static site:

```bash
npm run build
```

The output is `dist/`. Commit `package-lock.json`; deployment uses `npm ci`.

## Write and edit

Open `/blog/editor/` on the deployed site for Markdown or visual editing, formulas, diagrams, and file import or export. Drafts are stored in the current browser, without accounts or cloud sync. Export a draft and commit it to publish; saving locally does not make it public.

You can also edit files in `content/posts/` with GitHub, VS Code, or Obsidian. Start each file with metadata:

```markdown
---
title: "A new note"
slug: "a-new-note"
date: "2026-11-05"
category: "Notes"
tags: ["Notes"]
description: "A short description."
featured: false
cover: "journal"
---

## Start here

Write the note.
```

Keep slugs unique, using lowercase ASCII letters, digits, and hyphens. Covers are `journal`, `writing`, or `math`. The page renders the title separately, so start body headings at `##`.

Use `$...$` for inline math, `$$...$$` for display math, and a `mermaid` code fence for diagrams. Images go in `public/`; for example, `public/images/notebook.svg` is referenced as `/images/notebook.svg`. Rendering adds the `/blog/` prefix.

## Publish

1. Push this project's files to the `main` branch of `haiqingma989-cell/blog`.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. Check the **Deploy blog to GitHub Pages** workflow in Actions.

Each push builds and deploys `dist/`. Updates become public after the workflow succeeds. Keep `basePath: '/blog/'` in `site.config.mjs` unless the repository name changes. No changes to any other repository are needed.
