"use client";

import {
  REFRESH_AHEAD_MS,
  SESSION_IDLE_FLAG,
  SESSION_IDLE_MESSAGE,
  accessTokenMsLeft,
  isSessionExpired,
  nextLastActivityAt,
  sessionStartedAt,
} from "./session-idle.js";
import { fieldStoreForUser, isNetworkFailure, readFieldStore, rememberFieldProfile, writeFieldStore } from "./offline-field.js";
import { clearRolePreview, rolePreviewHeaders } from "./role-preview.js";

const projectUrl=String(process.env.NEXT_PUBLIC_SUPABASE_URL||"").trim();
const publishableKey=String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"").trim();
const sessionKey="mkl-supabase-session";
let profilePromise;
let refreshFlight;

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

function freeLocalStorageForSession() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith("mkl-") && key !== sessionKey) keys.push(key);
  }
  keys.forEach(key => localStorage.removeItem(key));
}

function saveSession(session) {
  if (!session) {
    localStorage.removeItem(sessionKey);
    return;
  }
  const previous = readSession();
  const payload = JSON.stringify({
    ...session,
    last_activity_at: Number(session.last_activity_at || previous?.last_activity_at || Date.now()),
    connected_at: Number(session.connected_at || previous?.connected_at || Date.now()),
  });
  try {
    localStorage.setItem(sessionKey, payload);
  } catch {
    freeLocalStorageForSession();
    try {
      localStorage.setItem(sessionKey, payload);
    } catch {
      throw new Error("Cet appareil n’a plus de place pour ouvrir la session. Rechargez la page, puis réessayez.");
    }
  }
}

function markIdleLogout() {
  try { sessionStorage.setItem(SESSION_IDLE_FLAG, "1"); } catch {}
}

function clearExpiredIdleSession() {
  markIdleLogout();
  localStorage.removeItem(sessionKey);
  profilePromise = null;
}

export function markSessionActivity(now = Date.now()) {
  const session = readSession();
  if (!session?.access_token) return;
  saveSession({ ...session, last_activity_at: now });
}

export function consumeIdleLogoutMessage() {
  try {
    if (sessionStorage.getItem(SESSION_IDLE_FLAG) !== "1") return "";
    sessionStorage.removeItem(SESSION_IDLE_FLAG);
    return SESSION_IDLE_MESSAGE;
  } catch {
    return "";
  }
}

export function sessionIsExpired(now = Date.now()) {
  return isSessionExpired(readSession(), now);
}

export function sessionIsIdle(now = Date.now()) {
  return sessionIsExpired(now);
}

function sessionMsLeft(session, now = Date.now()) {
  const jwtExp = Number(decodeJwtPayload(session?.access_token)?.exp || 0);
  return accessTokenMsLeft({ jwtExp, expiresAt: session?.expires_at }, now);
}

export function saveBootstrapSession({ accessToken, refreshToken }) {
  if (!accessToken) return;
  saveSession({
    access_token: accessToken,
    refresh_token: refreshToken || "",
    expires_at: tokenExpiry(accessToken),
    last_activity_at: Date.now(),
    connected_at: Date.now(),
  });
  profilePromise = null;
}

async function request(path,{method="GET",body,token,headers={}}={}) {
  if(!projectUrl||!publishableKey) throw new Error("Configuration Supabase incomplète.");
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

async function performRefresh(session) {
  const previousToken = session.access_token;
  const last = session.last_activity_at;
  const connectedAt = session.connected_at;
  try {
    const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: session.refresh_token },
    });
    const next = {
      ...refreshed,
      expires_at: refreshed.expires_at || tokenExpiry(refreshed.access_token),
      last_activity_at: last,
      connected_at: connectedAt,
    };
    saveSession(next);
    return next;
  } catch (error) {
    const current = readSession();
    if (current?.access_token && current.access_token !== previousToken) return current;
    if (isNetworkFailure(error)) return current || session;
    if (!isSessionExpired(current || session)) return current || session;
    localStorage.removeItem(sessionKey);
    profilePromise = null;
    return null;
  }
}

function refreshStoredSession(session) {
  if (refreshFlight) return refreshFlight;
  refreshFlight = performRefresh(session).finally(() => {
    refreshFlight = null;
  });
  return refreshFlight;
}

async function activeSession({ forceRefresh = false } = {}) {
  let session = readSession();
  if (!session?.access_token) return null;

  const lastActivityAt = nextLastActivityAt(session);
  const connectedAt = sessionStartedAt(session);
  if (!session.last_activity_at || !session.connected_at) {
    session = { ...session, last_activity_at: lastActivityAt, connected_at: connectedAt };
    saveSession(session);
  }
  if (isSessionExpired(session)) {
    clearExpiredIdleSession();
    return null;
  }

  const msLeft = sessionMsLeft(session);
  const due = forceRefresh || msLeft <= REFRESH_AHEAD_MS;
  if (!due) return session;

  if (!session.refresh_token) return session;

  return refreshStoredSession(session);
}

export async function getAccessToken({ forceRefresh = false } = {}) {
  const session = await activeSession({ forceRefresh });
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
  const headers = rolePreviewHeaders(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

export async function signIn(email,password) {
  const session=await request("/auth/v1/token?grant_type=password",{
    method:"POST",
    body:{email,password}
  });
  saveSession({ ...session, connected_at: Date.now(), last_activity_at: Date.now() });
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
    last_activity_at: Date.now(),
    connected_at: Date.now(),
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

export async function signOut({ keepRolePreview = false } = {}) {
  const session=readSession();
  try {
    if(session?.access_token) await request("/auth/v1/logout",{method:"POST",token:session.access_token});
  } catch {}
  localStorage.removeItem(sessionKey);
  profilePromise=null;
  try { localStorage.removeItem("mkl-field-store-v1"); } catch {}
  if (!keepRolePreview) clearRolePreview();
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
        headers:rolePreviewHeaders({Authorization:`Bearer ${accessToken}`}),
      });
      const text=await response.text();
      const data=text?JSON.parse(text):null;
      if(data?.authenticated&&data.profile) {
        const userId=data.profile.id||session?.user?.id||userIdFromAccessToken(accessToken);
        if(typeof localStorage!=="undefined"&&userId) {
          writeFieldStore(rememberFieldProfile(readFieldStore(localStorage), userId, data.profile), localStorage);
        }
        return data.profile;
      }
    } catch (error) {
      if(isNetworkFailure(error)&&typeof localStorage!=="undefined") {
        const userId=session?.user?.id||userIdFromAccessToken(accessToken);
        const cached=fieldStoreForUser(readFieldStore(localStorage), userId);
        if(cached?.profile) return cached.profile;
      }
    }

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
