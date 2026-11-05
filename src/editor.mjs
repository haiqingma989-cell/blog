import TurndownService from 'turndown';
import { renderMarkdown } from './lib/markdown.mjs';
import { enhanceContent } from './rich-content.mjs';
import './editor.css';

const mount = document.getElementById('editor-app');
if (!mount) throw new Error('找不到写作工作台容器。');

let config = {};
try { config = JSON.parse(document.getElementById('site-config')?.textContent || '{}'); }
catch { /* The editor can still save and export without deployment configuration. */ }
const basePath = '/' + String(config.basePath || '/').split('/').filter(Boolean).join('/') + '/';
const base = basePath === '//' ? '/' : basePath;
const storageKey = 'stillleaf.writing-desk.v1';
const slugPattern = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,99}$/u;
const preservedMetadata = ['category', 'featured', 'cover', 'draft'];
const state = { drafts: [], activeId: '', mode: 'source', view: 'write', dirty: false, saved: true, visualDirty: false, protectedVisual: false };
let saveTimer, previewTimer, toastTimer, renderSequence = 0, selectionRange;
let lastStorageError = '';

document.body.classList.add('is-writing');
mount.innerHTML = `
  <div class="writing-app">
    <header class="desk-header">
      <div class="desk-identity"><a class="desk-back" id="desk-back" aria-label="返回博客">← <span>返回博客</span></a><span class="desk-divider"></span><div><span class="desk-eyebrow">A SPACE FOR YOUR WORDS</span><h1>写作工作台<span class="desk-title-dot">.</span></h1></div></div>
      <div class="desk-header-actions"><span class="desk-save-status" id="desk-save-status" role="status" aria-live="polite" data-state="saved">草稿保存在此浏览器</span><button class="desk-button desk-publish" type="button" data-action="publish"><span aria-hidden="true">↗</span> 发布到 GitHub</button></div>
    </header>
    <nav class="desk-actions" aria-label="文章操作">
      <div class="desk-action-group"><button class="desk-button" type="button" data-action="drafts">▤ <span>我的草稿</span><span class="desk-count" id="desk-draft-count">1</span></button><button class="desk-button" type="button" data-action="new">＋ 新建</button><span class="desk-action-separator"></span><button class="desk-button" type="button" data-action="import">导入 Markdown</button><button class="desk-button" type="button" data-action="export">导出 .md</button></div>
      <div class="desk-mode-switch" role="group" aria-label="编辑方式"><button type="button" data-mode="source" aria-pressed="true">Markdown</button><button type="button" data-mode="visual" aria-pressed="false">可视化</button></div>
      <input id="desk-import" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden>
    </nav>
    <div class="desk-mobile-tabs" role="group" aria-label="工作区视图"><button type="button" data-view="write" aria-pressed="true">写作</button><button type="button" data-view="preview" aria-pressed="false">预览</button></div>
    <div class="desk-workspace" data-view="write">
      <section class="desk-editor-pane" aria-label="文章编辑">
        <div class="desk-pane-label"><span><i class="desk-indicator"></i> 把想法写下来</span><span class="desk-local-label">LOCAL DRAFT</span></div>
        <div class="desk-metadata">
          <label class="desk-sr-only" for="desk-title">文章标题</label><input id="desk-title" class="desk-title-input" type="text" maxlength="240" placeholder="一个值得记下的标题…" autocomplete="off">
          <details class="desk-article-settings" open><summary>文章信息 <span>链接、日期与标签</span></summary><div class="desk-meta-grid">
            <label class="desk-field desk-slug-field">文章链接 <input id="desk-slug" type="text" maxlength="100" placeholder="a-small-observation" autocomplete="off" spellcheck="false"><span class="desk-field-help">中文、字母、数字或短横线</span></label>
            <label class="desk-field">发布日期 <input id="desk-date" type="date"></label>
            <label class="desk-field desk-tags-field">标签 <input id="desk-tags" type="text" placeholder="生活, 技术, 随想" autocomplete="off"><span class="desk-field-help">用逗号分隔，留空也很好</span></label>
            <label class="desk-field desk-category-field">分类 <input id="desk-category" type="text" placeholder="随手记录" autocomplete="off"></label>
            <label class="desk-field desk-cover-field">封面地址 <input id="desk-cover" type="text" placeholder="/blog/images/cover.jpg 或原始图片地址" autocomplete="off"><span class="desk-field-help">保持原始资源地址，留空则不设置封面</span></label>
            <label class="desk-field desk-description-field">简介 <textarea id="desk-description" rows="2" placeholder="给路过的读者，留一句小小的邀请。"></textarea></label>
            <div class="desk-meta-switches"><label><input id="desk-featured" type="checkbox"> 首页推荐</label><label><input id="desk-unpublished" type="checkbox"> 保留为未发布草稿</label><span>未发布草稿提交后不会显示在博客中。</span></div>
          </div></details>
        </div>
        <div class="desk-toolbar" role="toolbar" aria-label="文字格式">
          <button type="button" data-format="bold" title="粗体" aria-label="粗体"><b>B</b></button><button type="button" data-format="italic" title="斜体" aria-label="斜体"><i>I</i></button><button type="button" data-format="heading" title="二级标题" aria-label="二级标题">H₂</button><button type="button" data-format="link" title="链接" aria-label="插入链接">↗</button><span class="desk-toolbar-rule"></span><button type="button" data-format="code" title="代码块" aria-label="插入代码块">&lt;/&gt;</button><button type="button" data-format="table" title="表格" aria-label="插入表格">▦</button><span class="desk-toolbar-rule"></span><button type="button" data-format="inline-math" title="行内公式" aria-label="插入行内公式">ƒx</button><button type="button" data-format="block-math" title="独立公式" aria-label="插入独立公式">∑</button><button type="button" data-format="diagram" title="Mermaid 图表" aria-label="插入 Mermaid 图表">◇</button><span class="desk-toolbar-hint">文字，也可以有自己的形状。</span>
        </div>
        <p id="desk-visual-notice" class="desk-visual-notice" role="status" hidden>这篇文章含脚注，已保护为只读预览。请切换 Markdown 修改，原始脚注及引用会完整保留。</p>
        <label class="desk-sr-only" for="desk-source">Markdown 正文</label><textarea id="desk-source" class="desk-source" spellcheck="false" placeholder="从一个念头开始。\n\n支持 Markdown、代码高亮、LaTeX 公式与 Mermaid 图表。" aria-describedby="desk-edit-help"></textarea>
        <div id="desk-visual" class="desk-visual prose" contenteditable="true" role="textbox" aria-label="可视化正文编辑" aria-multiline="true" spellcheck="false" data-placeholder="写点什么吧，格式由你决定。" hidden></div>
        <footer class="desk-editor-footer"><span id="desk-edit-help">支持 Markdown · 公式 · 图表</span><span id="desk-word-count">0 字 · 约 1 分钟</span></footer>
      </section>
      <section class="desk-preview-pane" aria-label="文章实时预览">
        <div class="desk-pane-label"><span><i class="desk-indicator desk-preview-indicator"></i> 读者会看到的样子</span><span>LIVE PREVIEW</span></div>
        <div class="desk-preview-scroll"><article class="desk-preview-article"><header class="desk-preview-header"><div class="desk-preview-date" id="desk-preview-date"></div><h2 id="desk-preview-title">还没起名的手记</h2><p id="desk-preview-description" hidden></p><div class="desk-preview-tags" id="desk-preview-tags"></div></header><div id="desk-preview" class="prose desk-preview-content"></div></article><div class="desk-preview-end"><span></span><i>写到这里，也很好。</i><span></span></div></div>
      </section>
    </div>
    <dialog class="desk-dialog desk-drafts-dialog" id="desk-drafts-dialog" aria-labelledby="desk-drafts-heading"><div class="desk-dialog-heading"><div><span class="desk-eyebrow">WORDS IN PROGRESS</span><h2 id="desk-drafts-heading">还在生长的草稿</h2></div><button class="desk-icon-button" type="button" data-close="desk-drafts-dialog" aria-label="关闭草稿列表">×</button></div><p class="desk-dialog-note">自动保存在当前浏览器。换设备前，请先导出一份 Markdown。</p><div class="desk-draft-list" id="desk-draft-list"></div><button class="desk-button desk-button-solid" type="button" data-action="new">＋ 写一篇新的</button></dialog>
    <dialog class="desk-dialog desk-publish-dialog" id="desk-publish-dialog" aria-labelledby="desk-publish-heading"><div class="desk-dialog-heading"><div><span class="desk-eyebrow">LET YOUR WORDS TRAVEL</span><h2 id="desk-publish-heading">把这篇手记，交给读者</h2></div><button class="desk-icon-button" type="button" data-close="desk-publish-dialog" aria-label="关闭发布说明">×</button></div><p class="desk-publish-intro">通过你自己的 GitHub 账号提交。这里不会索取、保存或传送任何访问密钥。</p><div class="desk-publish-file"><span>即将提交</span><strong id="desk-publish-filename"></strong></div><ol class="desk-publish-steps"><li><strong>复制完整文章</strong><p>包含标题、日期、分类、标签、封面和正文，可直接放进仓库。</p><button class="desk-button desk-button-solid" type="button" id="desk-copy-markdown">1. 复制 Markdown</button></li><li><strong id="desk-github-step-title">在 GitHub 创建文章</strong><p>打开页面，粘贴到文件编辑区，检查内容后点击 <b>Commit changes</b>。需要先登录 GitHub，并拥有仓库写入权限。</p><a class="desk-button desk-github-link" id="desk-github-link" target="_blank" rel="noopener noreferrer">2. 打开 GitHub ↗</a></li><li><strong id="desk-publish-deploy-title">等待自动上线</strong><p id="desk-publish-deploy-note">提交成功后，仓库的 GitHub Actions 会构建并部署博客。可以到仓库的 Actions 页面查看进度。</p></li></ol><p class="desk-publish-config" id="desk-publish-config" hidden></p><p class="desk-publish-footnote">这一步会打开 GitHub 供你确认提交，工作台不会直接发布文章。</p></dialog>
    <div class="desk-toast" id="desk-toast" role="status" aria-live="polite" hidden></div>
  </div>`;

