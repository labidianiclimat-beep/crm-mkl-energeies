"use client";

import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  clearAuthRedirectParams,
  exchangeAuthCode,
  getAccessToken,
  readAuthRedirectSession,
  saveBootstrapSession,
  signOut,
} from "../lib/supabase-rest";

export default function ActivationPage() {
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [pin, setPin] = useState("");
  const [personalPin, setPersonalPin] = useState("");
  const [confirmPersonalPin, setConfirmPersonalPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const redirect = readAuthRedirectSession();
      if (redirect?.code) {
        try {
          const session = await exchangeAuthCode(redirect.code);
          saveBootstrapSession({
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          });
          sessionStorage.setItem("mkl-auth-via-email-link", "1");
          clearAuthRedirectParams();
          if (redirect.type === "recovery") {
            window.location.href = "/reset-password";
            return;
          }
        } catch {
          clearAuthRedirectParams();
        }
      } else if (redirect?.accessToken) {
        if (redirect.type === "recovery") {
          saveBootstrapSession(redirect);
          clearAuthRedirectParams();
          window.location.href = "/reset-password";
          return;
        }
        saveBootstrapSession(redirect);
        sessionStorage.setItem("mkl-auth-via-email-link", "1");
        clearAuthRedirectParams();
      }
      const token = await getAccessToken();
      if (!token) {
        setAuthorized(false);
        setReady(true);
        return;
      }
      const me = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(response => response.json()).catch(() => null);
      if (me?.authenticated && !me.activationRequired) {
        // Compte déjà actif : le lien ne doit pas ouvrir le CRM
        await signOut();
        window.location.href = "/";
        return;
      }
      setAuthorized(Boolean(token));
      setReady(true);
    })();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("SESSION_REQUIRED");
      const response = await fetch("/api/activation/complete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pin,
          personalPin,
          confirmPersonalPin,
          password,
          confirmPassword: confirm,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Activation impossible.");
      sessionStorage.removeItem("mkl-auth-via-email-link");
      // Forcer une connexion PIN après activation (lien email ≠ accès CRM)
      await signOut();
      window.location.href = "/?activated=1";
    } catch (caught) {
      setError(String(caught?.message || "Activation impossible."));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <div className="access-loading" aria-busy="true" />;

  if (!authorized) {
    return (
      <main className="access-page">
        <section className="access-card">
          <div className="access-copy">
            <h1>Lien requis</h1>
            <p>Ouvrez d’abord le lien reçu par email pour vérifier votre adresse, puis finalisez votre compte ici avec le PIN temporaire et votre PIN personnel.</p>
            <a className="access-submit" href="/" style={{ display: "inline-flex", marginTop: 18, textDecoration: "none", justifyContent: "center" }}>Retour à la connexion</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="access-page">
      <section className="access-card">
        <header className="access-brand">
          <img src="/mkl-energies.png" alt="MKL Énergies" />
          <p>ACTIVATION DU COMPTE</p>
        </header>
        <div className="access-copy">
          <span className="access-icon"><ShieldCheck size={22} /></span>
          <h1>Finaliser mon compte</h1>
          <p>1) PIN temporaire reçu par email · 2) mot de passe · 3) PIN personnel définitif pour vos prochaines connexions.</p>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="activation-pin">Code PIN temporaire (email)</label>
          <div className={`access-password pin-input ${error ? "has-error" : ""}`}>
            <KeyRound size={18} />
            <input
              id="activation-pin"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={event => setPin(event.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <label htmlFor="activation-password">Nouveau mot de passe</label>
          <div className="access-password">
            <LockKeyhole size={18} />
            <input id="activation-password" type="password" minLength={10} value={password} onChange={event => setPassword(event.target.value)} required />
          </div>
          <label htmlFor="activation-confirm">Confirmer le mot de passe</label>
          <div className="access-password">
            <LockKeyhole size={18} />
            <input id="activation-confirm" type="password" minLength={10} value={confirm} onChange={event => setConfirm(event.target.value)} required />
          </div>
          <label htmlFor="personal-pin">Code PIN personnel (6 chiffres)</label>
          <div className="access-password pin-input">
            <KeyRound size={18} />
            <input
              id="personal-pin"
              inputMode="numeric"
              maxLength={6}
              value={personalPin}
              onChange={event => setPersonalPin(event.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <label htmlFor="personal-pin-confirm">Confirmer le PIN personnel</label>
          <div className="access-password pin-input">
            <KeyRound size={18} />
            <input
              id="personal-pin-confirm"
              inputMode="numeric"
              maxLength={6}
              value={confirmPersonalPin}
              onChange={event => setConfirmPersonalPin(event.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          {error && <p className="access-error">{error}</p>}
          <button className="access-submit" type="submit" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="spin" /> : "Activer mon compte"}
          </button>
        </form>
      </section>
    </main>
  );
}
