(()=>{
  if(window.__nineworksLiveFallback)return;
  window.__nineworksLiveFallback=true;

  const nativeFetch=window.fetch.bind(window);
  const OWNER='jyhome1228-cyber';
  const liveCache=new Map();
  const projectCache=new Map();

  const jsonResponse=(data,status=200,source='fallback')=>new Response(JSON.stringify(data),{
    status,
    headers:{'Content-Type':'application/json; charset=utf-8','X-9W-Source':source}
  });

  const textResponse=(text,status=200)=>new Response(text,{status,headers:{'Content-Type':'text/plain; charset=utf-8'}});

  const utf8Base64=(text='')=>{
    const bytes=new TextEncoder().encode(String(text));
    let binary='';
    for(const byte of bytes)binary+=String.fromCharCode(byte);
    return btoa(binary);
  };

  const contentObject=(text,path)=>({
    type:'file',encoding:'base64',name:String(path||'').split('/').pop()||'',path:path||'',content:utf8Base64(text||'')
  });

  async function loadJson(path,fallback){
    try{
      const response=await nativeFetch(`${path}${path.includes('?')?'&':'?'}v=live3`,{cache:'no-store'});
      if(!response.ok)throw new Error(`fallback ${response.status}`);
      return await response.json();
    }catch(error){
      console.warn('[9W fallback]',path,error);
      return fallback;
    }
  }

  const reposPromise=loadJson('./data/repos.json',[]);
  const eventsPromise=loadJson('./data/events.json',[]);

  async function exactRepoName(name){
    const repos=await reposPromise;
    return repos.find(repo=>String(repo.name).toLowerCase()===String(name).toLowerCase())?.name||name;
  }

  async function projectSnapshot(name){
    const exact=await exactRepoName(name);
    const key=String(exact).toLowerCase();
    if(!projectCache.has(key)){
      projectCache.set(key,loadJson(`./data/projects/${encodeURIComponent(exact)}.json`,null));
    }
    return projectCache.get(key);
  }

  async function liveFirst(input,init,url){
    const key=url.href;
    if(liveCache.has(key))return jsonResponse(liveCache.get(key),200,'memory');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),4500);
    try{
      const response=await nativeFetch(input,{...(init||{}),signal:controller.signal,cache:'no-store'});
      if(response.ok){
        try{
          const data=await response.clone().json();
          liveCache.set(key,data);
        }catch{}
        return response;
      }
      return response;
    }catch(error){
      console.warn('[9W live API]',url.pathname,error);
      return null;
    }finally{
      clearTimeout(timer);
    }
  }

  async function rawFile(repo,path,branch='main'){
    const candidates=[branch,'main','master'].filter((v,i,a)=>v&&a.indexOf(v)===i);
    for(const ref of candidates){
      try{
        const url=`https://raw.githubusercontent.com/${OWNER}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;
        const response=await nativeFetch(url,{cache:'no-store'});
        if(response.ok)return await response.text();
      }catch{}
    }
    return null;
  }

  window.fetch=async function(input,init){
    let url;
    try{url=new URL(typeof input==='string'?input:input.url,location.href)}catch{return nativeFetch(input,init)}
    if(url.hostname!=='api.github.com')return nativeFetch(input,init);

    const live=await liveFirst(input,init,url);
    if(live?.ok)return live;

    const path=decodeURIComponent(url.pathname);

    if(path===`/users/${OWNER}/repos`){
      const repos=await reposPromise;
      if(repos.length)return jsonResponse(repos);
      return live||jsonResponse({message:'GitHub API unavailable'},503);
    }

    if(path===`/users/${OWNER}/events/public`){
      const events=await eventsPromise;
      return jsonResponse(events||[]);
    }

    const match=path.match(new RegExp(`^/repos/${OWNER}/([^/]+)(?:/(.*))?$`,'i'));
    if(!match)return live||nativeFetch(input,init);

    const requestedName=match[1];
    const tail=match[2]||'';
    const snapshot=await projectSnapshot(requestedName);
    if(!snapshot)return live||jsonResponse({message:'Fallback unavailable'},503);

    const repo=snapshot.repo||{};
    const branch=repo.default_branch||'main';

    if(!tail)return jsonResponse(repo);
    if(tail==='commits')return jsonResponse(snapshot.commits||[]);
    if(tail.startsWith('git/trees/'))return jsonResponse({sha:'fallback',url:'',tree:snapshot.tree||[],truncated:!!snapshot.tree_truncated});

    if(tail==='readme'){
      if(snapshot.readme_text)return jsonResponse(contentObject(snapshot.readme_text,'README.md'));
      const raw=await rawFile(requestedName,'README.md',branch);
      if(raw!==null)return jsonResponse(contentObject(raw,'README.md'));
      return jsonResponse({message:'Not Found'},404);
    }

    if(tail==='contents/CNAME'){
      if(snapshot.cname)return jsonResponse(contentObject(snapshot.cname,'CNAME'));
      const raw=await rawFile(requestedName,'CNAME',branch);
      if(raw!==null)return jsonResponse(contentObject(raw,'CNAME'));
      return jsonResponse({message:'Not Found'},404);
    }

    if(tail.startsWith('contents/')){
      const filePath=tail.slice('contents/'.length);
      if(snapshot.package_path&&filePath===snapshot.package_path)return jsonResponse(contentObject(snapshot.package_text||'',filePath));
      if(snapshot.index_path&&filePath===snapshot.index_path)return jsonResponse(contentObject(snapshot.index_text||'',filePath));
      const raw=await rawFile(requestedName,filePath,branch);
      if(raw!==null)return jsonResponse(contentObject(raw,filePath));
      return live||jsonResponse({message:'Not Found'},404);
    }

    return live||jsonResponse({message:'GitHub API unavailable'},503);
  };

  window.__nineworksFallbackReady=Promise.all([reposPromise,eventsPromise]);
})();