const $ = (id) => document.getElementById(id);
const fields = { title: $('desk-title'), slug: $('desk-slug'), date: $('desk-date'), tags: $('desk-tags'), category: $('desk-category'), cover: $('desk-cover'), featured: $('desk-featured'), unpublished: $('desk-unpublished'), description: $('desk-description') };
const source = $('desk-source');
const visual = $('desk-visual');
const preview = $('desk-preview');
$('desk-back').href = base;

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', fence: '```', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
turndown.addRule('blog-task-checkbox', {
  filter: node => node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox',
  replacement(_content, node) { return (typeof node.checked === 'boolean' ? node.checked : node.hasAttribute('checked')) ? '[x] ' : '[ ] '; }
});
turndown.addRule('blog-table', {
  filter: 'table',
  replacement(_content, node) {
    const rows = Array.from(node.querySelectorAll('tr')).map(row => Array.from(row.children).filter(cell => /^(TH|TD)$/.test(cell.nodeName)).map(cell => turndown.turndown(cell).trim().replace(/\n+/g, ' ').replace(/(?<!\\)\|/g, '\\|')));
    if (!rows.length) return '';
    const columns = rows.reduce((largest, row) => Math.max(largest, row.length), 0);
    const rowText = row => '| ' + Array.from({ length: columns }, (_, index) => row[index] || '').join(' | ') + ' |';
    return '\n\n' + [rowText(rows[0]), rowText(Array(columns).fill('---')), ...rows.slice(1).map(rowText)].join('\n') + '\n\n';
  }
});
turndown.addRule('blog-fenced-code', {
  filter: node => node.nodeName === 'PRE' && !!node.querySelector('code'),
  replacement(_content, node) {
    const code = node.querySelector('code');
    const text = code.textContent.replace(/\n$/, '');
    const language = code.className.match(/(?:^|\s)language-([\w.+-]+)/)?.[1] || '';
    return fence(text, language);
  }
});
turndown.addRule('blog-math', {
  filter: node => node.nodeType === 1 && (node.hasAttribute('data-tex') || node.classList.contains('katex-display') || (node.classList.contains('katex') && !node.closest('[data-tex], .katex-display'))),
  replacement(_content, node) {
    const tex = node.getAttribute('data-tex') ?? node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? '';
    const display = /^(true|block|display|1)$/.test(node.getAttribute('data-display') || '') || node.classList.contains('katex-display') || node.classList.contains('math-block') || !!node.querySelector('.katex-display');
    return display ? '\n\n$$\n' + tex + '\n$$\n\n' : '$' + tex + '$';
  }
});
turndown.addRule('blog-mermaid', {
  filter: node => node.nodeType === 1 && (node.hasAttribute('data-mermaid-source') || node.hasAttribute('data-mermaid')),
  replacement(_content, node) {
    const text = node.getAttribute('data-mermaid-source') ?? node.getAttribute('data-mermaid') ?? '';
    return fence(text, 'mermaid');
  }
});

function fence(text, language) {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const marker = '`'.repeat(Math.max(3, longest + 1));
  return '\n\n' + marker + language + '\n' + text + '\n' + marker + '\n\n';
}

function dateToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function makeId() { return globalThis.crypto?.randomUUID?.() || 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
function slugify(text) { return String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 100); }
function draft() { return state.drafts.find(item => item.id === state.activeId); }
function normalizeDraft(value = {}) {
  const id = typeof value.id === 'string' ? value.id : makeId();
  const metadataMissing = Array.isArray(value.metadataMissing) ? value.metadataMissing.filter(key => preservedMetadata.includes(key)) : value.sourceSlug ? preservedMetadata.filter(key => !Object.prototype.hasOwnProperty.call(value, key)) : [];
  return { id, title: String(value.title || ''), slug: String(value.slug || ''), date: /^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(value.date) ? value.date.slice(0, 10) : dateToday(), tags: Array.isArray(value.tags) ? value.tags.map(String) : [], category: String(value.category || '随手记录'), cover: String(value.cover || ''), featured: value.featured === true || value.featured === 'true', draft: value.draft === true || value.draft === 'true', description: String(value.description || ''), content: String(value.content || ''), updatedAt: Number(value.updatedAt) || Date.now(), sourceSlug: String(value.sourceSlug || ''), autoSlug: value.autoSlug !== false, metadataMissing };
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  const node = $('desk-toast');
  node.textContent = message; node.dataset.error = String(error); node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, error ? 7500 : 4200);
}
function status(text, kind = 'saved') { $('desk-save-status').textContent = text; $('desk-save-status').dataset.state = kind; }

