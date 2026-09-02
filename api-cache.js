(()=>{
  if(window.__nineworksApiCache)return;
  window.__nineworksApiCache=true;

  const nativeFetch=window.fetch.bind(window);
  const owner='jyhome1228-cyber';
  let repoSnapshot=null;
  let eventSnapshot=null;

  async function loadJson(path){
    const r=await nativeFetch(`${path}?v=${Date.now()}`,{cache:'no-store'});
    if(!r.ok) throw new Error(`snapshot ${r.status}`);
    return r.json();
  }

  async function getRepos(){
    if(repoSnapshot) return repoSnapshot;
    try{
      repoSnapshot=await loadJson('./data/repos.json');
      return repoSnapshot;
    }catch{
      return null;
    }
  }

  async function getEvents(){
    if(eventSnapshot) return eventSnapshot;
    try{
      eventSnapshot=await loadJson('./data/events.json');
      return eventSnapshot;
    }catch{
      return null;
    }
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input?.url||'';

    if(url.startsWith('https://api.github.com/users/'+owner+'/repos')){
      const data=await getRepos();
      if(data){
        return new Response(JSON.stringify(data),{
          status:200,
          headers:{'Content-Type':'application/json','X-9W-Source':'pages-snapshot'}
        });
      }
    }

    if(url.startsWith('https://api.github.com/users/'+owner+'/events/public')){
      const data=await getEvents();
      if(data){
        return new Response(JSON.stringify(data),{
          status:200,
          headers:{'Content-Type':'application/json','X-9W-Source':'pages-snapshot'}
        });
      }
    }

    return nativeFetch(input,init);
  };
})();
