import {test,expect} from '@playwright/test';
const sample='## 一段测试记录\n\n公式 $x^2+1$，写给明天。\n\n$$\n\\frac{1}{2}+\\sqrt{3}\n$$\n\n```python\nprint("hello")\n\nprint("world")\n```\n\n```mermaid\ngraph LR\n A[想法]-->B[记录]\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n';

test('Homepage search, category filters, article math and diagrams work',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('');
  await expect(page.locator('.post-card')).toHaveCount(3);
  await page.locator('[data-filter="学习笔记"]').click();
  await expect(page.locator('.post-card:visible')).toHaveCount(1);
  await page.locator('[data-filter="all"]').click();
  await page.locator('.search-trigger').click();await page.locator('#search-query').fill('LaTeX');
  await expect(page.locator('.search-result')).toHaveCount(1);await page.locator('.search-result').click();
  await expect(page.locator('.article-title')).toContainText('公式');
  await expect(page.locator('.prose .katex').first()).toBeVisible();
  await page.goto('posts/markdown-writing-guide/');
  await expect(page.locator('.mermaid-block svg')).toBeVisible();
  await expect(page.locator('.toc-links a').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Writing, visual round trip, autosave, import/export and GitHub handoff preserve content',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('editor/');
  await page.locator('#desk-title').fill('我的公式草稿');await page.locator('#desk-slug').fill('formula-draft');
  await page.locator('#desk-source').fill(sample);
  await expect(page.locator('#desk-preview .katex').first()).toBeVisible();
  await expect(page.locator('#desk-preview .mermaid-block svg')).toBeVisible();
  await page.locator('[data-mode="visual"]').click();await expect(page.locator('#desk-visual')).toBeVisible();
  await page.locator('[data-mode="source"]').click();
  const roundTrip=await page.locator('#desk-source').inputValue();
  expect(roundTrip).toContain('$x^2+1$');expect(roundTrip).toContain('```python');expect(roundTrip).toContain('```mermaid');expect(roundTrip).toContain('print("hello")\n\nprint("world")');expect(roundTrip).toContain('| A | B |');
  await expect(page.locator('#desk-save-status')).not.toContainText('未保存');
  await page.waitForTimeout(700);await page.reload();await expect(page.locator('#desk-title')).toHaveValue('我的公式草稿');
  await expect(page.locator('#desk-source')).toHaveValue(roundTrip);
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('formula-draft.md');
  await page.locator('[data-action="publish"]').click();await expect(page.locator('#desk-publish-dialog')).toBeVisible();
  expect(await page.locator('#desk-github-link').getAttribute('href')).toBe('https://github.com/haiqingma989-cell/blog/new/main/content/posts?filename=formula-draft.md');
  await page.keyboard.press('Escape');
  const imported='---\ntitle: "导入笔记"\nslug: "imported-note"\ndate: "2026-11-05"\ntags: ["测试"]\n---\n\n## 来自文件\n\n$x+2$';
  await page.locator('#desk-import').setInputFiles({name:'imported.md',mimeType:'text/markdown',buffer:Buffer.from(imported)});
  await expect(page.locator('#desk-title')).toHaveValue('导入笔记');await expect(page.locator('#desk-source')).toHaveValue(/来自文件/);
  expect(errors).toEqual([]);
});

test('Published article can be loaded for editing without overwriting the academic homepage',async({page})=>{
  await page.goto('editor/?post=first-page');
  await expect(page.locator('#desk-title')).toHaveValue(/从这一页/);
  await expect(page.locator('#desk-category')).toHaveValue('日常随记');
  await expect(page.locator('#desk-cover')).toHaveValue('journal');
  await expect(page.locator('#desk-featured')).toBeChecked();
  await expect(page.locator('#desk-unpublished')).not.toBeChecked();
  await page.locator('[data-action="publish"]').click();
  await expect(page.locator('#desk-github-link')).toHaveAttribute('href','https://github.com/haiqingma989-cell/blog/edit/main/content/posts/first-page.md');
});

test('Phone layouts fit and writing preview switches are usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/home-mobile.png',fullPage:true});
  await page.goto('editor/');await page.locator('#desk-source').fill('## 手机上的记录\n\n$x+1$');
  await page.locator('button[data-view="preview"]').click();
  await expect(page.locator('#desk-preview .katex')).toBeVisible();
  await page.locator('button[data-view="write"]').click();
  await expect(page.locator('#desk-source')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/editor-mobile.png',fullPage:true});
});

test('Capture final desktop pages',async({page})=>{
  await page.goto('');await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
  await page.goto('posts/first-math-note/');await page.screenshot({path:'test-results/article-desktop.png',fullPage:true});
  await page.goto('editor/');await page.locator('#desk-title').fill('今天，也记下一点新的东西');await page.locator('#desk-source').fill(sample);await expect(page.locator('#desk-preview .mermaid-block svg')).toBeVisible();
  await page.screenshot({path:'test-results/editor-desktop.png',fullPage:true});
});
