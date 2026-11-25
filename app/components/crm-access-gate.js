"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { KeyRound, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import InstallAppButton from "./install-app-button";
import {
  getAccessToken,
  readAuthRedirectSession,
  clearAuthRedirectParams,
  exchangeAuthCode,
  signInWithPin,
  signOut,
  saveBootstrapSession,
  consumeIdleLogoutMessage,
  sessionIsExpired,
} from "../lib/supabase-rest";
import { SESSION_IDLE_FLAG } from "../lib/session-idle";
import { fieldStoreForUser, isNetworkFailure, readFieldStore, rememberFieldProfile, writeFieldStore } from "../lib/offline-field";
import { persistRememberedEmail, readRememberedEmail } from "../lib/remembered-login";
import { isAdminVip, locksFieldSalesData } from "../lib/permissions";
import { canPreviewTarget, readStoredPreviewUserId, rolePreviewHeaders, setUserPreview } from "../lib/role-preview";
import CaptureGuard from "./capture-guard";

const LINK_AUTH_FLAG = "mkl-auth-via-email-link";
const PUBLIC_PATHS = ["/activation", "/reset-password", "/a-propos", "/confidentialite", "/cgu"];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some(path => pathname === path || pathname?.startsWith(`${path}/`));
}

export default function CrmAccessGate({ children }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [rememberEmail, setRememberEmail] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewUserId, setPreviewUserId] = useState("");
  const [vipPick, setVipPick] = useState(null);

  async function readMe(token) {
    const response = await fetch("/api/auth/me", {
      headers: rolePreviewHeaders({ Authorization: `Bearer ${token}` }),
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { response, data };
  }

  function applyAuthenticated(token, data) {
    const userId = data.profile?.id || userIdFromToken(token);
    if (userId && data.profile) {
      writeFieldStore(rememberFieldProfile(readFieldStore(window.localStorage), userId, data.profile), window.localStorage);
    }
    setSession(data);
    return data;
  }

  async function loadSession() {
    let token = await getAccessToken();
    if (!token) {
      setSession(null);
      return null;
    }
    let response;
    let data;
    try {
      ({ response, data } = await readMe(token));
    } catch (error) {
      if (!isNetworkFailure(error)) {
        setSession(null);
        return null;
      }
      const cached = fieldStoreForUser(readFieldStore(window.localStorage), userIdFromToken(token));
      if (!cached?.profile) {
        setSession(null);
        return null;
      }
      const offlineSession = { authenticated: true, profile: cached.profile, offline: true };
      setSession(offlineSession);
      return offlineSession;
    }
    if (response.status === 401) {
      token = await getAccessToken({ forceRefresh: true });
      if (!token) {
        setSession(null);
        return null;
      }
      try {
        ({ response, data } = await readMe(token));
      } catch (error) {
        if (!isNetworkFailure(error)) {
          setSession(null);
          return null;
        }
        const cached = fieldStoreForUser(readFieldStore(window.localStorage), userIdFromToken(token));
        if (!cached?.profile) {
          setSession(null);
          return null;
        }
        const offlineSession = { authenticated: true, profile: cached.profile, offline: true };
        setSession(offlineSession);
        return offlineSession;
      }
    }
    if (!response.ok || !data?.authenticated) {
      setSession(null);
      return null;
    }
    return applyAuthenticated(token, data);
  }

function userIdFromToken(token) {
  try {
    return JSON.parse(atob(String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.sub || "";
  } catch {
    return "";
  }
}

  async function fetchMe({ preview = true } = {}) {
    const token = await getAccessToken();
    if (!token) throw new Error("Session requise.");
    const headers = preview
      ? rolePreviewHeaders({ Authorization: `Bearer ${token}` })
      : { Authorization: `Bearer ${token}` };
    const response = await fetch("/api/auth/me", { headers });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Réponse serveur invalide. Réessayez dans un instant.");
    }
    if (!response.ok || !data?.authenticated) {
      throw new Error(data?.error || "Session invalide.");
    }
    return data;
  }

  useEffect(() => {
    (async () => {
      if (["/a-propos", "/confidentialite", "/cgu"].some(path => pathname?.startsWith(path))) {
        setReady(true);
        return;
      }
      const remembered = readRememberedEmail(window.localStorage);
      if (remembered) {
        setEmail(remembered);
        setRememberEmail(true);
      }
      setPreviewUserId(readStoredPreviewUserId());
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("activated") === "1") {
        setInfo("Compte activé. Connectez-vous avec votre email et votre PIN personnel.");
        window.history.replaceState({}, "", "/");
      }
      const redirect = readAuthRedirectSession();
      let arrivedViaEmailLink = false;
      if (redirect?.code) {
        try {
          const authSession = await exchangeAuthCode(redirect.code);
          saveBootstrapSession({
            accessToken: authSession.access_token,
            refreshToken: authSession.refresh_token,
          });
          sessionStorage.setItem(LINK_AUTH_FLAG, "1");
          arrivedViaEmailLink = true;
          clearAuthRedirectParams();
          if (redirect.type === "recovery") {
            window.location.href = "/reset-password";
            return;
          }
          if (redirect.type === "invite" || redirect.type === "signup" || redirect.type === "magiclink") {
            // Identity only — activation / PIN still required
          }
        } catch {
          clearAuthRedirectParams();
        }
      } else if (redirect?.accessToken) {
        saveBootstrapSession(redirect);
        sessionStorage.setItem(LINK_AUTH_FLAG, "1");
        arrivedViaEmailLink = true;
        clearAuthRedirectParams();
        if (redirect.type === "recovery") {
          window.location.href = "/reset-password";
          return;
        }
      }

      const data = await loadSession();
      const viaLink = arrivedViaEmailLink || sessionStorage.getItem(LINK_AUTH_FLAG) === "1";

      if (data?.authenticated && data.activationRequired) {
        window.location.href = "/activation";
        return;
      }

      // Lien email seul : jamais d’accès CRM sans saisie du PIN
      if (data?.authenticated && viaLink && !data.activationRequired) {
        sessionStorage.removeItem(LINK_AUTH_FLAG);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        await signOut();
        setSession(null);
        setInfo("Email confirmé. Connectez-vous avec votre adresse et votre code PIN personnel.");
      }

      const idleMessage = consumeIdleLogoutMessage();
      if (idleMessage) setInfo(idleMessage);

      setReady(true);
    })();
  }, []);

  async function loadOrgUsers() {
    const token = await getAccessToken();
    if (!token) return [];
    const response = await fetch("/api/users", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.users) ? data.users : [];
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const typedEmail = String(form.elements.email?.value || "").replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "").trim();
    const typedPin = String(form.elements.pin?.value || "").replace(/\D/g, "").slice(0, 6);
    setEmail(typedEmail);
    setPin(typedPin);
    setError("");
    setInfo("");
    if (!/^\d{6}$/.test(typedPin)) {
      setError("Saisissez les 6 chiffres du code PIN reçu par email.");
      return;
    }
    setLoading(true);
    try {
      sessionStorage.removeItem(LINK_AUTH_FLAG);
      await signInWithPin(typedEmail, typedPin);
      persistRememberedEmail(window.localStorage, typedEmail, rememberEmail);
      const me = await fetchMe({ preview: false });
      if (me.activationRequired) {
        window.location.href = "/activation";
        return;
      }
      if (isAdminVip(me.profile?.realRole || me.profile?.role)) {
        const users = await loadOrgUsers();
        setPreviewUserId(readStoredPreviewUserId());
        setVipPick({ me, users });
        return;
      }
      setUserPreview("");
      setSession(me);
    } catch (caught) {
      setError(String(caught?.message || "Identifiants incorrects."));
    } finally {
      setLoading(false);
    }
  }

  async function enterAsUser(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      setUserPreview(previewUserId);
      const me = await fetchMe();
      if (me.activationRequired) {
        window.location.href = "/activation";
        return;
      }
      setVipPick(null);
      setSession(me);
    } catch (caught) {
      setError(String(caught?.message || "Impossible d’ouvrir cette vue."));
    } finally {
      setLoading(false);
    }
  }

  const isLegalPage = ["/a-propos", "/confidentialite", "/cgu"].some(
    path => pathname === path || pathname?.startsWith(`${path}/`)
  );
  if (isLegalPage) return children;

  if (!ready) return <div className="access-loading" aria-busy="true" />;

  if (isPublicPath(pathname)) return children;

  // CRM uniquement si session PIN complète (pas d’activation en attente)
  if (session?.authenticated && !session.activationRequired) {
    return (
      <SessionIdleGuard>
        <CaptureGuard enabled={locksFieldSalesData(session.profile?.role)} />
        {children}
      </SessionIdleGuard>
    );
  }

  return (
    <main className="access-page">
      <section className="access-card">
        <header className="access-brand">
          <img src="/mkl-energies.png" alt="MKL Énergies" />
          <p>ESPACE CRM</p>
        </header>
        <div className="access-copy">
          <span className="access-icon"><LockKeyhole size={22} /></span>
          <h1>Connexion</h1>
          <p>Utilisez votre email et les <b>6 chiffres du code PIN</b> reçu par email. Un lien reçu par email ne suffit jamais à ouvrir le CRM.</p>
        </div>
        {vipPick ? (
          <form onSubmit={enterAsUser}>
            <label htmlFor="crm-preview">Voir le CRM comme</label>
            <select
              id="crm-preview"
              className="access-preview-select"
              value={previewUserId}
              onChange={event => setPreviewUserId(event.target.value)}
            >
              <option value="">Moi — Admin VIP</option>
              {vipPick.users
                .filter(user => canPreviewTarget(user) && String(user.id || user.supabaseId) !== String(vipPick.me.user.id))
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"))
                .map(user => (
                  <option key={user.id || user.supabaseId} value={user.id || user.supabaseId}>
                    {user.name || user.email || "Sans nom"} — {user.role || "Sans rôle"}{user.authStatus === "En attente d’envoi" ? " — en attente" : ""}
                  </option>
                ))}
            </select>
            <p className="access-preview-hint">Vous restez Admin VIP. Vous voyez les mêmes menus, dossiers et droits que cette personne. Revenez à votre espace quand vous voulez.</p>
            {info && <p className="access-info">{info}</p>}
            {error && <p className="access-error">{error}</p>}
            <button className="access-submit" type="submit" disabled={loading}>
              {loading ? <LoaderCircle size={18} className="spin" /> : "Entrer"}
            </button>
          </form>
        ) : (
        <form onSubmit={submit}>
          <label htmlFor="crm-email">Adresse email (identifiant)</label>
          <div className="access-password">
            <Mail size={18} />
            <input id="crm-email" name="email" type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} defaultValue={email} onInput={event => setEmail(event.target.value)} required />
          </div>
          <label htmlFor="crm-pin">Code PIN à 6 chiffres</label>
          <div className={`access-password pin-input ${error ? "has-error" : ""}`}>
            <KeyRound size={18} />
            <input
              id="crm-pin"
              name="pin"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={6}
              autoFocus={Boolean(email)}
              defaultValue={pin}
              onInput={event => {
                const next = event.target.value.replace(/\D/g, "").slice(0, 6);
                if (next !== event.target.value) event.target.value = next;
                setPin(next);
              }}
              required
            />
          </div>
          <label className="access-remember" htmlFor="crm-remember-email">
            <input
              id="crm-remember-email"
              type="checkbox"
              checked={rememberEmail}
              onChange={event => setRememberEmail(event.target.checked)}
            />
            Mémoriser l’identifiant sur cet appareil
          </label>
          {info && <p className="access-info">{info}</p>}
          {error && <p className="access-error">{error}</p>}
          <button className="access-submit" type="submit" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="spin" /> : "Se connecter"}
          </button>
        </form>
        )}
        <div className="access-install"><InstallAppButton /></div>
        <footer>Réservé à l’équipe MKL Énergies</footer>
      </section>
    </main>
  );
}

