"use client";

const projectUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://rzkwmwtjnwnmmcexwoov.supabase.co";
const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_egPsJQ5koBZHRPhT4dPhFw_Ffiz67B3";
const sessionKey="mkl-supabase-session";
let profilePromise;

export const cloudConfigured=Boolean(projectUrl&&publishableKey);

function authRedirectUrl() {
  if(typeof window==="undefined") return "https://crm-mkl-energeies.vercel.app/";
  return `${window.location.origin}/`;
}

function readAuthParams() {
  if(typeof window==="undefined") return new URLSearchParams();
  const merged=new URLSearchParams(window.location.search);
  new URLSearchParams(window.location.hash.slice(1)).forEach((value,key)=>merged.set(key,value));
  return merged;
}

export function readAuthRedirectError() {
  const params=readAuthParams();
  const code=params.get("error_code")||params.get("error");
  const description=params.get("error_description")||params.get("error_message");
  if(!code&&!description) return "";
  if(/otp_expired|expired/i.test(`${code} ${description}`)) {
    return "Ce lien a expiré. Demandez un nouveau lien ci-dessous.";
  }
  if(/access_denied|invalid|not found/i.test(`${code} ${description}`)) {
    return "Ce lien n’est plus valide. Demandez un nouveau lien ci-dessous.";
  }
  return description?decodeURIComponent(description.replace(/\+/g," ")):"Le lien de connexion n’est plus valide.";
}

export function readAuthRedirectSession() {
  const params=readAuthParams();
  const accessToken=params.get("access_token")||"";
  const refreshToken=params.get("refresh_token")||"";
  const type=params.get("type")||"";
  const code=params.get("code")||"";
  if(code) return { code, type: type || "recovery" };
  const hasSession=Boolean(accessToken)&&(!type||["recovery","invite","magiclink","signup"].includes(type));
  return hasSession?{accessToken,refreshToken,type:type||"recovery"}:null;
}

export async function exchangeAuthCode(code) {
  return request("/auth/v1/token?grant_type=authorization_code",{
    method:"POST",
    body:{ code },
  });
}

export function clearAuthRedirectParams() {
  if(typeof window==="undefined") return;
  window.history.replaceState(null,"",window.location.pathname);
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey)||"null"); }
  catch { return null; }
}

function saveSession(session) {
  localStorage.setItem(sessionKey,JSON.stringify(session));
}

export function saveBootstrapSession({ accessToken, refreshToken }) {
  if (!accessToken) return;
  saveSession({
    access_token: accessToken,
    refresh_token: refreshToken || "",
    expires_at: tokenExpiry(accessToken),
  });
  profilePromise = null;
}

async function request(path,{method="GET",body,token,headers={}}={}) {
  const response=await fetch(`${projectUrl}${path}`,{
    method,
    headers:{
      apikey:publishableKey,
      Authorization:`Bearer ${token||publishableKey}`,
      "Content-Type":"application/json",
      ...headers
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await response.text();
  let payload=null;
  try { payload=text?JSON.parse(text):null; } catch { payload=text; }
  if(!response.ok) throw new Error(payload?.msg||payload?.message||payload?.error_description||"Connexion au serveur impossible");
  return payload;
}

async function activeSession() {
  let session = readSession();
  if (!session?.access_token) return null;

  const jwtExp = Number(tokenExpiry(session.access_token) || 0);
  const rawStored = Number(session.expires_at || 0);
  // Certains flux stockent déjà des ms ; normaliser en secondes
  const storedExp = rawStored > 1e12 ? Math.floor(rawStored / 1000) : rawStored;
  const expSec = Math.max(jwtExp, storedExp);
  const msLeft = expSec * 1000 - Date.now();

  if (msLeft > 60_000) return session;

  if (!session.refresh_token) {
    if (msLeft > 0) return session;
    localStorage.removeItem(sessionKey);
    return null;
  }

  try {
    session = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: session.refresh_token },
    });
    saveSession({
      ...session,
      expires_at: session.expires_at || tokenExpiry(session.access_token),
    });
    return session;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
}

export async function getAccessToken() {
  const session = await activeSession();
  return session?.access_token || null;
}

export async function getActiveSession() {
  return activeSession();
}

export async function authFetch(url, options = {}) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Session expirée. Reconnectez-vous avec votre email et votre PIN.");
  }
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

export async function signIn(email,password) {
  const session=await request("/auth/v1/token?grant_type=password",{
    method:"POST",
    body:{email,password}
  });
  saveSession(session);
  profilePromise=null;
  return session;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Réponse serveur invalide. Réessayez dans un instant.");
  }
}

export async function signInWithPin(email, pin) {
  const response = await fetch("/api/auth/pin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), pin: String(pin).trim() }),
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(data.error || "Connexion impossible.");
  saveSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token || "",
    expires_at: data.expires_at || tokenExpiry(data.access_token),
    user: data.user || null,
  });
  profilePromise = null;
  return data;
}

