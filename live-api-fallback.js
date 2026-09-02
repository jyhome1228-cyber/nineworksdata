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
      const response=await nativeFetch(`${path}${path.includes('?')?'&':'?'}v=live4`,{cache:'no-store'});
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
    const timer=setTimeout(()=>controller.abort(),4200);
    try{
      const response=await nativeFetch(input,{...(init||{}),signal:controller.signal,cache:'no-store'});
      if(response.ok){
        try{
          const data=await response.clone().json();
          liveCache.set(key,data);
        }catch{}
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
        const rawPath=path.split('/').map(encodeURIComponent).join('/');
        const rawUrl=`https://raw.githubusercontent.com/${OWNER}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${rawPath}`;
        const response=await nativeFetch(rawUrl,{cache:'no-store'});
        if(response.ok)return await response.text();
      }catch{}
    }
    return null;
  }

  function repoFromLiveState(name){
    try{
      if(typeof state!=='undefined'&&Array.isArray(state.repos)){
        return state.repos.find(repo=>String(repo.name).toLowerCase()===String(name).toLowerCase())||null;
      }
    }catch{}
    return null;
  }

  window.fetch=async function(input,init){
    let url;
    try{url=new URL(typeof input==='string'?input:input.url,location.href)}catch{return nativeFetch(input,init)}
    if(url.hostname!=='api.github.com')return nativeFetch(input,init);

    const path=decodeURIComponent(url.pathname);

    // The project index still uses the original live GitHub API first.
    if(path===`/users/${OWNER}/repos`){
      const live=await liveFirst(input,init,url);
      if(live?.ok)return live;
      const repos=await reposPromise;
      if(repos.length)return jsonResponse(repos,200,'fallback');
      return live||jsonResponse({message:'GitHub API unavailable'},503);
    }

    if(path===`/users/${OWNER}/events/public`){
      const live=await liveFirst(input,init,url);
      if(live?.ok)return live;
      const events=await eventsPromise;
      return jsonResponse(events||[],200,'fallback');
    }

    const match=path.match(new RegExp(`^/repos/${OWNER}/([^/]+)(?:/(.*))?$`,'i'));
    if(!match)return nativeFetch(input,init);

    const requestedName=match[1];
    const tail=match[2]||'';
    const snapshot=await projectSnapshot(requestedName);
    const liveRepo=repoFromLiveState(requestedName);
    const repo=liveRepo||snapshot?.repo||{};
    const branch=repo.default_branch||'main';

    // Metadata is already present in the live project index, so don't spend another API request.
    if(!tail){
      if(Object.keys(repo).length)return jsonResponse(repo,200,liveRepo?'live-index':'fallback');
      const live=await liveFirst(input,init,url);
      return live||jsonResponse({message:'Repository unavailable'},503);
    }

    // README / CNAME / file contents come directly from raw.githubusercontent.com,
    // which does not consume the unauthenticated REST quota.
    if(tail==='readme'){
      for(const readmeName of ['README.md','README.MD','readme.md','README']){
        const raw=await rawFile(requestedName,readmeName,branch);
        if(raw!==null)return jsonResponse(contentObject(raw,readmeName),200,'raw');
      }
      if(snapshot?.readme_text)return jsonResponse(contentObject(snapshot.readme_text,'README.md'),200,'fallback');
      return jsonResponse(contentObject(repo.description||'README.md가 없는 프로젝트입니다. GitHub 메타데이터는 정상 연결되어 있습니다.','README.md'),200,'metadata');
    }

    if(tail==='contents/CNAME'){
      const raw=await rawFile(requestedName,'CNAME',branch);
      if(raw!==null)return jsonResponse(contentObject(raw,'CNAME'),200,'raw');
      if(snapshot?.cname)return jsonResponse(contentObject(snapshot.cname,'CNAME'),200,'fallback');
      return jsonResponse({message:'Not Found'},404);
    }

    if(tail.startsWith('contents/')){
      const filePath=tail.slice('contents/'.length);
      const raw=await rawFile(requestedName,filePath,branch);
      if(raw!==null)return jsonResponse(contentObject(raw,filePath),200,'raw');
      if(snapshot?.package_path&&filePath===snapshot.package_path)return jsonResponse(contentObject(snapshot.package_text||'',filePath),200,'fallback');
      if(snapshot?.index_path&&filePath===snapshot.index_path)return jsonResponse(contentObject(snapshot.index_text||'',filePath),200,'fallback');
      return jsonResponse({message:'Not Found'},404);
    }

    // Only commits and recursive tree spend live REST quota; both are cached in-memory.
    if(tail==='commits'){
      const live=await liveFirst(input,init,url);
      if(live?.ok)return live;
      return jsonResponse(snapshot?.commits||[],200,'fallback');
    }

    if(tail.startsWith('git/trees/')){
      const live=await liveFirst(input,init,url);
      if(live?.ok)return live;
      return jsonResponse({sha:'fallback',url:'',tree:snapshot?.tree||[],truncated:!!snapshot?.tree_truncated},200,'fallback');
    }

    const live=await liveFirst(input,init,url);
    return live||jsonResponse({message:'GitHub API unavailable'},503);
  };

  window.__nineworksFallbackReady=Promise.all([reposPromise,eventsPromise]);
})();
