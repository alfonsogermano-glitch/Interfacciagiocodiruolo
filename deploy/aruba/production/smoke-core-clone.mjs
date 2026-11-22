// Run ONLY inside hollowgate-core-smoke-api, never the production container.
// Receives email/password on stdin; never prints credentials, cookies or bodies.
if(process.env.PGDATABASE!=='hollowgate_release_smoke_20261120' ||
  process.env.AUTH_PRODUCTION_ENABLED!=='true' ||
  process.env.AUTH_OAUTH_ENABLED==='true'){
  console.error('SMOKE_DATABASE_O_CONFIG_NON_ISOLATI');process.exit(2);
}
let input='';
for await(const chunk of process.stdin){
  input+=chunk;
  if(input.length>1024){console.error('SMOKE_INPUT_NON_VALIDO');process.exit(2);}
}
const [email,password,...extra]=input.replace(/\r?\n$/,'').split(/\r?\n/);
input='';
if(extra.length||!email||!password){console.error('SMOKE_INPUT_NON_VALIDO');process.exit(2);}
const base='http://127.0.0.1:3000';
try{
  const login=await fetch(base+'/auth/login',{
    method:'POST',redirect:'error',headers:{Origin:'https://www.hollowgate.quest',
      'Content-Type':'application/json'},body:JSON.stringify({email,password}),
  });
  console.log('Login clone: HTTP '+login.status);
  if(login.status!==200)process.exit(1);
  const cookie=login.headers.get('set-cookie')?.match(/^__Host-hg_session=[A-Za-z0-9_-]{43}/)?.[0];
  if(!cookie){console.error('COOKIE_SESSIONE_ASSENTE');process.exit(1);}
  for(const path of ['/auth/me','/vtt/bootstrap','/vtt/campaigns']){
    const response=await fetch(base+path,{headers:{Cookie:cookie},redirect:'error'});
    console.log(path+': HTTP '+response.status);
    if(response.status!==200)process.exitCode=1;
  }
}catch{
  console.error('SMOKE_RICHIESTA_FALLITA');process.exitCode=1;
}
