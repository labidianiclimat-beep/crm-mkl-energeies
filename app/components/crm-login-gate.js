"use client";

import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";

export default function CrmLoginGate({ children }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then(response => response.json())
      .then(data => {
        setConfigured(data.configured !== false);
        setAuthenticated(Boolean(data.authenticated));
      })
      .catch(() => setConfigured(false))
      .finally(() => setReady(true));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    const value = pin.trim();
    if (value.length < 4) {
      setError("Le code PIN doit contenir au moins 4 chiffres.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Code PIN incorrect.");
        return;
      }
      setAuthenticated(true);
      setPin("");
    } catch {
      setError("Connexion impossible pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return <div className="access-loading" aria-busy="true" />;
  }

  if (authenticated) {
    return children;
  }

  return (
    <main className="access-page">
      <section className="access-card">
        <header className="access-brand">
          <img src="/mkl-energies.png" alt="MKL Énergies" />
          <p>ESPACE CRM</p>
        </header>

        <div className="access-copy">
          <span className="access-icon"><KeyRound size={22} /></span>
          <h1>Accès sécurisé</h1>
          <p>Saisissez le code PIN de l’équipe pour ouvrir le CRM MKL Énergies.</p>
        </div>

        {!configured ? (
          <div className="access-copy" style={{ paddingTop: 0 }}>
            <p className="access-error">Le code PIN n’est pas encore configuré sur le serveur.</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="crm-pin">Code PIN</label>
            <div className={`access-password pin-input ${error ? "has-error" : ""}`}>
              <KeyRound size={18} />
              <input
                id="crm-pin"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                maxLength={6}
                value={pin}
                onChange={event => setPin(event.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </div>
            {error && <p className="access-error">{error}</p>}
            <button className="access-submit" type="submit" disabled={loading}>
              {loading ? <LoaderCircle size={18} className="spin" /> : "Entrer dans le CRM"}
            </button>
          </form>
        )}

        <footer>Réservé à l’équipe MKL Énergies</footer>
      </section>
    </main>
  );
}
