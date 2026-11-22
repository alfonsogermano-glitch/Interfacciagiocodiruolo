import {resolveRoute,validatePasswords,createAuthApi} from './flow.mjs';

// Never store a raw one-time token in history, storage or analytics.
const oauthResult=new URL(window.location.href).searchParams.get('oauth');
const route=resolveRoute(window.location.href);
if(window.location.search||window.location.hash)window.history.replaceState(null,'',window.location.pathname);
const isStaticPreview=document.querySelector('meta[name="hollowgate-preview"]')?.content==='static-only';
// Static preview is fail-closed: never instantiate an API client or submit form data.
const api=isStaticPreview?null:createAuthApi({
  fetchImpl:window.fetch.bind(window),origin:window.location.origin,
});
const $=id=>document.getElementById(id);
const forms={login:$('login-form'),signup:$('signup-form'),forgot:$('forgot-form'),
  reset:$('reset-form'),verify:$('verify-form')};
const headlines={
  login:['Accedi a Hollowgate','Inserisci le tue credenziali per continuare.'],
  signup:['Crea il tuo account','Riceverai un link per verificare il tuo indirizzo email.'],
  forgot:['Recupera la password','Ti invieremo le istruzioni se il tuo indirizzo è registrato.'],
  reset:['Imposta una nuova password','Il collegamento può essere utilizzato una sola volta.'],
  verify:['Conferma la tua email','Completa la verifica per attivare il tuo account.'],
};
const selection=headlines[route.view]??headlines.login;
$('page-title').textContent=selection[0];
$('page-intro').textContent=selection[1];
const isLanding=window.location.pathname==='/';
document.title=isLanding?'Hollowgate · Varca la Soglia':'Hollowgate · '+selection[0];
for(const [name,form] of Object.entries(forms))form.hidden=name!==route.view;
const showAuthChoices=['login','signup'].includes(route.view);
if($('auth-tabs'))$('auth-tabs').hidden=!showAuthChoices;
if($('social-auth'))$('social-auth').hidden=!showAuthChoices;
if(window.location.hostname==='localhost'){
  for(const name of ['signup','forgot']){
    const button=forms[name]?.querySelector('button[type="submit"]');
    if(button){button.disabled=true;button.title='Funzione email non disponibile nel test locale';}
  }
  const localNote=document.createElement('p');
  localNote.className='local-auth-note';
  localNote.textContent='Ambiente locale: usa una password di test. Registrazione e recupero via email non sono disponibili.';
  $('auth-tabs')?.after(localNote);
}
for(const tab of document.querySelectorAll('[data-tab]')){
  if(tab.dataset.tab===route.view)tab.setAttribute('aria-current','page');
}
if(!isStaticPreview&&showAuthChoices){
  void window.fetch('/auth/oauth/providers',{credentials:'same-origin',cache:'no-store'})
    .then(response=>response.ok?response.json():null)
    .then(data=>{
      if(!Array.isArray(data?.providers))return;
      let enabled=0;
      for(const button of document.querySelectorAll('[data-oauth-provider]')){
        if(!data.providers.includes(button.dataset.oauthProvider))continue;
        button.disabled=false;
        button.removeAttribute('title');
        button.addEventListener('click',()=>{
          window.location.assign('/auth/oauth/'+button.dataset.oauthProvider+'/start');
        });
        enabled++;
      }
      if(enabled===(document.querySelectorAll('[data-oauth-provider]').length))$('social-status').hidden=true;
    }).catch(()=>{}); // Fails closed when the capability endpoint is unavailable.
}

