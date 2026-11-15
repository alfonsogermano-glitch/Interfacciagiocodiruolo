// Isolated authentication UI helpers; no storage of tokens or passwords.
// Requests use the current HTTPS origin and host-only session cookies.
export const ROUTES=Object.freeze({
  login:'/login',
  signup:'/signup',
  forgot:'/forgot-password',
  reset:'/account/password',
  verify:'/account/verify-email',
});
export const TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;

export function resolveRoute(rawUrl) {
  const url=new URL(rawUrl);
  const view=Object.entries(ROUTES).find(([,path])=>path===url.pathname)?.[0]??'login';
  const token=url.searchParams.get('token');
  const purpose=url.searchParams.get('action');
  // Never pass a user-supplied redirect destination to any API.
  return {view,token:token&&TOKEN_PATTERN.test(token)?token:null,
    purpose:purpose==='password_reset'||purpose==='password_setup'?purpose:null,
    hasInvalidToken:token!==null&&!TOKEN_PATTERN.test(token)};
}

export function validatePasswords(password,confirm) {
  if(typeof password!=='string'||password.length<12||password.length>256)
    return 'Usa una password di almeno 12 caratteri (massimo 256).';
  if(password!==confirm)return 'Le password non coincidono.';
  return null;
}

export class ApiError extends Error {
  constructor(status,message) {super(message);this.status=status;}
}

export function createAuthApi({fetchImpl,origin}={}) {
  if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl required');
  const parsed=new URL(origin);
  if(parsed.protocol!=='https:'||parsed.origin!==origin)throw new TypeError('Secure same-origin required');
  async function call(path,payload,method='POST') {
    if(!/^\/auth\/[a-z/-]+$/.test(path))throw new TypeError('Invalid API path');
    const response=await fetchImpl(origin+path,{
      method,credentials:'same-origin',redirect:'error',cache:'no-store',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      ...(method==='POST'?{body:JSON.stringify(payload)}:{}),
    });
    let data;
    try {data=await response.json();}catch{throw new ApiError(response.status,'Risposta del servizio non valida.');}
    if(!response.ok)throw new ApiError(response.status,
      typeof data.error==='string'&&data.error.length<200?data.error:'Operazione non riuscita.');
    return data;
  }
  return {
    login:(email,password)=>call('/auth/login',{email,password}),
    signup:(email,displayName,password)=>call('/auth/signup',{email,displayName,password}),
    forgot:email=>call('/auth/password/request',{email}),
    reset:(token,newPassword)=>call('/auth/password/redeem',{token,newPassword}),
    verify:token=>call('/auth/verify-email',{token}),
    me:async()=> {
      const r=await fetchImpl(origin+'/auth/me',{credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(r.status===401)return null;
      if(!r.ok)throw new ApiError(r.status,'Sessione non disponibile.');
      const data=await r.json();
      return data.user??null;
    },
    logout:()=>call('/auth/logout',{}),
  };
}
