let mermaidModule;
let serial = 0;
export async function enhanceContent(root = document) {
  for (const pre of root.querySelectorAll('pre:has(>code)')) {
    if (pre.querySelector('.copy-code')) continue;
    const button = document.createElement('button');button.className='copy-code';button.type='button';button.textContent='复制';
    button.setAttribute('aria-label','复制这段代码');
    button.addEventListener('click',async()=>{try {await navigator.clipboard.writeText(pre.querySelector('code').textContent);button.textContent='已复制';setTimeout(()=>button.textContent='复制',1500);}catch {button.textContent='请选中复制';}});
    pre.append(button);
  }
  const diagrams = [...root.querySelectorAll('.mermaid-block')].filter(node => !node.dataset.rendered && !node.dataset.rendering);
  if (!diagrams.length) return;
  try {
    mermaidModule ??= import('mermaid').then(module=>{
      module.default.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',themeVariables:{primaryColor:'#e8eddf',primaryTextColor:'#252823',primaryBorderColor:'#899576',lineColor:'#7d8b70',fontFamily:'system-ui, sans-serif'},suppressErrorRendering:true});return module.default;
    });
    const mermaid=await mermaidModule;
    for (const diagram of diagrams) {
      if (!diagram.isConnected) continue;
      diagram.dataset.rendering='true';
      try {
        const source=diagram.dataset.mermaidSource;
        const {svg,bindFunctions}=await mermaid.render(`diagram-${++serial}`,source);
        if (!diagram.isConnected) continue;
        diagram.innerHTML=svg;bindFunctions?.(diagram);diagram.dataset.rendered='true';
      } catch { const hint=document.createElement('small');hint.className='diagram-error';hint.textContent='图表语法暂时无法解析，请检查 Mermaid 代码。';diagram.append(hint);diagram.dataset.rendered='error'; }
      delete diagram.dataset.rendering;
    }
  } catch {for (const node of diagrams) {node.dataset.rendered='error';const hint=document.createElement('small');hint.textContent='图表组件加载失败，代码已保留。';node.append(hint);}}
}
