"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

function recognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function DevisVoiceBar({ message = "", choices = [], onTranscript, onChoose }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState("");
  const recRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => () => {
    recRef.current?.abort?.();
  }, []);

  function stop() {
    recRef.current?.stop?.();
    setListening(false);
  }

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("La commande vocale n’est pas disponible dans ce navigateur. Utilisez Chrome ou Safari.");
      return;
    }
    recRef.current?.abort?.();
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = false;
    let applied = false;
    rec.onresult = event => {
      const text = [...event.results].map(result => result[0]?.transcript || "").join(" ").trim();
      setHeard(text);
      const final = event.results[event.results.length - 1]?.isFinal;
      if (final && text && !applied) {
        applied = true;
        onTranscriptRef.current(text);
      }
    };
    rec.onerror = event => {
      const code = event?.error || "";
      if (code === "not-allowed" || code === "service-not-allowed") setError("Autorisez le micro pour dicter le devis.");
      else if (code === "no-speech") setError("Je n’ai rien entendu. Réessayez.");
      else if (code !== "aborted") setError("La dictée a été interrompue.");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError("");
    setHeard("");
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setError("Le micro est déjà utilisé.");
    }
  }

  return (
    <div className="devis-voice">
      <div className="devis-voice-row">
        <button
          type="button"
          className={`devis-voice-mic${listening ? " is-listening" : ""}`}
          aria-pressed={listening}
          aria-label={listening ? "Arrêter la dictée" : "Dicter le devis"}
          onClick={listening ? stop : start}
        >
          <Mic size={16} />
          {listening ? "Écoute…" : "Dicter le devis"}
        </button>
        <p className="devis-voice-hint">Client, groupe d’articles, paiement, puis voir le PDF.</p>
      </div>
      {heard ? <p className="devis-voice-heard" aria-live="polite">Entendu : « {heard} »</p> : null}
      {error ? <p className="devis-voice-message" role="status">{error}</p> : null}
      {message ? <p className="devis-voice-message" role="status">{message}</p> : null}
      {choices.length > 0 && (
        <div className="devis-voice-choices">
          {choices.map(choice => (
            <button type="button" key={`${choice.kind}-${choice.id}`} onClick={() => onChoose(choice)}>
              {choice.label}
              {choice.detail ? <small>{choice.detail}</small> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
