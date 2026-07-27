"use client";

const projectUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://rzkwmwtjnwnmmcexwoov.supabase.co";
const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_egPsJQ5koBZHRPhT4dPhFw_Ffiz67B3";
const sessionKey="mkl-supabase-session";
let profilePromise;

export const cloudConfigured=Boolean(projectUrl&&publishableKey);

function readSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey)||"null"); }
  catch { return null; }
}

function saveSession(session) {
  localStorage.setItem(sessionKey,JSON.stringify(session));
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
  let session=readSession();
  if(!session) return null;
  const expiresAt=Number(session.expires_at||0)*1000;
  if(expiresAt-Date.now()>60000) return session;
  if(!session.refresh_token) return null;
  try {
    session=await request("/auth/v1/token?grant_type=refresh_token",{
      method:"POST",
      body:{refresh_token:session.refresh_token}
    });
    saveSession(session);
    return session;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
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

function tokenExpiry(accessToken) {
  try {
    const payload=JSON.parse(atob(accessToken.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    return Number(payload.exp||0);
  } catch {
    return Math.floor(Date.now()/1000)+3600;
  }
}

export async function updatePassword(accessToken,refreshToken,password) {
  if(!accessToken&&!refreshToken) throw new Error("RECOVERY_TOKEN_MISSING");

  // The recovery link already contains an authenticated recovery access token.
  // Use it directly: refresh tokens are single-use and rotating one here can
  // invalidate the recovery session before the password update is submitted.
  let session={
    access_token:accessToken||"",
    refresh_token:refreshToken||""
  };
  if(!session.access_token&&refreshToken) {
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
  const redirectTo=typeof window==="undefined"?"":`${window.location.origin}/`;
  return request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,{
    method:"POST",
    body:{
      email,
      create_user:true,
      data:{full_name:name,role,modules}
    }
  });
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
    if(!session?.user?.id) return null;
    const rows=await request(`/rest/v1/profiles?select=id,organization_id,full_name,email,role,modules,active&id=eq.${encodeURIComponent(session.user.id)}`,{token:session.access_token});
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
