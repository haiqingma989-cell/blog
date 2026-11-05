import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import tasks from 'markdown-it-task-lists';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import csharp from 'highlight.js/lib/languages/csharp';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
for (const [name, language] of Object.entries({javascript, typescript, csharp, python, bash, json, css, xml})) hljs.registerLanguage(name, language);

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const mathEngine = {
  renderToString(tex, options) {
    const display = options?.displayMode;
    return `<span class="math-source${display ? ' math-block' : ''}" data-tex="${escapeHtml(tex)}" data-display="${display ? 'block' : 'inline'}" contenteditable="false">${katex.renderToString(tex, {...options, trust: false, throwOnError: false, strict: 'ignore', maxExpand: 1000})}</span>`;
  }
};
const md = new MarkdownIt({
  html: false, linkify: true, typographer: true,
  highlight(code, language) {
    const aliases = {js:'javascript', ts:'typescript', cs:'csharp', html:'xml', sh:'bash', shell:'bash'};
    const name = aliases[language] || language;
    return name && hljs.getLanguage(name) ? hljs.highlight(code, {language: name, ignoreIllegals: true}).value : '';
  }
}).use(footnote).use(tasks, {enabled: false}).use(texmath, {engine: mathEngine, delimiters: ['dollars','brackets'], katexOptions:{throwOnError:false}});
const standardFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  if (token.info.trim().toLowerCase() === 'mermaid') return `<div class="mermaid-block" data-mermaid-source="${escapeHtml(token.content)}" contenteditable="false"><pre class="mermaid">${escapeHtml(token.content)}</pre></div>`;
  return standardFence(tokens, index, options, env, self);
};
const standardHeading = md.renderer.rules.heading_open;
md.renderer.rules.heading_open = (tokens,index,options,env,self) => {
  const label = tokens[index+1]?.content || 'section';
  const stem = label.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/\s+/g,'-') || 'section';
  env.ids ??= new Map(); const count = (env.ids.get(stem) || 0)+1;env.ids.set(stem,count);
  const id = count===1 ? stem : `${stem}-${count}`;
  tokens[index].attrSet('id',id);
  if (['h2','h3'].includes(tokens[index].tag)) env.toc.push({id,text:label,level:Number(tokens[index].tag.slice(1))});
  return standardHeading ? standardHeading(tokens,index,options,env,self) : self.renderToken(tokens,index,options);
};
const standardLink = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens,index,options,env,self) => {
  const href = tokens[index].attrGet('href') || '';
  if (/^https?:\/\//i.test(href)) {tokens[index].attrSet('rel','noopener noreferrer');tokens[index].attrSet('target','_blank');}
  return standardLink ? standardLink(tokens,index,options,env,self) : self.renderToken(tokens,index,options);
};
export function renderMarkdown(source = '') {
  const env = {toc:[], ids:new Map()};
  const text = String(source);
  const html = md.render(text, env);
  const wordCount = (text.match(/[\u3400-\u9fff]|[a-zA-Z0-9_]+/g)||[]).length;
  return {html,toc:env.toc,wordCount,readingMinutes:Math.max(1,Math.ceil(wordCount/400))};
}
