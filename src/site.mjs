import './styles.css';
import 'katex/dist/katex.min.css';
import {enhanceContent} from './rich-content.mjs';
const config=JSON.parse(document.querySelector('#site-config').textContent);
const dialog=document.querySelector('#search-dialog');
const input=dialog.querySelector('input');
const results=dialog.querySelector('.search-results');
let searchIndex;
let focusBeforeSearch;
async function search(){
  try{
    searchIndex??=await fetch(config.basePath+'data/search.json').then(r=>{if(!r.ok)throw new Error('search');return r.json();});
    const term=input.value.toLocaleLowerCase().trim();
    const matches=searchIndex.filter(p=>!term||[p.title,p.description,p.category,...p.tags].join(' ').toLocaleLowerCase().includes(term));
    results.replaceChildren();
    for(const post of matches){
      const link=document.createElement('a');link.className='search-result';link.href=post.url;
      const small=document.createElement('small');small.textContent=post.category+' / '+post.date;
      const title=document.createElement('strong');title.textContent=post.title;
      const description=document.createElement('span');description.textContent=post.description;
      link.append(small,title,description);results.append(link);
    }
    if(!matches.length){const empty=document.createElement('p');empty.className='search-empty';empty.textContent='没有找到这段记录，换一个关键词试试。';results.append(empty);}
  }catch{results.textContent='搜索索引加载失败，请刷新页面重试。';}
}
function openSearch(){focusBeforeSearch=document.activeElement;dialog.showModal();input.focus();search();}
document.querySelectorAll('.search-trigger').forEach(button=>button.addEventListener('click',openSearch));
dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>focusBeforeSearch?.focus());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
input.addEventListener('input',search);
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!dialog.open)openSearch();}
  if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.target.closest('input,textarea,[contenteditable="true"]')){event.preventDefault();if(!dialog.open)openSearch();}
});
for(const chip of document.querySelectorAll('.filter-chip'))chip.addEventListener('click',()=>{
  document.querySelectorAll('.filter-chip').forEach(button=>{button.classList.toggle('active',button===chip);button.setAttribute('aria-pressed',String(button===chip));});
  let count=0;
  document.querySelectorAll('.post-card').forEach(card=>{const visible=chip.dataset.filter==='all'||card.dataset.category===chip.dataset.filter;card.hidden=!visible;if(visible)count++;});
  document.querySelector('.no-results').hidden=count>0;
});
const tocLinks=[...document.querySelectorAll('.toc-links a')];
if(tocLinks.length){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)tocLinks.forEach(link=>link.classList.toggle('active',decodeURIComponent(link.hash.slice(1))===entry.target.id));},{rootMargin:'-15% 0px -70% 0px'});for(const heading of document.querySelectorAll('.prose h2,.prose h3'))observer.observe(heading);}
enhanceContent(document.querySelector('.page-content')||document);
