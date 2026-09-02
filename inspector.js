(()=>{
  const OWNER='jyhome1228-cyber';
  const API='https://api.github.com';
  const scanCache=new Map();
  const textExtensions=new Set(['html','htm','css','scss','sass','less','js','mjs','cjs','jsx','ts','tsx','json','md','txt','xml','yml','yaml','toml','ini','env','svg','vue','svelte','astro','php']);
  const assetExtensions=new Set(['png','jpg','jpeg','gif','webp','avif','ico','pdf','mp4','mov','webm','mp3','wav','woff','woff2','ttf','otf']);
  const drawer=document.querySelector('#drawer');
  const drawerBody=document.querySelector('#drawerBody');
  const drawerTitle=document.querySelector('#drawerTitle');
  if(!drawer||!drawerBody||!drawerTitle)return;

  const esc=(v='')=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const extOf=(path='')=>{const name=path.split('/').pop()||'';const i=name.lastIndexOf('.');return i>0?name.slice(i+1).toLowerCase():''};
  const apiPath=(path='')=>path.split('/').map(encodeURIComponent).join('/');
  const fmtSize=(n)=>{const v=Number(n)||0;if(v<1024)return`${v} B`;if(v<1024*1024)return`${(v/1024).toFixed(v>10240?0:1)} KB`;return`${(v/1024/1024).toFixed(1)} MB`};

  async function gh(path){
    const r=await fetch(`${API}${path}`,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if(!r.ok)throw new Error(`GitHub API ${r.status}`);
    return r.json();
  }

  function decodeContent(data){
    if(!data?.content)return'';
    try{
      const binary=atob(data.content.replace(/\n/g,''));
      const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      return new TextDecoder('utf-8',{fatal:false}).decode(bytes);
    }catch{return''}
  }

  function currentRepo(){return drawerTitle.textContent.trim().toLowerCase()}

  function findSection(label){
    return [...drawerBody.querySelectorAll(':scope > .drawer-section')].find(section=>section.querySelector('h3')?.textContent.trim().toUpperCase()===label);
  }

  function makePane(id){
    const pane=document.createElement('section');
    pane.className='inspector-pane';
    pane.dataset.inspectorPane=id;
    return pane;
  }

  function setTab(name){
    drawerBody.querySelectorAll('.inspector-tab').forEach(b=>b.classList.toggle('active',b.dataset.inspectorTab===name));
    drawerBody.querySelectorAll('.inspector-pane').forEach(p=>p.classList.toggle('active',p.dataset.inspectorPane===name));
  }

  function enhance(){
    if(drawerBody.dataset.deepInspector==='ready')return;
    const details=drawerBody.querySelector(':scope > .detail-grid');
    if(!details)return;
    drawerBody.dataset.deepInspector='ready';

    const site=findSection('SITE / PREVIEW');
    const summary=findSection('PROJECT SUMMARY');
    const notes=findSection('WORK LOG');
    const commits=findSection('LATEST COMMITS');

    const tabs=document.createElement('nav');
    tabs.className='inspector-tabs';
    tabs.setAttribute('aria-label','Project inspector');
    const labels=[['overview','OVERVIEW'],['structure','STRUCTURE'],['files','FILES'],['health','HEALTH'],['notes','NOTES']];
    labels.forEach(([id,label])=>{
      const b=document.createElement('button');
      b.type='button';b.className='inspector-tab';b.dataset.inspectorTab=id;b.textContent=label;
      b.addEventListener('click',()=>setTab(id));
      tabs.appendChild(b);
    });

    const overview=makePane('overview');
    const structure=makePane('structure');
    const files=makePane('files');
    const health=makePane('health');
    const notesPane=makePane('notes');
    overview.classList.add('active');

    details.remove();overview.appendChild(details);
    [site,summary,commits].filter(Boolean).forEach(el=>{el.remove();overview.appendChild(el)});
    if(notes){notes.remove();notesPane.appendChild(notes)}
    else notesPane.innerHTML='<div class="deep-loader"><span>NO NOTES MODULE</span></div>';

    structure.innerHTML=loader('ANALYZING PROJECT STRUCTURE');
    files.innerHTML=loader('INDEXING REPOSITORY FILES');
    health.innerHTML=loader('RUNNING PROJECT HEALTH CHECK');

    drawerBody.prepend(tabs);
    drawerBody.append(overview,structure,files,health,notesPane);
    tabs.querySelector('[data-inspector-tab="overview"]').classList.add('active');

    const repo=currentRepo();
    if(repo)scanProject(repo).then(data=>renderScan(data)).catch(err=>renderScanError(err));
  }

  function loader(text){return `<div class="deep-loader"><span>${esc(text)}</span></div>`}

  async function fetchText(repo,path){
    if(!path)return'';
    const data=await gh(`/repos/${OWNER}/${encodeURIComponent(repo)}/contents/${apiPath(path)}`);
    return decodeContent(data);
  }

  async function scanProject(repo){
    if(scanCache.has(repo))return scanCache.get(repo);
    const promise=(async()=>{
      const meta=await gh(`/repos/${OWNER}/${encodeURIComponent(repo)}`);
      const branch=meta.default_branch||'main';
      const treeData=await gh(`/repos/${OWNER}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      const tree=Array.isArray(treeData.tree)?treeData.tree:[];
      const blobs=tree.filter(x=>x.type==='blob');
      const paths=new Set(blobs.map(x=>x.path.toLowerCase()));
      const packageEntry=blobs.find(x=>x.path.toLowerCase()==='package.json');
      const indexEntry=blobs.find(x=>x.path.toLowerCase()==='index.html')||blobs.find(x=>x.path.toLowerCase().endsWith('/index.html'));
      const packageText=packageEntry?await fetchText(repo,packageEntry.path).catch(()=>''):'';
      const indexText=indexEntry?await fetchText(repo,indexEntry.path).catch(()=>''):'';
      let packageJson=null;
      try{packageJson=packageText?JSON.parse(packageText):null}catch{}
      const result={repo,meta,branch,tree,blobs,paths,packageJson,indexText,indexPath:indexEntry?.path||'',stack:detectStack(blobs,packageJson),stats:analyzeStats(tree,blobs)};
      result.health=healthChecks(result);
      return result;
    })();
    scanCache.set(repo,promise);
    try{return await promise}catch(e){scanCache.delete(repo);throw e}
  }

  function analyzeStats(tree,blobs){
    const ext=new Map();let assets=0;let code=0;
    blobs.forEach(file=>{const e=extOf(file.path)||'NO EXT';ext.set(e,(ext.get(e)||0)+1);if(assetExtensions.has(e))assets++;else code++});
    const folders=tree.filter(x=>x.type==='tree').length;
    return{total:blobs.length,code,assets,folders,extensions:[...ext.entries()].sort((a,b)=>b[1]-a[1])};
  }

  function detectStack(blobs,pkg){
    const stack=[];
    const add=(x)=>{if(x&&!stack.includes(x))stack.push(x)};
    const deps={...(pkg?.dependencies||{}),...(pkg?.devDependencies||{})};
    if(deps.next)add('Next.js');
    if(deps.react)add('React');
    if(deps.vue)add('Vue');
    if(deps.svelte)add('Svelte');
    if(deps.astro)add('Astro');
    if(deps.vite)add('Vite');
    if(deps.firebase)add('Firebase');
    if(deps.tailwindcss)add('Tailwind');
    if(deps.express)add('Express');
    const exts=new Set(blobs.map(x=>extOf(x.path)));
    if(exts.has('html'))add('HTML');
    if(exts.has('css')||exts.has('scss'))add(exts.has('scss')?'SCSS':'CSS');
    if(exts.has('js')||exts.has('mjs'))add('JavaScript');
    if(exts.has('ts')||exts.has('tsx'))add('TypeScript');
    if(exts.has('php'))add('PHP');
    if(!stack.length)add('Static / Assets');
    return stack.slice(0,8);
  }

  function healthChecks(data){
    const {paths,meta,indexText}=data;
    const has=(p)=>paths.has(p.toLowerCase());
    const any=(fn)=>[...paths].some(fn);
    const checks=[
      ['ENTRY FILE',has('index.html')||any(p=>p.endsWith('/index.html')),'index.html detected'],
      ['README',any(p=>/^readme(\.|$)/i.test(p.split('/').pop()||'')),'project documentation'],
      ['CUSTOM DOMAIN',has('cname')||!!meta.homepage,'CNAME or repository homepage'],
      ['FAVICON',any(p=>/(^|\/)(favicon\.(ico|png|svg)|apple-touch-icon)/i.test(p)),'browser icon asset'],
      ['ROBOTS.TXT',has('robots.txt')||has('public/robots.txt'),'crawler policy'],
      ['SITEMAP.XML',has('sitemap.xml')||has('public/sitemap.xml'),'search index map'],
      ['VIEWPORT META',/name=["']viewport["']/i.test(indexText),'responsive viewport'],
      ['OPEN GRAPH',/property=["']og:/i.test(indexText),'social preview metadata'],
      ['WORKFLOW',any(p=>p.startsWith('.github/workflows/')),'GitHub Actions workflow'],
      ['PACKAGE MANIFEST',has('package.json'),'dependency manifest']
    ];
    return checks.map(([name,ok,detail])=>({name,ok,detail}));
  }

  function structureText(tree){
    const entries=tree.filter(x=>x.path.split('/').length<=3).slice(0,90);
    if(!entries.length)return'No file tree returned.';
    return entries.map(item=>{
      const depth=item.path.split('/').length-1;
      const name=item.path.split('/').pop();
      return `${'  '.repeat(depth)}${item.type==='tree'?'├─':'└─'} ${name}${item.type==='tree'?'/':''}`;
    }).join('\n');
  }

  function renderScan(data){
    if(currentRepo()!==data.repo)return;
    renderStructure(data);renderFiles(data);renderHealth(data);
  }

  function renderStructure(data){
    const pane=drawerBody.querySelector('[data-inspector-pane="structure"]');if(!pane)return;
    const ext=data.stats.extensions.slice(0,9);
    pane.innerHTML=`
      <div class="inspector-scan-head"><div><h3>PROJECT STRUCTURE</h3><p>실제 GitHub tree 기준으로 코드베이스를 분석했습니다.</p></div><span class="scan-state ok">SCAN COMPLETE</span></div>
      <div class="stack-strip">${data.stack.map((x,i)=>`<span class="stack-chip ${i===0?'primary':''}">${esc(x)}</span>`).join('')}</div>
      <div class="inspector-stats">
        <div><span>TOTAL FILES</span><strong>${data.stats.total}</strong></div>
        <div><span>CODE / DOC</span><strong>${data.stats.code}</strong></div>
        <div><span>ASSETS</span><strong>${data.stats.assets}</strong></div>
        <div><span>FOLDERS</span><strong>${data.stats.folders}</strong></div>
      </div>
      <div class="architecture-box"><pre class="architecture-tree">${esc(structureText(data.tree))}</pre></div>
      <div class="file-type-grid">${ext.map(([e,c])=>`<div class="file-type"><span>.${esc(e)}</span><strong>${c}</strong></div>`).join('')}</div>`;
  }

  function renderFiles(data){
    const pane=drawerBody.querySelector('[data-inspector-pane="files"]');if(!pane)return;
    pane.innerHTML=`
      <div class="inspector-scan-head"><div><h3>FILES</h3><p>${data.stats.total}개 파일 · 클릭하면 텍스트 파일을 바로 확인합니다.</p></div><span class="scan-state ok">${esc(data.branch)}</span></div>
      <div class="files-shell">
        <div class="files-toolbar"><input class="file-filter" type="search" placeholder="파일명 / 경로 검색" /></div>
        <div class="files-grid"><div class="file-list"></div><div class="file-viewer"><div class="file-viewer-head"><strong>SELECT A FILE</strong><span>READ ONLY</span></div><pre class="file-code">// choose a file from the repository tree</pre></div></div>
      </div>`;
    const input=pane.querySelector('.file-filter');
    const list=pane.querySelector('.file-list');
    const renderList=(q='')=>{
      const x=q.trim().toLowerCase();
      const items=data.blobs.filter(f=>!x||f.path.toLowerCase().includes(x)).slice(0,180);
      list.innerHTML=items.map(file=>`<button class="file-row" type="button" data-file-path="${esc(file.path)}"><span class="file-icon">${textExtensions.has(extOf(file.path))?'<>':'◆'}</span><span class="file-path">${esc(file.path)}</span><span class="file-size">${fmtSize(file.size)}</span></button>`).join('')||'<div class="deep-loader">NO MATCHED FILE</div>';
    };
    renderList();
    input.addEventListener('input',e=>renderList(e.target.value));
    list.addEventListener('click',async e=>{
      const row=e.target.closest('[data-file-path]');if(!row)return;
      const path=row.dataset.filePath;const ext=extOf(path);
      list.querySelectorAll('.file-row').forEach(x=>x.classList.toggle('active',x===row));
      const head=pane.querySelector('.file-viewer-head strong');const code=pane.querySelector('.file-code');
      head.textContent=path;
      if(!textExtensions.has(ext)){code.textContent='// Binary / asset preview is disabled.\n// Open this file in GitHub for the original asset.';return}
      code.textContent='> loading file content...';
      try{
        const text=await fetchText(data.repo,path);
        code.textContent=text?text.slice(0,120000):'// Empty file or content unavailable.';
      }catch(err){code.textContent=`// ${err.message}`}
    });
  }

  function renderHealth(data){
    const pane=drawerBody.querySelector('[data-inspector-pane="health"]');if(!pane)return;
    const ok=data.health.filter(x=>x.ok).length,total=data.health.length;
    pane.innerHTML=`
      <div class="inspector-scan-head"><div><h3>PROJECT HEALTH</h3><p>파일 존재 여부와 실제 index.html 메타를 기준으로 체크합니다.</p></div><span class="scan-state ok">CHECK COMPLETE</span></div>
      <div class="health-summary"><div><strong>${ok} / ${total}</strong><span>CHECKS PASSED</span></div><span>${esc(data.stack.join(' / '))}</span></div>
      <div class="health-grid">${data.health.map(item=>`<div class="health-item"><div><div class="health-name">${esc(item.name)}</div><div class="health-detail">${esc(item.detail)}</div></div><span class="health-state ${item.ok?'ok':'warn'}">${item.ok?'● OK':'○ CHECK'}</span></div>`).join('')}</div>`;
  }

  function renderScanError(err){
    ['structure','files','health'].forEach(id=>{const pane=drawerBody.querySelector(`[data-inspector-pane="${id}"]`);if(pane)pane.innerHTML=`<div class="deep-loader"><span>SCAN ERROR / ${esc(err.message)}</span></div>`});
  }

  const observer=new MutationObserver(()=>{
    if(!drawer.classList.contains('open'))return;
    if(drawerBody.dataset.deepInspector==='ready')return;
    queueMicrotask(enhance);
  });
  observer.observe(drawerBody,{childList:true,subtree:false});

  document.addEventListener('click',e=>{
    if(!e.target.closest('[data-repo]'))return;
    drawerBody.removeAttribute('data-deep-inspector');
    setTimeout(enhance,30);
  },true);
})();
