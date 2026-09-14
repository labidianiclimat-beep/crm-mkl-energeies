"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import {
  clearAuthRedirectParams,
  exchangeAuthCode,
  getActiveSession,
  readAuthRedirectError,
  readAuthRedirectSession,
  saveBootstrapSession,
  updatePassword,
} from "../lib/supabase-rest";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const redirectError = readAuthRedirectError();
        if (redirectError) {
          setError(redirectError);
          setReady(true);
          return;
        }

        const redirect = readAuthRedirectSession();
        if (redirect?.code) {
          const session = await exchangeAuthCode(redirect.code);
          saveBootstrapSession({
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          });
          clearAuthRedirectParams();
        } else if (redirect?.accessToken) {
          saveBootstrapSession(redirect);
          clearAuthRedirectParams();
        }

        const session = await getActiveSession();
        setAuthorized(Boolean(session?.access_token));
      } catch (caught) {
        setError(String(caught?.message || "Ce lien de réinitialisation n’est plus valide."));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await getActiveSession();
      if (!session?.access_token) {
        throw new Error("Ce lien a expiré. Demandez un nouveau lien de réinitialisation.");
      }
      if (password.length < 10) {
        throw new Error("Le mot de passe doit contenir au moins 10 caractères.");
      }
      if (password !== confirm) {
        throw new Error("Les mots de passe ne correspondent pas.");
      }

      await updatePassword(session.access_token, session.refresh_token, password);

      const bootstrap = await fetch("/api/auth/bootstrap-profile", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await bootstrap.json().catch(() => ({}));
      if (!bootstrap.ok) {
        throw new Error(data.error || "Mot de passe enregistré, mais activation du profil impossible.");
      }

      window.location.href = "/";
    } catch (caught) {
      setError(String(caught?.message || "Réinitialisation impossible."));
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
            <h1>Lien expiré</h1>
            <p>{error || "Ce lien de réinitialisation n’est plus valide. Demandez-en un nouveau depuis Supabase ou contactez votre administrateur."}</p>
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
          <p>RÉINITIALISATION</p>
        </header>
        <div className="access-copy">
          <span className="access-icon"><LockKeyhole size={22} /></span>
          <h1>Nouveau mot de passe</h1>
          <p>Choisissez votre nouveau mot de passe. Aucun code PIN n’est requis pour cette opération.</p>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="reset-password">Nouveau mot de passe</label>
          <div className="access-password">
            <LockKeyhole size={18} />
            <input id="reset-password" type="password" minLength={10} value={password} onChange={event => setPassword(event.target.value)} required />
          </div>
          <label htmlFor="reset-confirm">Confirmer le mot de passe</label>
          <div className="access-password">
            <LockKeyhole size={18} />
            <input id="reset-confirm" type="password" minLength={10} value={confirm} onChange={event => setConfirm(event.target.value)} required />
          </div>
          {error && <p className="access-error">{error}</p>}
          <button className="access-submit" type="submit" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="spin" /> : "Enregistrer et se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}
