import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {renderMarkdown} from '../src/lib/markdown.mjs';
import config from '../site.config.mjs';

test('Chinese headings are linkable and duplicate headings have unique anchors',()=>{
  const result=renderMarkdown('## 一段记录\n\n## 一段记录\n\n### 深入一点');
  assert.deepEqual(result.toc.map(h=>h.id),['一段记录','一段记录-2','深入一点']);
});
test('Math renders locally and keeps its editable LaTeX source',()=>{
  const result=renderMarkdown('行内 $x^2$\n\n$$\n\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\n$$');
  assert.match(result.html,/class="katex/);assert.match(result.html,/data-tex="x\^2"/);assert.match(result.html,/data-display="block"/);
});
test('Pasted scripts and unsafe URLs do not become executable HTML',()=>{
  const result=renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n$x$');
  assert.doesNotMatch(result.html,/<script/);assert.doesNotMatch(result.html,/href="javascript:/);
  assert.match(result.html,/&lt;script&gt;/);
});
test('Code is highlighted and Mermaid keeps an escaped editable source',()=>{
  const result=renderMarkdown('```python\nprint("hello")\n```\n\n```mermaid\ngraph LR\n A-->B\n```');
  assert.match(result.html,/hljs-/);assert.match(result.html,/data-mermaid-source=/);assert.match(result.html,/contenteditable="false"/);
});
test('Published pages and their local asset links resolve under the GitHub Pages prefix',async()=>{
  const root=path.resolve('dist');let count=0;
  async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else if(file.endsWith('.html')){
    count++;const html=await fs.readFile(file,'utf8');
    for(const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)){
      const link=match[1].replaceAll('&amp;','&');if(!link.startsWith('/'))continue;
      assert.ok(link.startsWith(config.basePath),`Wrong prefix in ${file}: ${link}`);
      let target=path.join(root,decodeURIComponent(link.split(/[?#]/)[0].slice(config.basePath.length)));
      const stat=await fs.stat(target).catch(()=>null);assert.ok(stat,`Broken local link in ${file}: ${link}`);
      if(stat.isDirectory())await fs.access(path.join(target,'index.html'));
    }
  }}}
  await walk(root);assert.ok(count>=7);await fs.access(path.join(root,'feed.xml'));await fs.access(path.join(root,'sitemap.xml'));
});
