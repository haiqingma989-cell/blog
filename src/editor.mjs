import TurndownService from 'turndown';
import { renderMarkdown } from './lib/markdown.mjs';
import { enhanceContent } from './rich-content.mjs';
import './editor.css';

const mount = document.getElementById('editor-app');
if (!mount) throw new Error('Editor container not found.');

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

document.documentElement.lang = 'en';
document.body.classList.add('is-writing');
mount.innerHTML = `
  <div class="writing-app">
    <header class="desk-header">
      <div class="desk-identity"><a class="desk-back" id="desk-back" aria-label="Back to blog">← <span>Back to blog</span></a><span class="desk-divider"></span><div><span class="desk-eyebrow">WRITING DESK</span><h1>Editor<span class="desk-title-dot">.</span></h1></div></div>
      <div class="desk-header-actions"><span class="desk-save-status" id="desk-save-status" role="status" aria-live="polite" data-state="saved">Drafts saved in this browser</span><button class="desk-button desk-publish" type="button" data-action="publish"><span aria-hidden="true">↗</span> Publish</button></div>
    </header>
    <nav class="desk-actions" aria-label="Post actions">
      <div class="desk-action-group"><button class="desk-button" type="button" data-action="drafts">▤ <span>Drafts</span><span class="desk-count" id="desk-draft-count">1</span></button><button class="desk-button" type="button" data-action="new">＋ New</button><span class="desk-action-separator"></span><button class="desk-button" type="button" data-action="import">Import</button><button class="desk-button" type="button" data-action="export">Export .md</button></div>
      <div class="desk-mode-switch" role="group" aria-label="Editing mode"><button type="button" data-mode="source" aria-pressed="true">Markdown</button><button type="button" data-mode="visual" aria-pressed="false">Visual</button></div>
      <input id="desk-import" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden>
    </nav>
    <div class="desk-mobile-tabs" role="group" aria-label="Workspace view"><button type="button" data-view="write" aria-pressed="true">Write</button><button type="button" data-view="preview" aria-pressed="false">Preview</button></div>
    <div class="desk-workspace" data-view="write">
      <section class="desk-editor-pane" aria-label="Post editor">
        <div class="desk-pane-label"><span><i class="desk-indicator"></i> Write</span><span class="desk-local-label">LOCAL DRAFT</span></div>
        <div class="desk-metadata">
          <label class="desk-sr-only" for="desk-title">Post title</label><input id="desk-title" class="desk-title-input" type="text" maxlength="240" placeholder="Give this note a title…" autocomplete="off">
          <details class="desk-article-settings"><summary>Post settings <span>Metadata</span></summary><div class="desk-meta-grid">
            <label class="desk-field desk-slug-field">Slug <input id="desk-slug" type="text" maxlength="100" placeholder="a-small-observation" autocomplete="off" spellcheck="false"><span class="desk-field-help">Letters, numbers, or hyphens</span></label>
            <label class="desk-field">Date <input id="desk-date" type="date"></label>
            <label class="desk-field desk-tags-field">Tags <input id="desk-tags" type="text" placeholder="Life, Technology, Ideas" autocomplete="off"><span class="desk-field-help">Separate with commas</span></label>
            <label class="desk-field desk-category-field">Category <input id="desk-category" type="text" placeholder="Notes" autocomplete="off"></label>
            <label class="desk-field desk-cover-field">Cover <input id="desk-cover" type="text" placeholder="/blog/images/cover.jpg or an image URL" autocomplete="off"><span class="desk-field-help">Optional. Original URLs are preserved.</span></label>
            <label class="desk-field desk-description-field">Description <textarea id="desk-description" rows="2" placeholder="A short introduction for your readers."></textarea></label>
            <div class="desk-meta-switches"><label><input id="desk-featured" type="checkbox"> Featured</label><label><input id="desk-unpublished" type="checkbox"> Unpublished draft</label><span>Unpublished drafts stay off the blog.</span></div>
          </div></details>
        </div>
        <div class="desk-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" data-format="bold" title="Bold" aria-label="Bold"><b>B</b></button><button type="button" data-format="italic" title="Italic" aria-label="Italic"><i>I</i></button><button type="button" data-format="heading" title="Heading 2" aria-label="Heading 2">H₂</button><button type="button" data-format="link" title="Link" aria-label="Insert link">↗</button><span class="desk-toolbar-rule"></span><button type="button" data-format="code" title="Code block" aria-label="Insert code block">&lt;/&gt;</button><button type="button" data-format="table" title="Table" aria-label="Insert table">▦</button><span class="desk-toolbar-rule"></span><button type="button" data-format="inline-math" title="Inline math" aria-label="Insert inline math">ƒx</button><button type="button" data-format="block-math" title="Display math" aria-label="Insert display math">∑</button><button type="button" data-format="diagram" title="Mermaid diagram" aria-label="Insert Mermaid diagram">◇</button><span class="desk-toolbar-hint"></span>
        </div>
        <p id="desk-visual-notice" class="desk-visual-notice" role="status" hidden>This post has footnotes. Edit in Markdown to keep every reference intact.</p>
        <label class="desk-sr-only" for="desk-source">Markdown content</label><textarea id="desk-source" class="desk-source" spellcheck="false" placeholder="Start with a thought.\n\nMarkdown, code, LaTeX, and Mermaid are welcome." aria-describedby="desk-edit-help"></textarea>
        <div id="desk-visual" class="desk-visual prose" contenteditable="true" role="textbox" aria-label="Visual content editor" aria-multiline="true" spellcheck="false" data-placeholder="Start writing…" hidden></div>
        <footer class="desk-editor-footer"><span id="desk-edit-help">Markdown · Math · Diagrams</span><span id="desk-word-count">0 words · 1 min read</span></footer>
      </section>
      <section class="desk-preview-pane" aria-label="Live post preview">
        <div class="desk-pane-label"><span><i class="desk-indicator desk-preview-indicator"></i> Preview</span><span>LIVE PREVIEW</span></div>
        <div class="desk-preview-scroll"><article class="desk-preview-article"><header class="desk-preview-header"><div class="desk-preview-date" id="desk-preview-date"></div><h2 id="desk-preview-title">Untitled note</h2><p id="desk-preview-description" hidden></p><div class="desk-preview-tags" id="desk-preview-tags"></div></header><div id="desk-preview" class="prose desk-preview-content"></div></article><div class="desk-preview-end"><span></span><i>End of note</i><span></span></div></div>
      </section>
    </div>
    <dialog class="desk-dialog desk-drafts-dialog" id="desk-drafts-dialog" aria-labelledby="desk-drafts-heading"><div class="desk-dialog-heading"><div><span class="desk-eyebrow">WORDS IN PROGRESS</span><h2 id="desk-drafts-heading">Your drafts</h2></div><button class="desk-icon-button" type="button" data-close="desk-drafts-dialog" aria-label="Close drafts">×</button></div><p class="desk-dialog-note">Saved in this browser. Export a backup before switching devices.</p><div class="desk-draft-list" id="desk-draft-list"></div><button class="desk-button desk-button-solid" type="button" data-action="new">＋ New draft</button></dialog>
    <dialog class="desk-dialog desk-publish-dialog" id="desk-publish-dialog" aria-labelledby="desk-publish-heading"><div class="desk-dialog-heading"><div><span class="desk-eyebrow">LET YOUR WORDS TRAVEL</span><h2 id="desk-publish-heading">Publish your note</h2></div><button class="desk-icon-button" type="button" data-close="desk-publish-dialog" aria-label="Close publishing instructions">×</button></div><p class="desk-publish-intro">Confirm your submission on GitHub. No access token is needed or stored.</p><div class="desk-publish-file"><span>File</span><strong id="desk-publish-filename"></strong></div><ol class="desk-publish-steps"><li><strong>Copy your post</strong><p>Includes the full post and its metadata.</p><button class="desk-button desk-button-solid" type="button" id="desk-copy-markdown">1. Copy Markdown</button></li><li><strong id="desk-github-step-title">Create the file on GitHub</strong><p>Sign in with repository write access. Paste the Markdown, review it, then choose <b>Commit changes</b>.</p><a class="desk-button desk-github-link" id="desk-github-link" target="_blank" rel="noopener noreferrer">2. Open GitHub ↗</a></li><li><strong id="desk-publish-deploy-title">Automatic deployment</strong><p id="desk-publish-deploy-note">After you commit, GitHub Actions builds and deploys the blog. Check Actions for progress.</p></li></ol><p class="desk-publish-config" id="desk-publish-config" hidden></p><p class="desk-publish-footnote">Nothing is published until you confirm the commit on GitHub.</p></dialog>
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
function formatDate(value) {
  const date = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}
function makeId() { return globalThis.crypto?.randomUUID?.() || 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
function slugify(text) { return String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 100); }
function draft() { return state.drafts.find(item => item.id === state.activeId); }
function normalizeDraft(value = {}) {
  const id = typeof value.id === 'string' ? value.id : makeId();
  const metadataMissing = Array.isArray(value.metadataMissing) ? value.metadataMissing.filter(key => preservedMetadata.includes(key)) : value.sourceSlug ? preservedMetadata.filter(key => !Object.prototype.hasOwnProperty.call(value, key)) : [];
  return { id, title: String(value.title || ''), slug: String(value.slug || ''), date: /^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(value.date) ? value.date.slice(0, 10) : dateToday(), tags: Array.isArray(value.tags) ? value.tags.map(String) : [], category: String(value.category || 'Notes'), cover: String(value.cover || ''), featured: value.featured === true || value.featured === 'true', draft: value.draft === true || value.draft === 'true', description: String(value.description || ''), content: String(value.content || ''), updatedAt: Number(value.updatedAt) || Date.now(), sourceSlug: String(value.sourceSlug || ''), autoSlug: value.autoSlug !== false, metadataMissing };
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
    status('Saved in this browser');
    $('desk-draft-count').textContent = String(state.drafts.length);
    return true;
  } catch (error) {
    state.saved = false;
    status('Save failed · Export a backup', 'error');
    if (lastStorageError !== error.name) toast('This browser could not save your draft. Export a Markdown backup.', true);
    lastStorageError = error.name;
    return false;
  }
}
function changed() {
  draft().updatedAt = Date.now(); state.dirty = true;
  status('Saving…', 'pending');
  clearTimeout(saveTimer); saveTimer = setTimeout(persist, 500);
  schedulePreview();
}
function readFields() {
  const current = draft();
  current.title = fields.title.value;
  current.slug = fields.slug.value.trim();
  current.date = fields.date.value || dateToday();
  current.tags = fields.tags.value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
  current.category = fields.category.value.trim() || 'Notes';
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
  setView('write'); fields.title.focus(); toast('New draft created. Your previous draft is kept.');
}

function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 260); }
async function renderPreview() {
  clearTimeout(previewTimer);
  const sequence = ++renderSequence;
  const current = draft();
  $('desk-preview-title').textContent = current.title || 'Untitled note';
  $('desk-preview-date').textContent = formatDate(current.date || dateToday());
  $('desk-preview-description').textContent = current.description;
  $('desk-preview-description').hidden = !current.description;
  $('desk-preview-tags').replaceChildren(...current.tags.map(tag => { const node = document.createElement('span'); node.textContent = tag; return node; }));
  document.title = (current.title || 'Untitled note') + ' · Editor';
  try {
    const rendered = renderMarkdown(current.content);
    $('desk-word-count').textContent = `${rendered.wordCount || 0} words · ${Math.max(1, rendered.readingMinutes || 1)} min read`;
    if (!current.content.trim()) {
      preview.replaceChildren();
      const empty = document.createElement('div'); empty.className = 'desk-preview-empty';
      const mark = document.createElement('span'); mark.className = 'desk-empty-mark'; mark.textContent = '✳';
      const title = document.createElement('p'); title.textContent = 'A note starts with one line.';
      const hint = document.createElement('small'); hint.textContent = 'Start writing to see your preview here.';
      empty.append(mark, title, hint); preview.append(empty); return;
    }
    preview.innerHTML = rendered.html;
    await enhanceContent(preview);
    if (sequence !== renderSequence) return;
  } catch { if (sequence === renderSequence) toast('Preview failed. Your content is safe; check math or diagram syntax.', true); }
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
    if (state.protectedVisual) $('desk-edit-help').textContent = 'Footnotes protected · Edit in Markdown';
    else visual.querySelectorAll('input[type="checkbox"]').forEach(input => { input.disabled = false; });
    protectRichNodes(visual);
    await enhanceContent(visual);
    protectRichNodes(visual);
  } catch { toast('Visual preview failed. You can continue in Markdown.', true); }
}
function setMode(mode) {
  if (mode === state.mode) return;
  syncVisual();
  state.mode = mode;
  source.value = draft().content;
  source.hidden = mode !== 'source'; visual.hidden = mode !== 'visual';
  if (mode === 'source') { $('desk-visual-notice').hidden = true; mount.querySelectorAll('[data-format]').forEach(button => { button.disabled = false; }); }
  mount.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  $('desk-edit-help').textContent = mode === 'visual' ? 'Edit math and diagrams in Markdown' : 'Markdown · Math · Diagrams';
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
  if (state.protectedVisual) { toast('Footnotes are protected. Switch to Markdown to edit.'); return; }
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
  catch { toast('Diagram preview failed. Check its source in Markdown.', true); }
}
function format(kind) {
  if (state.mode === 'visual' && state.protectedVisual) { toast('Footnotes are protected. Switch to Markdown to edit.'); return; }
  const snippets = {
    code: ['\n\n```javascript\n', 'const hello = "Hello, world";', '\n```\n'],
    table: ['\n\n', '| Item | Notes |\n| --- | --- |\n| An idea | Start here |\n', ''],
    'inline-math': ['$', 'E = mc^2', '$'],
    'block-math': ['\n\n$$\n', '\\int_0^1 x^2\\,dx = \\frac{1}{3}', '\n$$\n'],
    diagram: ['\n\n```mermaid\n', 'flowchart LR\n  A[An idea] --> B[Write it down]\n  B --> C[Share it]', '\n```\n']
  };
  if (state.mode === 'source') {
    if (kind === 'bold') sourceInsert('**', 'bold text', '**');
    else if (kind === 'italic') sourceInsert('*', 'italic text', '*');
    else if (kind === 'heading') sourceInsert('\n## ', 'A heading', '\n');
    else if (kind === 'link') sourceInsert('[', 'link text', '](https://example.com)');
    else if (snippets[kind]) sourceInsert(...snippets[kind]);
    return;
  }
  restoreSelection();
  if (kind === 'bold' || kind === 'italic') document.execCommand(kind, false);
  else if (kind === 'heading') document.execCommand('formatBlock', false, 'h2');
  else if (kind === 'link') {
    const url = window.prompt('Enter a URL, email link, or site path', 'https://');
    if (url === null) return;
    if (!/^(https?:\/\/|mailto:|tel:|#|\/|\.\.?\/)/i.test(url.trim()) || /^\/\//.test(url.trim())) { toast('Enter a valid URL, email link, or site path.', true); return; }
    if (!window.getSelection()?.toString()) visualInsert('[link text](' + url.trim().replace(/\)/g, '%29') + ')', true);
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
  } else if (normalized.startsWith('---\n')) toast('Incomplete frontmatter was kept as content.', true);
  const title = String(data.title || filename.replace(/\.(md|markdown|txt)$/i, ''));
  return normalizeDraft({ ...data, title, slug: data.slug || slugify(title), content, autoSlug: !data.slug });
}
function markdownDocument(current = draft()) {
  const title = current.title.trim() || 'Untitled note';
  const slug = current.slug.trim() || slugify(title) || 'note-' + dateToday();
  return ['---', 'title: ' + JSON.stringify(title), 'slug: ' + JSON.stringify(slug), 'date: ' + JSON.stringify(current.date || dateToday()), 'category: ' + JSON.stringify(current.category || 'Notes'), 'tags: [' + current.tags.map(tag => JSON.stringify(tag)).join(', ') + ']', 'description: ' + JSON.stringify(current.description || ''), 'featured: ' + String(current.featured === true), 'cover: ' + JSON.stringify(current.cover || ''), 'draft: ' + String(current.draft === true), '---', '', current.content.replace(/\s+$/, ''), ''].join('\n');
}
async function importFile(file) {
  if (!file) return;
  if (!/\.(md|markdown|txt)$/i.test(file.name)) { toast('Choose a .md, .markdown, or .txt file.', true); return; }
  if (file.size > 5 * 1024 * 1024) { toast('Files must be under 5 MB.', true); return; }
  try {
    const text = await file.text(); flush();
    const imported = parseDocument(text, file.name); state.drafts.push(imported); loadDraft(imported.id);
    setView('write'); toast('Imported as a new draft. Your other drafts are kept.');
  } catch { toast('Could not read this file. Your drafts are unchanged.', true); }
  finally { $('desk-import').value = ''; }
}
function exportFile() {
  flush();
  try {
    const blob = new Blob([markdownDocument()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = (slugify(draft().slug) || slugify(draft().title) || 'untitled-note') + '.md';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Markdown exported.');
  } catch { toast('Export failed. Retry or copy Markdown from the Publish dialog.', true); }
}

function openDialog(dialog) { if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog'); } }
function closeDialog(dialog) { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
function showDrafts() {
  flush();
  const list = $('desk-draft-list'); list.replaceChildren();
  [...state.drafts].sort((a, b) => b.updatedAt - a.updatedAt).forEach(item => {
    const row = document.createElement('div'); row.className = 'desk-draft-row'; row.dataset.active = String(item.id === state.activeId);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'desk-draft-open';
    const title = document.createElement('strong'); title.textContent = item.title || 'Untitled note';
    const meta = document.createElement('span'); meta.textContent = `${formatDate(item.date)} · ${item.content.trim() ? item.content.replace(/[#*`$>]/g, '').slice(0, 44).replace(/\n/g, ' ') : 'No content yet'}`;
    button.append(title, meta); button.addEventListener('click', () => { loadDraft(item.id); closeDialog($('desk-drafts-dialog')); toast('Draft opened.'); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'desk-draft-delete'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', 'Delete draft: ' + (item.title || 'Untitled note'));
    remove.addEventListener('click', () => {
      if (!window.confirm('Delete "' + (item.title || 'Untitled note') + '" from this browser? This cannot be undone. Export a backup first.')) return;
      state.drafts = state.drafts.filter(current => current.id !== item.id);
      if (!state.drafts.length) state.drafts.push(normalizeDraft());
      if (state.activeId === item.id) loadDraft(state.drafts[0].id);
      persist(); showDrafts(); toast('Local draft deleted.');
    });
    row.append(button, remove); list.append(row);
  });
  openDialog($('desk-drafts-dialog'));
}
function publish() {
  flush();
  const current = draft();
  if (current.metadataMissing.length) { toast('Reconnect and reopen this post to restore missing metadata before publishing.', true); return; }
  $('desk-copy-markdown').textContent = '1. Copy Markdown';
  $('desk-publish-deploy-title').textContent = current.draft ? 'Keep this post unpublished' : 'Automatic deployment';
  $('desk-publish-deploy-note').textContent = current.draft ? 'Unpublished draft is enabled. The file will be saved in the repository but hidden from the blog. Turn this off and commit again to publish.' : 'After you commit, GitHub Actions builds and deploys the blog. Check Actions for progress.';
  if (!current.title.trim() || !current.content.trim()) { toast('Add a title and some content before publishing.', true); setView('write'); (!current.title.trim() ? fields.title : state.mode === 'source' ? source : visual).focus(); return; }
  if (!slugPattern.test(current.slug)) { toast('Use 1–100 letters, numbers, or hyphens for the slug. Start with a letter or number.', true); setView('write'); fields.slug.focus(); return; }
  const github = config.github || {}, owner = String(github.owner || ''), repo = String(github.repo || ''), branch = String(github.branch || 'main');
  const configured = /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(repo) && owner !== '..' && repo !== '..' && branch.length > 0;
  const link = $('desk-github-link'), warning = $('desk-publish-config');
  $('desk-publish-filename').textContent = 'content/posts/' + current.slug + '.md';
  const update = current.sourceSlug === current.slug;
  $('desk-github-step-title').textContent = update ? 'Update the file on GitHub' : 'Create the file on GitHub';
  if (configured) {
    const repoPath = 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
    const branchPath = encodeURIComponent(branch);
    link.href = update ? `${repoPath}/edit/${branchPath}/content/posts/${encodeURIComponent(current.slug)}.md` : `${repoPath}/new/${branchPath}/content/posts?filename=${encodeURIComponent(current.slug + '.md')}`;
    link.removeAttribute('aria-disabled'); warning.hidden = true;
  } else {
    link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); warning.hidden = false;
    warning.textContent = 'Configure github.owner, github.repo, and github.branch before publishing. You can still copy or export your post.';
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
    $('desk-copy-markdown').textContent = '✓ Markdown copied';
    toast('Copied. Paste it on GitHub, review, and commit.');
  } catch { toast('Clipboard access failed. Export a .md file and copy its contents instead.', true); }
}

async function loadPublished() {
  const slug = new URLSearchParams(location.search).get('post');
  if (!slug) return;
  if (!slugPattern.test(slug)) { toast('Invalid post slug. Your local draft is restored.', true); return; }
  const existing = state.drafts.find(item => item.sourceSlug === slug);
  if (existing) {
    flush(); loadDraft(existing.id);
    if (!existing.metadataMissing.length) { toast('Local draft restored. Your edits are kept.'); return; }
    toast('Draft restored. Loading missing post metadata…');
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
      persist(); toast('Metadata restored. Your local edits are kept.'); return;
    }
    const imported = normalizeDraft({ ...article, sourceSlug: slug, slug: article.slug || slug, autoSlug: false });
    state.drafts.push(imported);
    if (state.activeId === activeAtRequest && draft().updatedAt === updatedAtRequest) { flush(); loadDraft(imported.id); toast('Post loaded. Submit your edits on GitHub when ready.'); }
    else { persist(); toast('Post added to Drafts. Your current work is unchanged.'); }
  } catch { toast('Could not load this post. Check the link or connection. Local drafts are unchanged.', true); }
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
visual.addEventListener('paste', event => { event.preventDefault(); if (state.protectedVisual) { toast('Footnotes are protected. Switch to Markdown to edit.'); return; } document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || ''); state.visualDirty = true; syncVisual(); changed(); });
visual.addEventListener('drop', event => { event.preventDefault(); if (state.protectedVisual) { toast('Footnotes are protected. Switch to Markdown to edit.'); return; } document.execCommand('insertText', false, event.dataTransfer?.getData('text/plain') || ''); state.visualDirty = true; syncVisual(); changed(); });
visual.addEventListener('click', event => {
  if (event.target.closest('a')) event.preventDefault();
  if (event.target.closest('[data-tex], .katex, [data-mermaid-source], [data-mermaid]')) toast('Switch to Markdown to edit this math or diagram.');
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
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); flush(); if (state.saved) toast('Draft saved in this browser.'); }
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
} catch { toast('Could not read saved drafts. You can import a Markdown backup.', true); }
if (!state.drafts.length) { const first = normalizeDraft(); state.drafts.push(first); state.activeId = first.id; }
loadDraft(state.activeId);
loadPublished();
