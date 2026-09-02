(function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  async function hydrateDomains(){
    for(let i=0;i<24&&!state.repos.length;i++) await sleep(250);
    if(!state.repos.length)return;
    const targets=state.repos.filter(repo=>repo.has_pages&&!repo.homepage&&!noteFor(repo.name).previewUrl);
    if(!targets.length)return;
    let found=0;
    await Promise.allSettled(targets.map(async repo=>{
      const branch=encodeURIComponent(repo.default_branch||'main');
      const url=`https://raw.githubusercontent.com/${CONFIG.owner}/${encodeURIComponent(repo.name)}/${branch}/CNAME`;
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)return;
      const domain=(await response.text()).trim().split(/\s+/)[0];
      if(!domain||domain.includes('<')||domain.length>253)return;
      repo.homepage=ensureUrl(domain);
      found++;
    }));
    if(found){
      renderCards();
      renderRepos();
      renderCommand('');
      if(els.syncLabel) els.syncLabel.textContent=`${state.repos.length} projects / ${found} custom domains detected`;
    }
  }
  hydrateDomains();
  setInterval(hydrateDomains,CONFIG.autoSyncMs||300000);
})();