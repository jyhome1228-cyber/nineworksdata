(()=>{
  const EXPECTED='09910fdc87ececd02b0d164e9166f3bdc17488e1827b600bd3c65e6cbf4dbc9f';
  const SESSION_KEY='9w-control-auth-v1';
  const scripts=['./app.js','./domain-hints.js','./save-animation.js'];
  const messages=[
    'kernel.auth :: awaiting credential',
    'github.adapter :: link standby',
    'project.index :: encrypted',
    'workspace.memory :: protected'
  ];
  let loaded=false;

  document.body.classList.add('auth-locked');

  const gate=document.createElement('div');
  gate.className='auth-gate';
  gate.id='authGate';
  gate.innerHTML=`
    <div class="auth-code-field" id="authCodeField" aria-hidden="true"></div>
    <div class="auth-corners" aria-hidden="true"></div>
    <section class="auth-panel" id="authPanel" aria-labelledby="authTitle">
      <div class="auth-kicker"><span><i></i>SECURE NODE / 09W</span><span>AUTH_REQUIRED</span></div>
      <h1 class="auth-brand" id="authTitle">9W <span>//</span> CONTROL</h1>
      <p class="auth-copy">Studio development system. Authorized access only.</p>
      <form class="auth-form" id="authForm">
        <label class="auth-label" for="authPassword">ACCESS KEY</label>
        <div class="auth-input-wrap">
          <input id="authPassword" name="password" type="password" inputmode="numeric" autocomplete="current-password" placeholder="ENTER ACCESS KEY" aria-describedby="authMessage" />
          <button class="auth-submit" id="authSubmit" type="submit">ENTER ↗</button>
        </div>
      </form>
      <div class="auth-terminal" id="authMessage" aria-live="polite">
        <p>&gt; ${messages[0]}</p>
        <p>&gt; ${messages[1]}</p>
        <p>&gt; ready<span class="auth-cursor"></span></p>
      </div>
      <div class="auth-progress" aria-hidden="true"><i></i></div>
    </section>`;
  document.body.prepend(gate);

  const panel=gate.querySelector('#authPanel');
  const form=gate.querySelector('#authForm');
  const input=gate.querySelector('#authPassword');
  const submit=gate.querySelector('#authSubmit');
  const terminal=gate.querySelector('#authMessage');
  const field=gate.querySelector('#authCodeField');

  const fragments=[
    '0x9F2A :: NODE_HANDSHAKE','git.ref/main -> READY','GET /repos/{owner}/{repo}','commit.sha 7f3a91c','workflow.run :: SUCCESS','deploy.target :: production','auth.scope :: workspace','index.project :: ACTIVE','dns.resolve :: OK','branch.main :: TRACKING','memo.write :: QUEUED','cache.sync :: VALID','sys.mem 0xAF23 76%','socket 443 :: ESTABLISHED','repo.scan :: COMPLETE','sha256.verify :: PASS','origin.fetch :: 200','event.push :: RECEIVED','project.state :: WORKING','domain.route :: SECURE','permission.read :: ALLOW','terminal.stream :: LIVE','build.pipeline :: READY','workspace.lock :: ENABLED','token.local :: NONE','session.guard :: ACTIVE','trace.id :: 09W-9612','process 4821 :: RUNNING','api.github :: CONNECTED','assets.index :: READY','commit.delta +14 -3','hook.listener :: STANDBY','runtime.secure :: TRUE','client.node :: LOCAL','matrix.refresh :: 5000ms','repo.count :: SYNC','encryption.layer :: AES','sys.clock :: KST','telemetry :: NOMINAL','access.policy :: PRIVATE'
  ];

  function fillCode(){
    const cols=7;
    field.innerHTML='';
    for(let c=0;c<cols;c++){
      const el=document.createElement('div');
      el.className='auth-code-column';
      el.style.setProperty('--speed',`${12+(c%5)*2.6}s`);
      el.style.setProperty('--start',`${-4-(c%4)*7}%`);
      const lines=[];
      for(let i=0;i<46;i++){
        const base=fragments[(i*3+c*7)%fragments.length];
        const hex=((i+1)*(c+11)*7919%0xffffff).toString(16).padStart(6,'0').toUpperCase();
        lines.push(`${String(i+1).padStart(3,'0')}  ${base}  #${hex}`);
      }
      el.textContent=lines.join('\n');
      field.appendChild(el);
    }
  }

  async function hash(value){
    const data=new TextEncoder().encode(value);
    const digest=await crypto.subtle.digest('SHA-256',data);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

  async function loadApp(){
    if(loaded)return;
    loaded=true;
    for(const src of scripts){
      await new Promise((resolve,reject)=>{
        const s=document.createElement('script');
        s.src=src;
        s.defer=false;
        s.onload=resolve;
        s.onerror=reject;
        document.body.appendChild(s);
      });
    }
  }

  async function unlock({skipSequence=false}={}){
    submit.disabled=true;
    input.disabled=true;
    panel.classList.add('processing');
    if(!skipSequence){
      const seq=[
        ['AUTHENTICATING CREDENTIAL','hot',170],
        ['VERIFYING SHA-256 SIGNATURE','hot',190],
        ['DECRYPTING WORKSPACE SESSION','hot',220],
        ['INITIALIZING GITHUB ADAPTER','hot',190],
        ['ACCESS GRANTED','ok',260]
      ];
      terminal.innerHTML='';
      for(const [text,cls,delay] of seq){
        const p=document.createElement('p');
        p.className=cls;
        p.textContent=`> ${text}`;
        terminal.appendChild(p);
        await sleep(delay);
      }
    }
    await loadApp();
    sessionStorage.setItem(SESSION_KEY,'granted');
    document.body.classList.remove('auth-locked');
    gate.classList.add('is-unlocking');
    setTimeout(()=>gate.remove(),650);
  }

  async function deny(){
    panel.classList.remove('denied');
    void panel.offsetWidth;
    panel.classList.add('denied');
    terminal.innerHTML='<p class="bad">> ACCESS DENIED / INVALID CREDENTIAL</p><p>&gt; security node remains locked<span class="auth-cursor"></span></p>';
    input.value='';
    input.focus();
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const value=input.value.trim();
    if(!value)return deny();
    submit.disabled=true;
    submit.textContent='VERIFYING…';
    try{
      const digest=await hash(value);
      if(digest===EXPECTED){
        await unlock();
      }else{
        submit.disabled=false;
        submit.textContent='ENTER ↗';
        await deny();
      }
    }catch{
      submit.disabled=false;
      submit.textContent='ENTER ↗';
      terminal.innerHTML='<p class="bad">> AUTH ENGINE ERROR</p><p>&gt; reload and retry</p>';
    }
  });

  fillCode();

  if(sessionStorage.getItem(SESSION_KEY)==='granted'){
    terminal.innerHTML='<p class="ok">> SESSION KEY VERIFIED</p><p>&gt; restoring workspace<span class="auth-cursor"></span></p>';
    unlock({skipSequence:true});
  }else{
    setTimeout(()=>input.focus(),80);
  }
})();