function persist() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, activeId: state.activeId, drafts: state.drafts }));
    state.dirty = false; state.saved = true; lastStorageError = '';
    status('已自动保存在此浏览器');
    $('desk-draft-count').textContent = String(state.drafts.length);
    return true;
  } catch (error) {
    state.saved = false;
    status('自动保存失败 · 请导出备份', 'error');
    if (lastStorageError !== error.name) toast('浏览器未能保存草稿，请先导出 Markdown 备份。可能是存储空间不足或隐私设置限制。', true);
    lastStorageError = error.name;
    return false;
  }
}
function changed() {
  draft().updatedAt = Date.now(); state.dirty = true;
  status('正在保存…', 'pending');
  clearTimeout(saveTimer); saveTimer = setTimeout(persist, 500);
  schedulePreview();
}
function readFields() {
  const current = draft();
  current.title = fields.title.value;
  current.slug = fields.slug.value.trim();
  current.date = fields.date.value || dateToday();
  current.tags = fields.tags.value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
  current.category = fields.category.value.trim() || '随手记录';
  current.cover = fields.cover.value;
  current.featured = fields.featured.checked;
  current.draft = fields.unpublished.checked;
  current.description = fields.description.value;
}
function syncVisual() {
  if (state.mode !== 'visual' || !state.visualDirty || state.protectedVisual) return;
  draft().content = turndown.turndown(visual);
  source.value = draft().content;
  state.visualDirty = false;
}
function flush() { syncVisual(); readFields(); persist(); }

function loadDraft(id) {
  state.activeId = id;
  const current = draft();
  fields.title.value = current.title; fields.slug.value = current.slug; fields.date.value = current.date;
  fields.tags.value = current.tags.join(', '); fields.description.value = current.description;
  fields.category.value = current.category; fields.cover.value = current.cover;
  fields.featured.checked = current.featured; fields.unpublished.checked = current.draft;
  source.value = current.content;
  if (state.mode === 'visual') renderVisual();
  renderPreview(); persist();
}
function newDraft() {
  flush();
  const current = normalizeDraft();
  state.drafts.push(current); loadDraft(current.id); closeDialog($('desk-drafts-dialog'));
  setView('write'); fields.title.focus(); toast('已新建草稿，上一篇已经保留。');
}

function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 260); }
async function renderPreview() {
  clearTimeout(previewTimer);
  const sequence = ++renderSequence;
  const current = draft();
  $('desk-preview-title').textContent = current.title || '还没起名的手记';
  $('desk-preview-date').textContent = (current.date || dateToday()).replace(/-/g, ' / ');
  $('desk-preview-description').textContent = current.description;
  $('desk-preview-description').hidden = !current.description;
  $('desk-preview-tags').replaceChildren(...current.tags.map(tag => { const node = document.createElement('span'); node.textContent = tag; return node; }));
  document.title = (current.title || '写作工作台') + ' · 写作';
  try {
    const rendered = renderMarkdown(current.content);
    $('desk-word-count').textContent = `${rendered.wordCount || 0} 字 · 约 ${Math.max(1, rendered.readingMinutes || 1)} 分钟`;
    if (!current.content.trim()) {
      preview.replaceChildren();
      const empty = document.createElement('div'); empty.className = 'desk-preview-empty';
      const mark = document.createElement('span'); mark.className = 'desk-empty-mark'; mark.textContent = '✳';
      const title = document.createElement('p'); title.textContent = '每一篇好文章，都从一句话开始。';
      const hint = document.createElement('small'); hint.textContent = '在左边写下你的第一行，预览会在这里慢慢生长。';
      empty.append(mark, title, hint); preview.append(empty); return;
    }
    preview.innerHTML = rendered.html;
    await enhanceContent(preview);
    if (sequence !== renderSequence) return;
  } catch { if (sequence === renderSequence) toast('预览暂时没有渲染成功，正文仍然保存在编辑区。请检查公式或图表语法。', true); }
}
function protectRichNodes(container) {
  container.querySelectorAll('[data-tex], .katex-display, .katex, [data-mermaid-source], [data-mermaid]').forEach(node => { node.setAttribute('contenteditable', 'false'); if (!node.parentElement?.closest('[data-tex], .katex-display, [data-mermaid-source], [data-mermaid]')) node.setAttribute('tabindex', '0'); });
  container.querySelectorAll('pre > code.language-mermaid').forEach(code => { code.parentElement.dataset.mermaidSource = code.textContent; code.parentElement.setAttribute('contenteditable', 'false'); });
}
async function renderVisual() {
  try {
    visual.innerHTML = renderMarkdown(draft().content).html;
    state.visualDirty = false;
    state.protectedVisual = !!visual.querySelector('.footnote-ref, .footnotes');
    visual.setAttribute('contenteditable', String(!state.protectedVisual));
    visual.setAttribute('aria-readonly', String(state.protectedVisual));
    $('desk-visual-notice').hidden = !state.protectedVisual;
    mount.querySelectorAll('[data-format]').forEach(button => { button.disabled = state.protectedVisual; });
    if (state.protectedVisual) $('desk-edit-help').textContent = '脚注已保护 · 请切换 Markdown 编辑';
    else visual.querySelectorAll('input[type="checkbox"]').forEach(input => { input.disabled = false; });
    protectRichNodes(visual);
    await enhanceContent(visual);
    protectRichNodes(visual);
  } catch { toast('可视化渲染暂时失败，可以继续使用 Markdown 编辑。', true); }
}
function setMode(mode) {
  if (mode === state.mode) return;
  syncVisual();
  state.mode = mode;
  source.value = draft().content;
  source.hidden = mode !== 'source'; visual.hidden = mode !== 'visual';
  if (mode === 'source') { $('desk-visual-notice').hidden = true; mount.querySelectorAll('[data-format]').forEach(button => { button.disabled = false; }); }
  mount.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  $('desk-edit-help').textContent = mode === 'visual' ? '公式与图表是受保护的节点，请切换 Markdown 修改' : '支持 Markdown · 公式 · 图表';
  if (mode === 'visual') { renderVisual(); visual.focus(); }
  else source.focus();
  changed();
}
function setView(view) {
  state.view = view;
  mount.querySelector('.desk-workspace').dataset.view = view;
  mount.querySelectorAll('[data-view]').forEach(button => { if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.view === view)); });
  if (view === 'preview') { syncVisual(); renderPreview(); }
}

