import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import matter from 'gray-matter';
import site from '../site.config.mjs';
import {renderMarkdown,escapeHtml as e} from '../src/lib/markdown.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
const base=`/${site.basePath.split('/').filter(Boolean).join('/')}/`.replace('//','/');
const href=(p='')=>base+p.replace(/^\//,'');
const absolute=p=>new URL(href(p),new URL(site.url).origin).href;
const dateLabel=date=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const save=async(file,content)=>{const destination=path.join(out,file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,content);};

export async function buildSite(){
  if(path.relative(root,out)!=='dist')throw new Error('Build output must stay inside this project.');
  await fs.rm(out,{recursive:true,force:true});
  await fs.mkdir(out,{recursive:true});
  await fs.cp(path.join(root,'public'),out,{recursive:true});
  const files=(await fs.readdir(path.join(root,'content/posts'))).filter(file=>file.endsWith('.md'));
  const posts=[];const slugs=new Set();
  for(const file of files){
    const {data,content}=matter(await fs.readFile(path.join(root,'content/posts',file),'utf8'));
    if(data.draft===true)continue;
    const slug=String(data.slug||file.slice(0,-3));
    if(!/^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(slug)||slugs.has(slug))throw new Error(`Invalid or duplicate slug: ${slug}`);
    slugs.add(slug);
    const date=data.date instanceof Date?data.date.toISOString().slice(0,10):String(data.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z')))throw new Error(`Invalid date in ${file}`);
    const rendered=renderMarkdown(content);
    const post={slug,title:String(data.title||slug),description:String(data.description||''),date,category:String(data.category||'随手记录'),tags:Array.isArray(data.tags)?data.tags.map(String):[],featured:data.featured===true,cover:String(data.cover||'writing'),content,...rendered};
    post.html=post.html.replace(/(src|href)="\/(?!\/)([^"]*)"/g,(_,attr,p)=>`${attr}="${e(href(p))}"`);
    posts.push(post);
  }
  posts.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'zh-CN'));
  const categories=[...new Set(posts.map(p=>p.category))];
  const tags=[...new Set(posts.flatMap(p=>p.tags))];
  const searchData=posts.map(({content,html,toc,...post})=>({...post,url:href(`posts/${encodeURIComponent(post.slug)}/`)}));

  function shell({title,description=site.description,current='home',pagePath='',body,editor=false,article=false}){
    const nav=[['home','','首页','01'],['archive','archive/','文章归档','02'],['about','about/','关于我','03']];
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="theme-color" content="#f7f5ef"><meta name="description" content="${e(description)}"><meta property="og:type" content="${article?'article':'website'}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(absolute(pagePath))}"><link rel="canonical" href="${e(absolute(pagePath))}"><link rel="icon" type="image/svg+xml" href="${href('favicon.svg')}"><link rel="alternate" type="application/rss+xml" title="${e(site.title)}" href="${href('feed.xml')}"><title>${e(title)}${title===site.title?'':' · '+e(site.title)}</title><link rel="stylesheet" href="${href('assets/site.css')}">${editor?`<link rel="stylesheet" href="${href('assets/editor.css')}">`:''}</head><body class="${editor?'editor-body':''}"><a class="skip-link" href="${editor?'#editor-app':'#main'}">跳到正文</a>${editor?body:`<div class="site-shell"><aside class="sidebar"><a class="brand" href="${href()}"><span class="brand-mark">h<span>.</span></span><span class="brand-name">海青马</span><span class="brand-caption">FIELD NOTES</span></a><nav class="side-nav" aria-label="主导航">${nav.map(([key,url,label,index])=>`<a href="${href(url)}" ${current===key?'class="active" aria-current="page"':''}><span>${label}</span><small>${index}</small></a>`).join('')}</nav><div class="sidebar-note"><span class="status-dot"></span>慢慢做，慢慢记。<p>给想法一个落脚的地方。</p></div><div class="sidebar-links"><a href="https://github.com/${site.github.owner}" target="_blank" rel="noopener">GitHub ↗</a><a href="${href('feed.xml')}">RSS ↗</a></div></aside><main class="main-shell" id="main"><header class="topbar"><span class="breadcrumb">${current==='home'?'手记 / 日常与代码':current==='archive'?'索引 / 写过的文章':current==='about'?'关于 / 记录与自己':'阅读 / '+e(site.title)}</span><div class="header-actions"><button class="search-trigger" type="button" aria-label="搜索文章">搜索 <kbd>⌘ K</kbd></button><a class="write-link" href="${href('editor/')}">写一篇 <span>↗</span></a></div></header><div class="page-content">${body}</div><footer class="site-footer"><span>© ${new Date().getUTCFullYear()} ${e(site.author)} · 写给未来的自己</span><span>Made with curiosity <span class="footer-spark">✳</span></span></footer></main></div>`}<dialog class="search-dialog" id="search-dialog"><div class="dialog-heading"><span>找一段记录</span><button class="dialog-close" type="button" aria-label="关闭搜索">×</button></div><label class="sr-only" for="search-query">搜索文章标题、标签或简介</label><input id="search-query" class="search-input" type="search" placeholder="试试随笔、公式、Markdown…" autocomplete="off"><div class="search-results" aria-live="polite"></div><p class="search-hint">按 Esc 关闭 · 支持标题、标签与简介</p></dialog><div class="toast" role="status" aria-live="polite" hidden></div><script id="site-config" type="application/json">${json({...site,basePath:base})}</script><script type="module" src="${href(editor?'assets/editor.js':'assets/site.js')}"></script></body></html>`;
  }
  function cover(post){
    const type=['journal','writing','math'].includes(post.cover)?post.cover:'writing';
    const art=type==='journal'?`<span class="cover-journal-note"><small>DAILY NOTES / 001</small><b>One page<br>at a time.</b><p>把平常的一天，也好好留下。</p></span>`:type==='math'?`<span class="cover-formula">${renderMarkdown('$$\\nabla L(\\theta) = \\frac{1}{N}\\sum_{i=1}^{N}\\nabla \\ell_i(\\theta)$$').html}</span><span class="math-grid"></span>`:`<span class="cover-lines"><b>Dear, tomorrow.</b><i></i><i></i><i></i><small>把一个小小的想法，认真写下来。</small></span>`;
    return `<a class="cover cover-${type}" href="${href(`posts/${encodeURIComponent(post.slug)}/`)}" aria-label="阅读：${e(post.title)}">${art}<span class="cover-label">${type==='journal'?'LITTLE MOMENTS, WELL KEPT':type==='math'?'THOUGHTS IN EQUATIONS':'WORDS, WELL KEPT'}</span><span class="cover-arrow">↗</span></a>`;
  }
  function card(post,featured=false){return `<article class="post-card${featured?' featured':''}" data-category="${e(post.category)}">${cover(post)}<div class="post-card-body"><div class="post-meta"><span class="post-category">${e(post.category)}</span><time datetime="${post.date}">${dateLabel(post.date)}</time></div><h3 class="post-title"><a href="${href(`posts/${encodeURIComponent(post.slug)}/`)}">${e(post.title)}</a></h3><p class="post-description">${e(post.description)}</p><div class="post-card-footer"><div class="post-tags">${post.tags.slice(0,3).map(tag=>`<span># ${e(tag)}</span>`).join('')}</div><a class="read-more" href="${href(`posts/${encodeURIComponent(post.slug)}/`)}" aria-label="阅读：${e(post.title)}">${post.readingMinutes} 分钟阅读 <span>↗</span></a></div></div></article>`;}
  const featured=posts.find(p=>p.featured)||posts[0];
  const gridPosts=featured?[featured,...posts.filter(p=>p!==featured)]:posts;
  const home=`<section class="hero"><div class="hero-copy"><p class="eyebrow"><span></span> HAIQINGMA’S FIELD NOTES</p><h1>做点有趣的事，<br>也把过程<em>记下来</em>。</h1><p class="hero-description">${e(site.description)}<br>不必等到很厉害，才开始写下第一篇。</p><div class="hero-actions"><a class="button primary" href="#latest">翻开手记 <span>↓</span></a><a class="button secondary" href="${href('about/')}">认识一下 ↗</a></div><div class="hero-footer"><span class="hero-stat"><b>${posts.length.toString().padStart(2,'0')}</b> 篇记录</span><span>学习笔记 · 代码工具 · 日常碎片</span></div></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-dot"></span><div class="note-sheet"><span>NOTE TO SELF / 001</span><b>Stay curious.<br>Keep making.</b><i>想法值得被留下。</i><small>海青马的手记 ✳</small></div><span class="art-caption">一页一页，慢慢积累。</span></div></section><section id="latest" class="latest-section"><div class="feed-header"><div class="section-heading"><span class="eyebrow">THE LATEST</span><h2>最近的记录<span> / ${posts.length.toString().padStart(2,'0')}</span></h2></div><a class="text-link" href="${href('archive/')}">全部文章 ↗</a></div><div class="feed-tools" role="group" aria-label="文章分类"><button class="filter-chip active" data-filter="all" aria-pressed="true">全部</button>${categories.map(category=>`<button class="filter-chip" data-filter="${e(category)}" aria-pressed="false">${e(category)}</button>`).join('')}</div><div class="post-grid">${gridPosts.map((post,i)=>card(post,i===0)).join('')}</div><p class="no-results" hidden>这个分类还没有文章，先写下第一篇吧。</p></section><section class="note-banner"><span class="banner-symbol" aria-hidden="true">✳</span><div class="note-banner-copy"><h2>有个想法？先记下来。</h2><p>文字、代码、公式，或者一张简单的图。这里装得下。</p></div><a class="button secondary" href="${href('editor/')}">打开写作台 ↗</a></section>`;
  await save('index.html',shell({title:site.title,body:home}));
  const years=[...new Set(posts.map(p=>p.date.slice(0,4)))];
  const archive=`<header class="page-heading"><p class="eyebrow">A GROWING COLLECTION</p><h1>把时间，<br>留在字里行间。</h1><p>${posts.length} 篇文章，${tags.length} 个话题。每一篇都是一个小小的起点。</p></header>${years.map(year=>`<section class="archive-year"><h2>${year}<small>${posts.filter(p=>p.date.startsWith(year)).length} 篇</small></h2>${posts.filter(p=>p.date.startsWith(year)).map(post=>`<a class="archive-item" href="${href(`posts/${encodeURIComponent(post.slug)}/`)}"><time datetime="${post.date}">${post.date.slice(5).replace('-',' / ')}</time><div><span>${e(post.category)}</span><h3>${e(post.title)}</h3><p>${post.tags.map(tag=>'#'+e(tag)).join('　')}</p></div><b>↗</b></a>`).join('')}</section>`).join('')}`;
  await save('archive/index.html',shell({title:'文章归档',current:'archive',pagePath:'archive/',body:archive}));
  const about=`<header class="page-heading"><p class="eyebrow">HELLO, I’M HAIQINGMA</p><h1>你好，<br>我是海青马<span class="accent-dot">。</span></h1><p>这里是我的个人手记，放一些想留下来的文字。</p></header><div class="about-grid"><section class="about-card"><span class="eyebrow">ABOUT THIS LITTLE SPACE</span><h2>慢慢做，<br>也慢慢记录。</h2><p>有些问题，想清楚的时候觉得再简单不过，隔一段时间却又忘了。于是想给自己留一个地方，记下学习的过程、试过的代码和日常的小发现。</p><p>不必等到有一个完整的答案，才写下第一句话。一段没整理好的想法、一条管用的方法，都可以成为一篇手记的开始。</p><div class="about-links"><a class="button primary" href="${href('archive/')}">翻翻我的记录 ↗</a><a class="button secondary" href="${href('editor/')}">写一篇新手记 ↗</a></div></section><aside class="about-stack"><div class="about-card small"><span class="eyebrow">THINGS TO KEEP</span><h2>一些值得留下的小事</h2><ul><li>今天学会的一件事</li><li>一段终于跑通的代码</li><li>一个还没想明白的问题</li><li>平常日子里的小发现</li></ul></div><div class="about-card small"><span class="eyebrow">ELSEWHERE</span><p>有些想法写成文字，有些变成代码。</p><a href="https://github.com/${site.github.owner}" target="_blank" rel="noopener">在 GitHub 找到我 ↗</a></div></aside></div>`;
  await save('about/index.html',shell({title:'关于我',current:'about',pagePath:'about/',body:about}));
  for(const post of posts){
    const postPath=`posts/${encodeURIComponent(post.slug)}/`;
    const toc=post.toc.length?`<aside class="toc-panel"><span class="eyebrow">ON THIS PAGE</span><h2>这一页</h2><nav class="toc-links" aria-label="文章目录">${post.toc.map(h=>`<a class="level-${h.level}" href="#${encodeURIComponent(h.id)}">${e(h.text)}</a>`).join('')}</nav><a class="toc-back" href="#article-top">回到顶部 ↑</a></aside>`:'';
    const article=`<article class="article-page" id="article-top"><header class="article-header"><a class="article-category" href="${href('archive/')}">← ${e(post.category)}</a><h1 class="article-title">${e(post.title)}</h1><p class="article-description">${e(post.description)}</p><div class="article-meta"><span class="author-dot">海</span><b>${e(site.author)}</b><time datetime="${post.date}">${dateLabel(post.date)}</time><span>${post.readingMinutes} 分钟阅读</span><span>${post.wordCount.toLocaleString('zh-CN')} 字</span></div><div class="post-tags">${post.tags.map(tag=>`<span># ${e(tag)}</span>`).join('')}</div></header><div class="article-layout"><div class="prose">${post.html}</div>${toc}</div><footer class="article-bottom"><span>感谢读到这里。把想法留下，本身就很有意义。</span><div><a href="${href('archive/')}">← 更多记录</a><a href="${href(`editor/?post=${encodeURIComponent(post.slug)}`)}">编辑这篇文章 ↗</a></div></footer></article>`;
    await save(`posts/${post.slug}/index.html`,shell({title:post.title,description:post.description,current:'post',pagePath:postPath,body:article,article:true}));
    await save(`data/posts/${post.slug}.json`,json({slug:post.slug,title:post.title,date:post.date,tags:post.tags,description:post.description,category:post.category,featured:post.featured,cover:post.cover,draft:false,content:post.content}));
  }
  await save('editor/index.html',shell({title:'写作台',pagePath:'editor/',editor:true,body:'<main id="editor-app"></main>'}));
  await save('404.html',shell({title:'这一页还没写下',current:'404',pagePath:'404.html',body:`<section class="page-heading empty-state"><p class="eyebrow">404 / A PAGE STILL UNWRITTEN</p><h1>这一页，<br>还没有被写下。</h1><p>链接可能变了。回首页，找另一段记录吧。</p><a class="button primary" href="${href()}">回到首页 ↗</a></section>`}));
  await save('data/search.json',json(searchData));
  await save('.nojekyll','');
  await save('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${absolute('sitemap.xml')}\n`);
  const pages=['','archive/','about/',...posts.map(p=>`posts/${encodeURIComponent(p.slug)}/`)];
  await save('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(p=>`<url><loc>${e(absolute(p))}</loc></url>`).join('')}</urlset>`);
  await save('feed.xml',`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${e(site.title)}</title><link>${e(site.url)}</link><description>${e(site.description)}</description><language>zh-CN</language><atom:link href="${absolute('feed.xml')}" rel="self" type="application/rss+xml"/>${posts.map(p=>`<item><title>${e(p.title)}</title><link>${absolute(`posts/${encodeURIComponent(p.slug)}/`)}</link><guid>${absolute(`posts/${encodeURIComponent(p.slug)}/`)}</guid><pubDate>${new Date(p.date+'T00:00:00Z').toUTCString()}</pubDate><description>${e(p.description)}</description></item>`).join('')}</channel></rss>`);
  await build({absWorkingDir:root,entryPoints:{site:'src/site.mjs',editor:'src/editor.mjs'},outdir:'dist/assets',bundle:true,splitting:true,format:'esm',target:['es2022'],minify:true,loader:{'.woff':'file','.woff2':'file','.ttf':'file'},assetNames:'fonts/[name]-[hash]',logLevel:'warning'});
  console.log(`Built ${posts.length} articles with formulas, editor, RSS and search → dist/`);
  return {posts:posts.length,basePath:base};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildSite();
