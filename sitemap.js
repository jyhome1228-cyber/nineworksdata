(()=>{
  const drawer=document.querySelector('#drawer');
  const drawerBody=document.querySelector('#drawerBody');
  const drawerTitle=document.querySelector('#drawerTitle');
  if(!drawer||!drawerBody||!drawerTitle)return;

  const memoryCache=new Map();
  const MAX_RENDER=180;
  const EXCLUDED=['node_modules/','.git/','assets/','images/','img/','fonts/','vendor/','dist/','build/','coverage/','.next/'];

  const escapeHtml=(value='')=>String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');

  function currentRepo(){
    const title=drawerTitle.textContent.trim().toLowerCase();
    try{return state.repos.find(repo=>String(repo.name).toLowerCase()===title)||null}catch{return null}
  }

  function cacheKey(repo){
    return `9w-sitemap-v1:${repo.name}:${repo.pushed_at||repo.updated_at||'unknown'}`;
  }

  function readCache(repo){
    const key=cacheKey(repo);
    if(memoryCache.has(key))return memoryCache.get(key);
    try{
      const cached=JSON.parse(sessionStorage.getItem(key)||'null');
      if(cached){memoryCache.set(key,cached);return cached}
    }catch{}
    return null;
  }

  function writeCache(repo,data){
    const key=cacheKey(repo);
    memoryCache.set(key,data);
    try{sessionStorage.setItem(key,JSON.stringify(data))}catch{}
  }

  function normalizeDynamic(route){
    return route
      .replace(/\[\.\.\.([^\]]+)\]/g,'*$1')
      .replace(/\[([^\]]+)\]/g,':$1')
      .replace(/\/+/g,'/');
  }

  function routeFromFile(path){
    const clean=String(path||'').replace(/^\.\//,'');
    const lower=clean.toLowerCase();

    if(/\.(html?|php)$/.test(lower)){
      let route='/'+clean;
      route=route.replace(/(^|\/)index\.html?$/i,'$1');
      route=route.replace(/(^|\/)index\.php$/i,'$1');
      route=route.replace(/\/+/g,'/');
      return route||'/';
    }

    const pagesMatch=clean.match(/^(?:src\/)?pages\/(.+)\.(?:js|jsx|ts|tsx|vue|svelte|astro)$/i);
    if(pagesMatch){
      let part=pagesMatch[1];
      if(/^api\//i.test(part)||/^_(app|document|error)$/i.test(part))return null;
      part=part.replace(/(^|\/)index$/i,'$1');
      return normalizeDynamic('/'+part).replace(/\/$/,'')||'/';
    }

    const appMatch=clean.match(/^(?:src\/)?app\/(.+)\/page\.(?:js|jsx|ts|tsx)$/i) || clean.match(/^(?:src\/)?app\/page\.(?:js|jsx|ts|tsx)$/i);
    if(appMatch){
      let part=appMatch[1]||'';
      part=part.split('/').filter(segment=>!/^\(.+\)$/.test(segment)).join('/');
      return normalizeDynamic('/'+part).replace(/\/$/,'')||'/';
    }

    return null;
  }

  function isRouteFile(path){
    const lower=String(path||'').toLowerCase();
    if(EXCLUDED.some(part=>lower.includes(part)))return false;
    if(/\.(html?|php)$/.test(lower))return true;
    if(/^(?:src\/)?pages\/.+\.(js|jsx|ts|tsx|vue|svelte|astro)$/.test(lower))return true;
    if(/^(?:src\/)?app\/(?:.*\/)?page\.(js|jsx|ts|tsx)$/.test(lower))return true;
    return false;
  }

  function topGroup(route){
    if(route==='/')return 'ROOT / HOME';
    const first=route.replace(/^\//,'').split('/')[0]||'ROOT';
    return first.toUpperCase();
  }

  async function readSitemapXml(repo){
    const branch=encodeURIComponent(repo.default_branch||'main');
    const base=`https://raw.githubusercontent.com/${CONFIG.owner}/${encodeURIComponent(repo.name)}/${branch}`;
    for(const file of ['sitemap.xml','public/sitemap.xml']){
      try{
        const response=await fetch(`${base}/${file}`,{cache:'no-store'});
        if(!response.ok)continue;
        const text=await response.text();
        const xml=new DOMParser().parseFromString(text,'application/xml');
        if(xml.querySelector('parsererror'))continue;
        const locs=[...xml.querySelectorAll('url > loc')].map(node=>node.textContent.trim()).filter(Boolean);
        if(!locs.length)continue;
        const routes=locs.map((loc,index)=>{
          try{
            const url=new URL(loc);
            return {route:url.pathname||'/',file:`sitemap.xml #${index+1}`};
          }catch{return {route:loc,file:`sitemap.xml #${index+1}`}}
        });
        return {source:'SITEMAP.XML',branch:repo.default_branch||'main',routes};
      }catch{}
    }
    return null;
  }

  async function readTree(repo){
    const branch=encodeURIComponent(repo.default_branch||'main');
    const url=`https://api.github.com/repos/${CONFIG.owner}/${encodeURIComponent(repo.name)}/git/trees/${branch}?recursive=1`;
    const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'}});
    if(!response.ok)throw new Error(`GitHub API ${response.status}`);
    const data=await response.json();
    const routeMap=new Map();
    for(const item of Array.isArray(data.tree)?data.tree:[]){
      if(item.type!=='blob'||!isRouteFile(item.path))continue;
      const route=routeFromFile(item.path);
      if(!route)continue;
      if(!routeMap.has(route))routeMap.set(route,{route,file:item.path});
    }
    const routes=[...routeMap.values()].sort((a,b)=>{
      if(a.route==='/')return -1;
      if(b.route==='/')return 1;
      return a.route.localeCompare(b.route);
    });
    return {source:'GITHUB TREE · 1 API CALL',branch:repo.default_branch||'main',routes,truncated:!!data.truncated};
  }

  async function loadMap(repo){
    const cached=readCache(repo);
    if(cached)return {...cached,cached:true};
    const xml=await readSitemapXml(repo);
    const data=xml||await readTree(repo);
    writeCache(repo,data);
    return data;
  }

  function render(panel,data){
    const routes=Array.isArray(data.routes)?data.routes:[];
    const visible=routes.slice(0,MAX_RENDER);
    const groups=new Map();
    visible.forEach(item=>{
      const key=topGroup(item.route);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(item);
    });

    panel.innerHTML=`
      <div class="sitemap-status">
        <span>${escapeHtml(data.source)} · ${escapeHtml(data.branch||'main')}${data.cached?' · SESSION CACHE':''}</span>
        <strong>${routes.length} ROUTES</strong>
      </div>
      <div class="sitemap-tree">
        ${routes.length?[...groups.entries()].map(([group,items])=>`
          <section class="sitemap-group">
            <p class="sitemap-group-title">${escapeHtml(group)}</p>
            ${items.map((item,index)=>`
              <div class="sitemap-route">
                <i>${String(index+1).padStart(2,'0')}</i>
                <strong>${escapeHtml(item.route)}</strong>
                <span>${escapeHtml(item.file)}</span>
              </div>`).join('')}
          </section>`).join(''):`
          <div class="sitemap-empty"><b>NO PAGE ROUTES DETECTED</b>HTML 또는 일반적인 framework route 파일을 찾지 못했습니다. 기존 프로젝트 기능에는 영향이 없습니다.</div>`}
        ${routes.length>MAX_RENDER?`<div class="sitemap-empty"><b>+ ${routes.length-MAX_RENDER} MORE ROUTES</b>화면 성능을 위해 ${MAX_RENDER}개까지만 표시합니다.</div>`:''}
        ${data.truncated?`<div class="sitemap-empty"><b>TREE TRUNCATED BY GITHUB</b>저장소가 매우 커 일부 경로가 생략될 수 있습니다.</div>`:''}
      </div>`;
  }

  function renderError(panel,error){
    panel.innerHTML=`
      <div class="sitemap-status is-error"><span>SITE MAP UNAVAILABLE</span><strong>SAFE FAIL</strong></div>
      <div class="sitemap-empty"><b>${escapeHtml(error?.message||'Unable to load site map')}</b>사이트맵만 불러오지 못했습니다. 프로젝트 카드, 메모, 도메인 기능은 그대로 유지됩니다.</div>`;
  }

  function inject(){
    if(drawerBody.querySelector('.sitemap-module'))return;
    const repo=currentRepo();
    const sitePanel=drawerBody.querySelector('.site-panel');
    if(!repo||!sitePanel)return;

    const module=document.createElement('section');
    module.className='sitemap-module';
    module.innerHTML=`
      <div class="sitemap-head">
        <div><span class="sitemap-kicker">ON-DEMAND / SAFE MODE</span><h3>SITE MAP</h3></div>
        <button class="sitemap-open" type="button">VIEW SITE MAP ↗</button>
      </div>
      <div class="sitemap-panel" hidden></div>`;
    sitePanel.after(module);

    const button=module.querySelector('.sitemap-open');
    const panel=module.querySelector('.sitemap-panel');
    let loaded=false;

    button.addEventListener('click',async()=>{
      if(loaded){
        panel.hidden=!panel.hidden;
        button.textContent=panel.hidden?'VIEW SITE MAP ↗':'HIDE SITE MAP ↑';
        return;
      }
      panel.hidden=false;
      button.disabled=true;
      button.textContent='SCANNING…';
      panel.innerHTML='<div class="sitemap-empty"><b>READING ROUTES…</b>sitemap.xml을 먼저 확인하고, 없으면 GitHub Tree API를 1회만 호출합니다.</div>';
      try{
        const data=await loadMap(repo);
        render(panel,data);
        loaded=true;
        button.textContent='HIDE SITE MAP ↑';
      }catch(error){
        renderError(panel,error);
        loaded=true;
        button.textContent='HIDE SITE MAP ↑';
      }finally{
        button.disabled=false;
      }
    });
  }

  const observer=new MutationObserver(()=>inject());
  observer.observe(drawerBody,{childList:true,subtree:false});
  inject();
})();
