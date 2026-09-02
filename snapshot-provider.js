(()=>{
  if(window.__nineworksSnapshotProvider)return;
  window.__nineworksSnapshotProvider=true;

  const nativeFetch=window.fetch.bind(window);
  const OWNER='jyhome1228-cyber';
  const projectCache=new Map();

  const jsonResponse=(data,status=200)=>new Response(JSON.stringify(data),{
    status,
    headers:{'Content-Type':'application/json; charset=utf-8','X-9W-Source':'snapshot'}
  });

  const utf8Base64=(text='')=>{
    const bytes=new TextEncoder().encode(String(text));
    let binary='';
    for(const byte of bytes)binary+=String.fromCharCode(byte);
    return btoa(binary);
  };

  async function loadJson(path,fallback){
    try{
      const response=await nativeFetch(path,{cache:'no-store'});
      if(!response.ok)throw new Error(`snapshot ${response.status}`);
      return await response.json();
    }catch(error){
      console.warn('[9W snapshot]',path,error);
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

  function contentObject(text,path){
    return {type:'file',encoding:'base64',name:String(path||'').split('/').pop()||'',path:path||'',content:utf8Base64(text||'')};
  }

  window.fetch=async function(input,init){
    let url;
    try{url=new URL(typeof input==='string'?input:input.url,location.href)}catch{return nativeFetch(input,init)}
    if(url.hostname!=='api.github.com')return nativeFetch(input,init);

    const path=decodeURIComponent(url.pathname);

    if(path===`/users/${OWNER}/repos`){
      const repos=await reposPromise;
      if(repos.length)return jsonResponse(repos);
      return nativeFetch(input,init);
    }
    if(path===`/users/${OWNER}/events/public`){
      const events=await eventsPromise;
      return jsonResponse(events);
    }

    const match=path.match(new RegExp(`^/repos/${OWNER}/([^/]+)(?:/(.*))?$`,'i'));
    if(!match)return nativeFetch(input,init);

    const requestedName=match[1];
    const tail=match[2]||'';
    const snapshot=await projectSnapshot(requestedName);
    if(!snapshot)return nativeFetch(input,init);

    if(!tail)return jsonResponse(snapshot.repo||{});
    if(tail==='readme')return jsonResponse(contentObject(snapshot.readme_text||'','README.md'));
    if(tail==='commits')return jsonResponse(snapshot.commits||[]);
    if(tail.startsWith('git/trees/'))return jsonResponse({sha:'snapshot',url:'',tree:snapshot.tree||[],truncated:!!snapshot.tree_truncated});
    if(tail==='contents/CNAME'){
      if(snapshot.cname)return jsonResponse(contentObject(snapshot.cname,'CNAME'));
      return jsonResponse({message:'Not Found'},404);
    }
    if(tail.startsWith('contents/')){
      const filePath=tail.slice('contents/'.length);
      if(snapshot.package_path&&filePath===snapshot.package_path)return jsonResponse(contentObject(snapshot.package_text||'',filePath));
      if(snapshot.index_path&&filePath===snapshot.index_path)return jsonResponse(contentObject(snapshot.index_text||'',filePath));
    }

    try{
      const live=await nativeFetch(input,init);
      if(live.ok)return live;
    }catch{}
    return jsonResponse({message:'Snapshot route unavailable'},404);
  };

  window.__nineworksSnapshotReady=reposPromise;
})();
