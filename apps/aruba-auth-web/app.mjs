import {resolveRoute,validatePasswords,createAuthApi} from './flow.mjs';

// Never store a raw one-time token in history, storage or analytics.
const route=resolveRoute(window.location.href);
if(window.location.search||window.location.hash)window.history.replaceState(null,'',window.location.pathname);
const api=createAuthApi({fetchImpl:window.fetch.bind(window),origin:window.location.origin});
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
document.title='Hollowgate · '+selection[0];
for(const [name,form] of Object.entries(forms))form.hidden=name!==route.view;

function notify(message,isError=false){
  const box=$('notice');box.textContent=message;
  box.dataset.type=isError?'error':'success';box.hidden=false;
}
function clearNotice(){ $('notice').hidden=true;$('notice').textContent='';}
async function submit(form,work){
  if(!form.reportValidity())return;
  clearNotice();
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  try {await work(new FormData(form));}
  catch(error){
    notify(error?.name==='ApiError'&&typeof error.message==='string'
      ?error.message:'Non è possibile completare la richiesta. Riprova più tardi.',true);
  }finally{button.disabled=false;}
}
function wire(view,handler){
  forms[view].addEventListener('submit',event=>{
    event.preventDefault();void submit(forms[view],handler);
  });
}
function validatePair(password,confirm){
  const error=validatePasswords(password,confirm);
  if(error)throw Object.assign(new Error(error),{name:'ApiError'});
}
wire('login',async data=>{
  await api.login(data.get('email'),data.get('password'));
  forms.login.reset();
  // Never redirect a staging login into the live Supabase-backed VTT.
  const user=await api.me();
  notify(user?.displayName
    ?'Accesso effettuato per '+user.displayName+'. Sei nell’ambiente di prova.'
    :'Accesso effettuato nell’ambiente di prova.');
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
  if(!route.token||route.purpose!=='password_reset'){
    notify('Collegamento non valido. Richiedi un nuovo recupero password.',true);return;
  }
  const password=data.get('password');
  validatePair(password,data.get('confirm'));
  await api.reset(route.token,password);
  forms.reset.reset();
  route.token=null;
  notify('Password aggiornata. Ora puoi accedere con la nuova password.');
});
wire('verify',async()=>{
  if(!route.token){
    notify('Collegamento mancante o non valido. Controlla il messaggio ricevuto.',true);return;
  }
  await api.verify(route.token);
  route.token=null;
  notify('Indirizzo email confermato. Puoi accedere al tuo account.');
});
if((route.view==='reset'||route.view==='verify')&&!route.token){
  notify('Il link non è valido o è incompleto. Richiedi un nuovo collegamento.',true);
  forms[route.view].querySelector('button[type="submit"]').disabled=true;
}
if(route.view==='reset'&&route.token&&route.purpose!=='password_reset'){
  notify('Questo tipo di collegamento non è ancora supportato.',true);
  forms.reset.querySelector('button[type="submit"]').disabled=true;
}
