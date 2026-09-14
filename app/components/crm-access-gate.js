"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { KeyRound, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import {
  getAccessToken,
  readAuthRedirectSession,
  clearAuthRedirectParams,
  exchangeAuthCode,
  signInWithPin,
  signOut,
  saveBootstrapSession,
} from "../lib/supabase-rest";

const LINK_AUTH_FLAG = "mkl-auth-via-email-link";

export default function CrmAccessGate({ children }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadSession() {
    const token = await getAccessToken();
    if (!token) {
      setSession(null);
      return null;
    }
    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      setSession(null);
      return null;
    }
    if (!response.ok || !data?.authenticated) {
      setSession(null);
      return null;
    }
    setSession(data);
    return data;
  }

  async function fetchMe() {
    const token = await getAccessToken();
    if (!token) throw new Error("Session requise.");
    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
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

      setReady(true);
    })();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      sessionStorage.removeItem(LINK_AUTH_FLAG);
      await signInWithPin(email, pin);
      const me = await fetchMe();
      if (me.activationRequired) {
        window.location.href = "/activation";
        return;
      }
      setSession(me);
    } catch (caught) {
      setError(String(caught?.message || "Identifiants incorrects."));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <div className="access-loading" aria-busy="true" />;

  if (pathname?.startsWith("/activation") || pathname?.startsWith("/reset-password")) return children;

  // CRM uniquement si session PIN complète (pas d’activation en attente)
  if (session?.authenticated && !session.activationRequired) return children;

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
          <p>Utilisez votre email et votre <b>code PIN personnel</b>. Un lien reçu par email ne suffit jamais à ouvrir le CRM.</p>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="crm-email">Adresse email (identifiant)</label>
          <div className="access-password">
            <Mail size={18} />
            <input id="crm-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required />
          </div>
          <label htmlFor="crm-pin">Code PIN personnel</label>
          <div className={`access-password pin-input ${error ? "has-error" : ""}`}>
            <KeyRound size={18} />
            <input
              id="crm-pin"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={pin}
              onChange={event => setPin(event.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          {info && <p className="access-info">{info}</p>}
          {error && <p className="access-error">{error}</p>}
          <button className="access-submit" type="submit" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="spin" /> : "Se connecter"}
          </button>
        </form>
        <footer>Réservé à l’équipe MKL Énergies</footer>
      </section>
    </main>
  );
}

export async function logoutCrm() {
  sessionStorage.removeItem(LINK_AUTH_FLAG);
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  await signOut();
  window.location.reload();
}