export async function logoutCrm({ idle = false } = {}) {
  sessionStorage.removeItem(LINK_AUTH_FLAG);
  sessionStorage.removeItem("mkl-agenda-welcome-shown");
  sessionStorage.removeItem("mkl-ticket-term-shown");
  if (idle) sessionStorage.setItem(SESSION_IDLE_FLAG, "1");
  else sessionStorage.removeItem(SESSION_IDLE_FLAG);
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  await signOut({ keepRolePreview: idle });
  window.location.reload();
}

function SessionIdleGuard({ children }) {
  useEffect(() => {
    let closing = false;

    async function closeIfExpired() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (closing || !sessionIsExpired()) return;
      closing = true;
      await logoutCrm({ idle: true });
    }

    async function refreshToken() {
      if (closing) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (sessionIsExpired()) {
        await closeIfExpired();
        return;
      }
      try {
        await getAccessToken();
      } catch {
        /* un échec réseau laisse l’écran et le formulaire en place */
      }
    }

    const interval = setInterval(closeIfExpired, 15_000);
    const refreshInterval = setInterval(refreshToken, 60_000);
    const onResume = () => {
      if (document.visibilityState === "hidden") return;
      refreshToken();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    closeIfExpired();
    return () => {
      clearInterval(interval);
      clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, []);
  return children;
}
