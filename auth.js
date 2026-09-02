(()=>{
  const version='live4';
  const load=(src)=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=`${src}?v=${version}`;
    s.defer=false;
    s.onload=resolve;
    s.onerror=reject;
    document.body.appendChild(s);
  });

  load('./live-api-fallback.js')
    .catch(error=>console.warn('[9W] fallback bootstrap skipped',error))
    .finally(()=>load('./auth-core.js'));
})();