const overlay=$('auth-overlay');
const openAuth=$('open-auth');
const closeAuth=$('close-auth');
function setAuthOpen(open){
 if(!overlay)return;
 overlay.hidden=!open;
 document.body.style.overflow=open?'hidden':'';
 if(open)forms[route.view]?.querySelector('input')?.focus();
}
if(overlay){
 setAuthOpen(!isLanding);
 openAuth?.addEventListener('click',()=>setAuthOpen(true));
 closeAuth?.addEventListener('click',()=>setAuthOpen(false));
 overlay.addEventListener('click',event=>{if(event.target===overlay&&isLanding)setAuthOpen(false);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isLanding)setAuthOpen(false);});
  if(isLanding){
    const hero=document.querySelector('.landing-hero');
    const eyes=[...document.querySelectorAll('.eye')];
    const obstacles=[...document.querySelectorAll('.landing-titles img,.landing-logo,.feature-grid')];
    const imageBytes=eyes.map(eye=>fetch(eye.dataset.animation)
      .then(response=>{if(!response.ok)throw new Error('Eye asset unavailable');return response.blob();})
      .catch(()=>null));
    let eyeIndex=0;
    const intersects=(a,b,padding)=>a.left<b.right+padding&&a.right>b.left-padding&&a.top<b.bottom+padding&&a.bottom>b.top-padding;
    function emptySpace(eye){
      const bounds=hero.getBoundingClientRect();
      const width=eye.getBoundingClientRect().width;
      const height=width; // Both original WebP animations have square frames.
      const inset=16;
      const availableWidth=bounds.width-width-2*inset;
      const availableHeight=bounds.height-height-2*inset;
      if(availableWidth<=0||availableHeight<=0)return null;
      const blocked=obstacles.map(element=>element.getBoundingClientRect());
      for(let attempt=0;attempt<100;attempt++){
        const left=bounds.left+inset+Math.random()*availableWidth;
        const top=bounds.top+inset+Math.random()*availableHeight;
        const candidate={left,top,right:left+width,bottom:top+height};
        if(blocked.every(rect=>!intersects(candidate,rect,16)))
          return {left:left-bounds.left,top:top-bounds.top};
      }
      return null; // No safe place on this viewport: omit rather than cover content.
    }
    async function revealEye(){
      const index=eyeIndex++%eyes.length;
      const eye=eyes[index];
      const position=emptySpace(eye);
      if(!position)return;
      const bytes=await imageBytes[index];
      if(!bytes)return;
      eye.style.left=position.left+'px';
      eye.style.top=position.top+'px';
      // A fresh Blob URL creates a new WebP playback without re-downloading it.
      const url=URL.createObjectURL(bytes);
      eye.src=url;
      eye.classList.add('visible');
      window.setTimeout(()=>{
        eye.classList.remove('visible');
        window.setTimeout(()=>{eye.removeAttribute('src');URL.revokeObjectURL(url);},260);
      },1670);
    }
    window.setTimeout(()=>{void revealEye();window.setInterval(()=>void revealEye(),3000);},1500);
  }
}

function notify(message,isError=false){
  const box=$('notice');box.textContent=message;
  box.dataset.type=isError?'error':'success';box.hidden=false;
}
function clearNotice(){ $('notice').hidden=true;$('notice').textContent='';}
if(oauthResult==='failed')notify('Accesso social non completato. Accedi con email e password o riprova.',true);
if(oauthResult==='complete')window.location.replace('/vtt/');
async function submit(form,work){
  if(!form.reportValidity())return;
  clearNotice();
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  try {await work(new FormData(form));}
  catch(error){
    notify(error?.name==='ApiError'&&typeof error.message==='string'
      ?error.message:'Non è possibile completare la richiesta. Riprova più tardi.',true);
  }finally{button.disabled=form.dataset.completed==='true';}
}
function wire(view,handler){
  forms[view].addEventListener('submit',event=>{
    event.preventDefault();
    if(isStaticPreview){
      notify('Questa è solo un’anteprima grafica. Nessun dato è stato inviato.');
      return;
    }
    void submit(forms[view],handler);
  });
}
function validatePair(password,confirm){
  const error=validatePasswords(password,confirm);
  if(error)throw Object.assign(new Error(error),{name:'ApiError'});
}
wire('login',async data=>{
  await api.login(data.get('email'),data.get('password'));
  forms.login.reset();
  window.location.assign('/vtt/');
});
wire('signup',async data=>{
  const password=data.get('password');
  validatePair(password,data.get('confirm'));
  await api.signup(data.get('email'),data.get('displayName'),password);
  forms.signup.reset();
  notify('Se la registrazione è valida, riceverai un link di verifica via email.');
});
wire('forgot',async data=>{
  await api.forgot(data.get('email'));
  forms.forgot.reset();
  notify('Se l’indirizzo è registrato, riceverai le istruzioni via email.');
});
wire('reset',async data=>{
  if(!route.token||!['password_reset','password_setup'].includes(route.purpose)){
    notify('Collegamento non valido. Richiedi un nuovo recupero password.',true);return;
  }
  const password=data.get('password');
  validatePair(password,data.get('confirm'));
  await api.reset(route.token,password);
  forms.reset.reset();
  route.token=null;
  notify('Password modificata correttamente. Verrai reindirizzato al login.');
  window.setTimeout(()=>window.location.assign('/login'),1500);
});
wire('verify',async()=>{
  if(!route.token){
    notify('Collegamento mancante o non valido. Controlla il messaggio ricevuto.',true);return;
  }
  await api.verify(route.token);
  route.token=null;
  forms.verify.dataset.completed='true';
  notify('Indirizzo email confermato. Verrai reindirizzato al login.');
  window.setTimeout(()=>window.location.replace('/login'),2000);
});
if((route.view==='reset'||route.view==='verify')&&!route.token){
  notify('Il link non è valido o è incompleto. Richiedi un nuovo collegamento.',true);
  forms[route.view].querySelector('button[type="submit"]').disabled=true;
}
if(route.view==='reset'&&route.token&&!['password_reset','password_setup'].includes(route.purpose)){
  notify('Questo tipo di collegamento non è ancora supportato.',true);
  forms.reset.querySelector('button[type="submit"]').disabled=true;
}