function rememberSelection() {
  const selection = window.getSelection();
  if (selection?.rangeCount && visual.contains(selection.anchorNode)) selectionRange = selection.getRangeAt(0).cloneRange();
}
function restoreSelection() {
  visual.focus();
  const selection = window.getSelection();
  if (selectionRange && visual.contains(selectionRange.commonAncestorContainer)) { selection.removeAllRanges(); selection.addRange(selectionRange); }
}
function sourceInsert(before, fallback = '', after = '') {
  const start = source.selectionStart, end = source.selectionEnd;
  const selected = source.value.slice(start, end) || fallback;
  source.setRangeText(before + selected + after, start, end, 'end');
  source.focus(); source.setSelectionRange(start + before.length, start + before.length + selected.length);
  draft().content = source.value; changed();
}
async function visualInsert(markdown, inline = false) {
  if (state.protectedVisual) { toast('这篇文章的脚注已保护，请切换 Markdown 修改。'); return; }
  restoreSelection();
  const selection = window.getSelection();
  const range = selection?.rangeCount && visual.contains(selection.anchorNode) ? selection.getRangeAt(0) : document.createRange();
  if (!visual.contains(range.commonAncestorContainer)) { range.selectNodeContents(visual); range.collapse(false); }
  const container = document.createElement('div');
  container.innerHTML = renderMarkdown(markdown).html;
  if (inline && container.children.length === 1 && container.firstElementChild.tagName === 'P') {
    const paragraph = container.firstElementChild;
    while (paragraph.firstChild) container.insertBefore(paragraph.firstChild, paragraph);
    paragraph.remove();
  }
  protectRichNodes(container);
  const fragment = document.createDocumentFragment();
  while (container.firstChild) fragment.append(container.firstChild);
  const last = fragment.lastChild;
  range.deleteContents(); range.insertNode(fragment);
  if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
  rememberSelection(); state.visualDirty = true; syncVisual(); changed();
  try { await enhanceContent(visual); protectRichNodes(visual); }
  catch { toast('图表未能显示，切换 Markdown 可以检查原始语法。', true); }
}
function format(kind) {
  if (state.mode === 'visual' && state.protectedVisual) { toast('这篇文章的脚注已保护，请切换 Markdown 修改。'); return; }
  const snippets = {
    code: ['\n\n```javascript\n', 'const hello = "你好，世界";', '\n```\n'],
    table: ['\n\n', '| 项目 | 说明 |\n| --- | --- |\n| 一个想法 | 从这里开始 |\n', ''],
    'inline-math': ['$', 'E = mc^2', '$'],
    'block-math': ['\n\n$$\n', '\\int_0^1 x^2\\,dx = \\frac{1}{3}', '\n$$\n'],
    diagram: ['\n\n```mermaid\n', 'flowchart LR\n  A[一个念头] --> B[写下来]\n  B --> C[分享给读者]', '\n```\n']
  };
  if (state.mode === 'source') {
    if (kind === 'bold') sourceInsert('**', '加粗文字', '**');
    else if (kind === 'italic') sourceInsert('*', '斜体文字', '*');
    else if (kind === 'heading') sourceInsert('\n## ', '一个小标题', '\n');
    else if (kind === 'link') sourceInsert('[', '链接文字', '](https://example.com)');
    else if (snippets[kind]) sourceInsert(...snippets[kind]);
    return;
  }
  restoreSelection();
  if (kind === 'bold' || kind === 'italic') document.execCommand(kind, false);
  else if (kind === 'heading') document.execCommand('formatBlock', false, 'h2');
  else if (kind === 'link') {
    const url = window.prompt('输入链接地址（https://…、mailto:… 或站内路径）', 'https://');
    if (url === null) return;
    if (!/^(https?:\/\/|mailto:|tel:|#|\/|\.\.?\/)/i.test(url.trim()) || /^\/\//.test(url.trim())) { toast('请输入有效的 HTTPS、邮件地址或站内链接。', true); return; }
    if (!window.getSelection()?.toString()) visualInsert('[链接文字](' + url.trim().replace(/\)/g, '%29') + ')', true);
    else document.execCommand('createLink', false, url.trim());
  } else if (snippets[kind]) { visualInsert(snippets[kind].join(''), kind === 'inline-math'); return; }
  rememberSelection(); state.visualDirty = true; syncVisual(); changed();
}

function unquote(text) {
  const value = text.trim();
  if (value.startsWith('"') && value.endsWith('"')) { try { return JSON.parse(value); } catch { return value.slice(1, -1); } }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value.replace(/\s+#.*$/, '').trim();
}
function yamlArray(value) {
  value = value.replace(/\]\s+#.*$/, ']');
  try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.map(String); } catch { /* YAML also allows unquoted strings. */ }
  const inside = value.trim().replace(/^\[|\]$/g, '');
  const tokens = inside.match(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^,]+/g) || [];
  return tokens.map(unquote).filter(Boolean);
}
function parseDocument(text, filename) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  const data = {};
  let content = normalized;
  if (match) {
    content = normalized.slice(match[0].length).replace(/^\n/, '');
    const lines = match[1].split('\n');
    for (let index = 0; index < lines.length; index++) {
      const field = lines[index].match(/^(title|slug|date|tags|description|category|cover|featured|draft):[ \t]*(.*)$/);
      if (!field) continue;
      const [, key, value] = field;
      if (key === 'featured' || key === 'draft') data[key] = /^(true|yes|on)$/i.test(String(unquote(value)));
      else if (key === 'tags') {
        if (value.trim().startsWith('[')) data.tags = yamlArray(value);
        else if (value.trim()) data.tags = unquote(value).split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
        else { data.tags = []; while (index + 1 < lines.length && /^[ \t]*-\s+/.test(lines[index + 1])) data.tags.push(unquote(lines[++index].replace(/^[ \t]*-\s+/, ''))); }
      } else if (/^[|>][-+]?$/.test(value.trim())) {
        const block = []; while (index + 1 < lines.length && (/^\s/.test(lines[index + 1]) || !lines[index + 1].trim())) block.push(lines[++index].replace(/^ {1,2}/, ''));
        data[key] = value.trim().startsWith('>') ? block.join(' ').trim() : block.join('\n').trimEnd();
      } else data[key] = unquote(value);
    }
  } else if (normalized.startsWith('---\n')) toast('没有找到完整的文章信息区，已保留为正文导入。', true);
  const title = String(data.title || filename.replace(/\.(md|markdown|txt)$/i, ''));
  return normalizeDraft({ ...data, title, slug: data.slug || slugify(title), content, autoSlug: !data.slug });
}
function markdownDocument(current = draft()) {
  const title = current.title.trim() || '未命名手记';
  const slug = current.slug.trim() || slugify(title) || 'note-' + dateToday();
  return ['---', 'title: ' + JSON.stringify(title), 'slug: ' + JSON.stringify(slug), 'date: ' + JSON.stringify(current.date || dateToday()), 'category: ' + JSON.stringify(current.category || '随手记录'), 'tags: [' + current.tags.map(tag => JSON.stringify(tag)).join(', ') + ']', 'description: ' + JSON.stringify(current.description || ''), 'featured: ' + String(current.featured === true), 'cover: ' + JSON.stringify(current.cover || ''), 'draft: ' + String(current.draft === true), '---', '', current.content.replace(/\s+$/, ''), ''].join('\n');
}
async function importFile(file) {
  if (!file) return;
  if (!/\.(md|markdown|txt)$/i.test(file.name)) { toast('请选择 .md、.markdown 或 .txt 文件。', true); return; }
  if (file.size > 5 * 1024 * 1024) { toast('这篇文章超过 5 MB，请拆分后导入。', true); return; }
  try {
    const text = await file.text(); flush();
    const imported = parseDocument(text, file.name); state.drafts.push(imported); loadDraft(imported.id);
    setView('write'); toast('文章已导入为新草稿，原来的草稿也已保留。');
  } catch { toast('没有读取到这个文件，请重新选择文件。原草稿仍然保留。', true); }
  finally { $('desk-import').value = ''; }
}
function exportFile() {
  flush();
  try {
    const blob = new Blob([markdownDocument()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = (slugify(draft().slug) || slugify(draft().title) || 'untitled-note') + '.md';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出 Markdown，可带到其他设备继续写。');
  } catch { toast('文件导出失败，请重试，或用发布窗口复制完整 Markdown。', true); }
}

function openDialog(dialog) { if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog'); } }
function closeDialog(dialog) { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
function showDrafts() {
  flush();
  const list = $('desk-draft-list'); list.replaceChildren();
  [...state.drafts].sort((a, b) => b.updatedAt - a.updatedAt).forEach(item => {
    const row = document.createElement('div'); row.className = 'desk-draft-row'; row.dataset.active = String(item.id === state.activeId);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'desk-draft-open';
    const title = document.createElement('strong'); title.textContent = item.title || '未命名手记';
    const meta = document.createElement('span'); meta.textContent = `${item.date} · ${item.content.trim() ? item.content.replace(/[#*`$>]/g, '').slice(0, 44).replace(/\n/g, ' ') : '等待第一句话'}`;
    button.append(title, meta); button.addEventListener('click', () => { loadDraft(item.id); closeDialog($('desk-drafts-dialog')); toast('已切换草稿。'); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'desk-draft-delete'; remove.textContent = '删除'; remove.setAttribute('aria-label', '删除草稿：' + (item.title || '未命名手记'));
    remove.addEventListener('click', () => {
      if (!window.confirm('删除“' + (item.title || '未命名手记') + '”的本地草稿？删除后无法恢复，请先确认已经导出。')) return;
      state.drafts = state.drafts.filter(current => current.id !== item.id);
      if (!state.drafts.length) state.drafts.push(normalizeDraft());
      if (state.activeId === item.id) loadDraft(state.drafts[0].id);
      persist(); showDrafts(); toast('这篇本地草稿已删除。');
    });
    row.append(button, remove); list.append(row);
  });
  openDialog($('desk-drafts-dialog'));
}
function publish() {
  flush();
  const current = draft();
  if (current.metadataMissing.length) { toast('这篇旧草稿的原文章信息尚未补全。请联网重新打开原文章后再提交，避免丢失分类、推荐或封面。', true); return; }
  $('desk-copy-markdown').textContent = '1. 复制 Markdown';
  $('desk-publish-deploy-title').textContent = current.draft ? '这篇文章将保留为未发布草稿' : '等待自动上线';
  $('desk-publish-deploy-note').textContent = current.draft ? '当前已开启“保留为未发布草稿”。提交后文件会保存在仓库，但不会出现在博客。准备公开时，关闭这一标记后再次提交。' : '提交成功后，仓库的 GitHub Actions 会构建并部署博客。可以到仓库的 Actions 页面查看进度。';
  if (!current.title.trim() || !current.content.trim()) { toast('发布前，请先写下文章标题和正文。', true); setView('write'); (!current.title.trim() ? fields.title : state.mode === 'source' ? source : visual).focus(); return; }
  if (!slugPattern.test(current.slug)) { toast('文章链接需要 1–100 个中文、字母、数字或短横线，并以文字或数字开头。', true); setView('write'); fields.slug.focus(); return; }
  const github = config.github || {}, owner = String(github.owner || ''), repo = String(github.repo || ''), branch = String(github.branch || 'main');
  const configured = /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(repo) && owner !== '..' && repo !== '..' && branch.length > 0;
  const link = $('desk-github-link'), warning = $('desk-publish-config');
  $('desk-publish-filename').textContent = 'content/posts/' + current.slug + '.md';
  const update = current.sourceSlug === current.slug;
  $('desk-github-step-title').textContent = update ? '在 GitHub 更新这篇文章' : '在 GitHub 创建文章';
  if (configured) {
    const repoPath = 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
    const branchPath = encodeURIComponent(branch);
    link.href = update ? `${repoPath}/edit/${branchPath}/content/posts/${encodeURIComponent(current.slug)}.md` : `${repoPath}/new/${branchPath}/content/posts?filename=${encodeURIComponent(current.slug + '.md')}`;
    link.removeAttribute('aria-disabled'); warning.hidden = true;
  } else {
    link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); warning.hidden = false;
    warning.textContent = '博客还没有配置 GitHub 仓库。你仍可复制或导出文章；请在站点配置中填写 github.owner、github.repo 和 github.branch 后再提交。';
  }
  openDialog($('desk-publish-dialog'));
}
async function copyMarkdown() {
  flush();
  const text = markdownDocument();
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement('textarea'); area.value = text; area.className = 'desk-copy-buffer';
      // Keep the fallback inside the modal so the browser's focus trap permits selection.
      $('desk-publish-dialog').append(area); area.focus(); area.select();
      const copied = document.execCommand('copy'); area.remove(); $('desk-copy-markdown').focus();
      if (!copied) throw new Error('Clipboard unavailable');
    }
    $('desk-copy-markdown').textContent = '✓ 已复制完整 Markdown';
    toast('已复制。到 GitHub 粘贴正文，确认后提交即可。');
  } catch { toast('浏览器未允许复制，请关闭发布窗口，导出 .md 后复制文件中的完整内容。', true); }
}

async function loadPublished() {
  const slug = new URLSearchParams(location.search).get('post');
  if (!slug) return;
  if (!slugPattern.test(slug)) { toast('文章链接格式不正确，已恢复本地草稿。', true); return; }
  const existing = state.drafts.find(item => item.sourceSlug === slug);
  if (existing) {
    flush(); loadDraft(existing.id);
    if (!existing.metadataMissing.length) { toast('已恢复这篇文章的本地草稿，没有覆盖你的修改。'); return; }
    toast('已恢复本地正文，正在补全原文章的分类与封面等信息。');
  }
  const activeAtRequest = state.activeId;
  const updatedAtRequest = draft().updatedAt;
  try {
    const response = await fetch(base + 'data/posts/' + encodeURIComponent(slug) + '.json', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Not found');
    const article = await response.json();
    if (!article || typeof article.content !== 'string' || typeof article.title !== 'string') throw new Error('Invalid article');
    if (existing) {
      if (!state.drafts.includes(existing)) return;
      const restored = normalizeDraft(article);
      const missing = [...existing.metadataMissing];
      for (const key of missing) existing[key] = restored[key];
      existing.metadataMissing = [];
      if (state.activeId === existing.id) {
        for (const key of missing) {
          const field = fields[key === 'draft' ? 'unpublished' : key];
          if (key === 'featured' || key === 'draft') field.checked = existing[key];
          else field.value = existing[key];
        }
      }
      persist(); toast('原文章信息已补全，本地正文和你的修改都已保留。'); return;
    }
    const imported = normalizeDraft({ ...article, sourceSlug: slug, slug: article.slug || slug, autoSlug: false });
    state.drafts.push(imported);
    if (state.activeId === activeAtRequest && draft().updatedAt === updatedAtRequest) { flush(); loadDraft(imported.id); toast('已载入文章，可继续编辑并到 GitHub 提交更新。'); }
    else { persist(); toast('文章已加入“我的草稿”，没有打断你正在写的内容。'); }
  } catch { toast('没有载入这篇已发布文章，请检查链接或网络。本地草稿不受影响。', true); }
}

Object.entries(fields).forEach(([key, field]) => field.addEventListener('input', () => {
  const metadataKey = key === 'unpublished' ? 'draft' : key;
  if (preservedMetadata.includes(metadataKey)) draft().metadataMissing = draft().metadataMissing.filter(missing => missing !== metadataKey);
  if (key === 'slug') draft().autoSlug = false;
  if (key === 'title' && draft().autoSlug) fields.slug.value = slugify(fields.title.value);
  readFields(); changed();
}));
source.addEventListener('input', () => { draft().content = source.value; changed(); });
source.addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); sourceInsert('  '); } });
visual.addEventListener('input', () => { if (state.protectedVisual) return; state.visualDirty = true; syncVisual(); changed(); });
visual.addEventListener('keyup', rememberSelection); visual.addEventListener('mouseup', rememberSelection); visual.addEventListener('focusout', rememberSelection);
visual.addEventListener('paste', event => { event.preventDefault(); if (state.protectedVisual) { toast('这篇文章的脚注已保护，请切换 Markdown 修改。'); return; } document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || ''); state.visualDirty = true; syncVisual(); changed(); });
visual.addEventListener('drop', event => { event.preventDefault(); if (state.protectedVisual) { toast('这篇文章的脚注已保护，请切换 Markdown 修改。'); return; } document.execCommand('insertText', false, event.dataTransfer?.getData('text/plain') || ''); state.visualDirty = true; syncVisual(); changed(); });
visual.addEventListener('click', event => {
  if (event.target.closest('a')) event.preventDefault();
  if (event.target.closest('[data-tex], .katex, [data-mermaid-source], [data-mermaid]')) toast('公式和图表已保护，切换到 Markdown 可以修改原始内容。');
});
mount.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
mount.querySelectorAll('button[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
mount.querySelectorAll('[data-format]').forEach(button => { button.addEventListener('mousedown', event => event.preventDefault()); button.addEventListener('click', () => format(button.dataset.format)); });
mount.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
  const actions = { new: newDraft, drafts: showDrafts, import: () => $('desk-import').click(), export: exportFile, publish };
  actions[button.dataset.action]?.();
}));
$('desk-import').addEventListener('change', event => importFile(event.target.files?.[0]));
$('desk-copy-markdown').addEventListener('click', copyMarkdown);
$('desk-github-link').addEventListener('click', event => { if (event.currentTarget.getAttribute('aria-disabled') === 'true') event.preventDefault(); });
mount.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog($(button.dataset.close))));
mount.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog); } }));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); flush(); if (state.saved) toast('草稿已保存在此浏览器。'); }
  if (event.key === 'Escape') mount.querySelectorAll('dialog[open]').forEach(closeDialog);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('beforeunload', event => { flush(); if (!state.saved) { event.preventDefault(); event.returnValue = ''; } });

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved?.version === 1 && Array.isArray(saved.drafts)) {
    state.drafts = saved.drafts.filter(item => item && typeof item === 'object').map(normalizeDraft);
    state.activeId = state.drafts.some(item => item.id === saved.activeId) ? saved.activeId : state.drafts[0]?.id || '';
  }
} catch { toast('没有读取到浏览器里的旧草稿。可以导入之前导出的 Markdown 继续写作。', true); }
if (!state.drafts.length) { const first = normalizeDraft(); state.drafts.push(first); state.activeId = first.id; }
loadDraft(state.activeId);
loadPublished();
