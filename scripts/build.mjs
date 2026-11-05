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
const dateLabel=date=>new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
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
    const post={slug,title:String(data.title||slug),description:String(data.description||''),date,category:String(data.category||'Notes'),tags:Array.isArray(data.tags)?data.tags.map(String):[],featured:data.featured===true,cover:String(data.cover||'writing'),content,...rendered};
    post.html=post.html.replace(/(src|href)="\/(?!\/)([^"]*)"/g,(_,attr,p)=>`${attr}="${e(href(p))}"`);
    posts.push(post);
  }
  posts.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'en'));
  const categories=[...new Set(posts.map(p=>p.category))];
  const tags=[...new Set(posts.flatMap(p=>p.tags))];
  const searchData=posts.map(({content,html,toc,...post})=>({...post,url:href(`posts/${encodeURIComponent(post.slug)}/`)}));

  function shell({title,description=site.description,current='home',pagePath='',body,editor=false,article=false}){
    const nav=[['home','','Notes'],['archive','archive/','Archive'],['about','about/','About']];
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="theme-color" content="#f7f5ef"><meta name="description" content="${e(description)}"><meta property="og:type" content="${article?'article':'website'}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(absolute(pagePath))}"><link rel="canonical" href="${e(absolute(pagePath))}"><link rel="icon" type="image/svg+xml" href="${href('favicon.svg')}"><link rel="alternate" type="application/rss+xml" title="${e(site.title)}" href="${href('feed.xml')}"><title>${e(title)}${title===site.title?'':' · '+e(site.title)}</title><link rel="stylesheet" href="${href('assets/site.css')}">${editor?`<link rel="stylesheet" href="${href('assets/editor.css')}">`:''}</head><body class="${editor?'editor-body':''}"><a class="skip-link" href="${editor?'#editor-app':'#main'}">Skip to content</a>${editor?body:`<div class="site-shell"><header class="site-header"><a class="site-brand" href="${href()}">Haiqingma<span>.</span></a><nav class="site-nav" aria-label="Main navigation">${nav.map(([key,url,label])=>`<a href="${href(url)}" ${current===key?'class="active" aria-current="page"':''}>${label}</a>`).join('')}<button class="search-trigger" type="button" aria-label="Search notes">Search</button><a class="write-link" href="${href('editor/')}">Write ↗</a></nav></header><main class="main-shell" id="main"><div class="page-content">${body}</div></main><footer class="site-footer"><span>© ${new Date().getUTCFullYear()} Haiqingma</span><a href="${href('feed.xml')}">RSS</a></footer></div>`}<dialog class="search-dialog" id="search-dialog"><div class="dialog-heading"><span>Search notes</span><button class="dialog-close" type="button" aria-label="Close search">×</button></div><label class="sr-only" for="search-query">Search titles, tags, and descriptions</label><input id="search-query" class="search-input" type="search" placeholder="Search…" autocomplete="off"><div class="search-results" aria-live="polite"></div><p class="search-hint">Esc to close</p></dialog><div class="toast" role="status" aria-live="polite" hidden></div><script id="site-config" type="application/json">${json({...site,basePath:base})}</script><script type="module" src="${href(editor?'assets/editor.js':'assets/site.js')}"></script></body></html>`;
  }
  function card(post){return `<article class="post-card"><div class="post-meta"><time datetime="${post.date}">${dateLabel(post.date)}</time><span>${post.readingMinutes} min read</span></div><h2 class="post-title"><a href="${href(`posts/${encodeURIComponent(post.slug)}/`)}">${e(post.title)}</a></h2></article>`;}
  const home=`<section class="home-intro"><h1>Notes.</h1><p>${e(site.description)}</p></section><section id="latest" class="post-list" aria-label="Recent notes">${posts.map(post=>card(post)).join('')}</section>`;
  await save('index.html',shell({title:site.title,body:home}));
  const years=[...new Set(posts.map(p=>p.date.slice(0,4)))];
  const archive=`<header class="page-heading"><h1>Archive</h1></header>${years.map(year=>`<section class="archive-year"><h2>${year}<small>${posts.filter(p=>p.date.startsWith(year)).length} notes</small></h2>${posts.filter(p=>p.date.startsWith(year)).map(post=>`<a class="archive-item" href="${href(`posts/${encodeURIComponent(post.slug)}/`)}"><time datetime="${post.date}">${dateLabel(post.date)}</time><div><h3>${e(post.title)}</h3></div><b aria-hidden="true">↗</b></a>`).join('')}</section>`).join('')}`;
  await save('archive/index.html',shell({title:'Archive',current:'archive',pagePath:'archive/',body:archive}));
  const about=`<section class="about-page"><h1>Hi, I’m Haiqingma.</h1><p>I keep notes on things I’m learning, code I’m trying, and everyday life.</p><a class="text-link" href="https://github.com/${site.github.owner}" target="_blank" rel="noopener">GitHub ↗</a></section>`;
  await save('about/index.html',shell({title:'About',current:'about',pagePath:'about/',body:about}));
  for(const post of posts){
    const postPath=`posts/${encodeURIComponent(post.slug)}/`;
    const toc=post.toc.length?`<aside class="toc-panel"><details class="toc-details" open><summary>Contents</summary><nav class="toc-links" aria-label="On this page">${post.toc.map(h=>`<a class="level-${h.level}" href="#${encodeURIComponent(h.id)}">${e(h.text)}</a>`).join('')}</nav></details></aside>`:'';
    const article=`<article class="article-page" id="article-top"><header class="article-header"><a class="article-category" href="${href()}">← Notes</a><h1 class="article-title">${e(post.title)}</h1><div class="article-meta"><time datetime="${post.date}">${dateLabel(post.date)}</time><span>${post.readingMinutes} min read</span></div></header><div class="article-layout"><div class="prose">${post.html}</div>${toc}</div><footer class="article-bottom"><a href="${href()}">← All notes</a><a href="${href(`editor/?post=${encodeURIComponent(post.slug)}`)}">Edit ↗</a></footer></article>`;
    await save(`posts/${post.slug}/index.html`,shell({title:post.title,description:post.description,current:'post',pagePath:postPath,body:article,article:true}));
    await save(`data/posts/${post.slug}.json`,json({slug:post.slug,title:post.title,date:post.date,tags:post.tags,description:post.description,category:post.category,featured:post.featured,cover:post.cover,draft:false,content:post.content}));
  }
  await save('editor/index.html',shell({title:'Writing desk',pagePath:'editor/',editor:true,body:'<main id="editor-app"></main>'}));
  await save('404.html',shell({title:'Page not found',current:'404',pagePath:'404.html',body:`<section class="page-heading empty-state"><h1>Page not found.</h1><a href="${href()}">Back to notes ↗</a></section>`}));
  await save('data/search.json',json(searchData));
  await save('.nojekyll','');
  await save('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${absolute('sitemap.xml')}\n`);
  const pages=['','archive/','about/',...posts.map(p=>`posts/${encodeURIComponent(p.slug)}/`)];
  await save('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(p=>`<url><loc>${e(absolute(p))}</loc></url>`).join('')}</urlset>`);
  await save('feed.xml',`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${e(site.title)}</title><link>${e(site.url)}</link><description>${e(site.description)}</description><language>en</language><atom:link href="${absolute('feed.xml')}" rel="self" type="application/rss+xml"/>${posts.map(p=>`<item><title>${e(p.title)}</title><link>${absolute(`posts/${encodeURIComponent(p.slug)}/`)}</link><guid>${absolute(`posts/${encodeURIComponent(p.slug)}/`)}</guid><pubDate>${new Date(p.date+'T00:00:00Z').toUTCString()}</pubDate><description>${e(p.description)}</description></item>`).join('')}</channel></rss>`);
  await build({absWorkingDir:root,entryPoints:{site:'src/site.mjs',editor:'src/editor.mjs'},outdir:'dist/assets',bundle:true,splitting:true,format:'esm',target:['es2022'],minify:true,loader:{'.woff':'file','.woff2':'file','.ttf':'file'},assetNames:'fonts/[name]-[hash]',logLevel:'warning'});
  console.log(`Built ${posts.length} articles with formulas, editor, RSS and search → dist/`);
  return {posts:posts.length,basePath:base};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildSite();