function decodeJwtPayload(accessToken) {
  try {
    return JSON.parse(atob(accessToken.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
  } catch {
    return null;
  }
}

function tokenExpiry(accessToken) {
  const payload=decodeJwtPayload(accessToken);
  return Number(payload?.exp||0)||Math.floor(Date.now()/1000)+3600;
}

function userIdFromAccessToken(accessToken) {
  return decodeJwtPayload(accessToken)?.sub || "";
}

export async function updatePassword(accessToken,refreshToken,password) {
  if(!accessToken&&!refreshToken) throw new Error("RECOVERY_TOKEN_MISSING");

  let session={
    access_token:accessToken||"",
    refresh_token:refreshToken||"",
  };

  if(session.access_token) {
    try {
      const user=await request("/auth/v1/user",{
        method:"PUT",
        token:session.access_token,
        body:{password}
      });
      saveSession({
        ...session,
        expires_at:tokenExpiry(session.access_token),
        user
      });
      profilePromise=null;
      return user;
    } catch (error) {
      const message=String(error?.message||"");
      if(!refreshToken||!/jwt|token|session|expired/i.test(message)) throw error;
    }
  }

  if(refreshToken) {
    session=await request("/auth/v1/token?grant_type=refresh_token",{
      method:"POST",
      body:{refresh_token:refreshToken}
    });
  }
  if(!session.access_token) throw new Error("RECOVERY_TOKEN_MISSING");

  const user=await request("/auth/v1/user",{
    method:"PUT",
    token:session.access_token,
    body:{password}
  });
  saveSession({
    ...session,
    access_token:session.access_token,
    refresh_token:session.refresh_token||refreshToken||"",
    expires_at:session.expires_at||tokenExpiry(session.access_token),
    user
  });
  profilePromise=null;
  return user;
}

export async function inviteUser({email,name,role,modules=[]}) {
  const redirectTo=authRedirectUrl();
  return request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,{
    method:"POST",
    body:{
      email,
      create_user:true,
      data:{full_name:name,role,modules}
    }
  });
}

export async function requestAccessLink(email) {
  const redirectTo=authRedirectUrl();
  const address=String(email||"").trim().toLowerCase();
  if(!address) throw new Error("EMAIL_REQUIRED");

  try {
    await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,{
      method:"POST",
      body:{email:address}
    });
    return {mode:"recovery"};
  } catch {
    await request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,{
      method:"POST",
      body:{email:address,create_user:true,data:{full_name:address.split("@")[0],role:"Admin VIP"}}
    });
    return {mode:"invite"};
  }
}

export async function signOut() {
  const session=readSession();
  try {
    if(session?.access_token) await request("/auth/v1/logout",{method:"POST",token:session.access_token});
  } catch {}
  localStorage.removeItem(sessionKey);
  profilePromise=null;
}

export async function hasCloudSession() {
  return Boolean(await activeSession());
}

export async function getCurrentProfile() {
  if(profilePromise) return profilePromise;
  profilePromise=(async()=>{
    const session=await activeSession();
    const accessToken=session?.access_token||"";
    if(!accessToken) return null;

    try {
      const response=await fetch("/api/auth/me",{
        headers:{Authorization:`Bearer ${accessToken}`},
      });
      const text=await response.text();
      const data=text?JSON.parse(text):null;
      if(data?.authenticated&&data.profile) return data.profile;
    } catch {}

    const userId=session?.user?.id||userIdFromAccessToken(accessToken);
    if(!userId) return null;
    const rows=await request(`/rest/v1/profiles?select=id,organization_id,full_name,email,role,modules,active,onboarding_completed_at,manager&id=eq.${encodeURIComponent(userId)}`,{token:accessToken});
    return rows?.[0]||null;
  })();
  return profilePromise;
}

export async function getCloudState(stateKey) {
  const [session,profile]=await Promise.all([activeSession(),getCurrentProfile()]);
  if(!session||!profile) return {connected:false,value:null};
  const rows=await request(`/rest/v1/crm_state?select=state_value&state_key=eq.${encodeURIComponent(stateKey)}&limit=1`,{token:session.access_token});
  return {connected:true,value:rows?.[0]?.state_value??null,profile};
}

export async function saveCloudState(stateKey,stateValue) {
  const [session,profile]=await Promise.all([activeSession(),getCurrentProfile()]);
  if(!session||!profile) return false;
  await request("/rest/v1/crm_state?on_conflict=organization_id,state_key",{
    method:"POST",
    token:session.access_token,
    headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
    body:{
      organization_id:profile.organization_id,
      state_key:stateKey,
      state_value:stateValue,
      updated_by:profile.id,
      updated_at:new Date().toISOString()
    }
  });
  return true;
}
