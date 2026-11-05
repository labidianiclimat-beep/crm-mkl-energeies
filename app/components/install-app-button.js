"use client";

import { useEffect, useState } from "react";
import { Share, Smartphone, X } from "lucide-react";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

export default function InstallAppButton({ compact = false }) {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    const onPrompt = event => {
      event.preventDefault();
      setDeferred(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setHelp(true);
  }

  return (
    <>
      <button type="button" className={compact ? "install-app-button is-compact" : "install-app-button"} onClick={install}>
        <Smartphone size={18} />
        <span>
          <b>Télécharger l’application</b>
          <small>iPhone et Android — logo MKL</small>
        </span>
      </button>
      {help && (
        <div className="backdrop" onClick={() => setHelp(false)}>
          <div className="modal install-app-help" onClick={event => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setHelp(false)}><X /></button>
            <div className="modal-icon"><Smartphone /></div>
            <h2>Installer MKL CRM</h2>
            <p>Le CRM s’ouvre ensuite comme une application, avec le logo MKL sur l’écran d’accueil.</p>
            {isIosDevice() ? (
              <ol>
                <li>Ouvrez cette page dans <b>Safari</b></li>
                <li>Appuyez sur <b>Partager</b> <Share size={14} /></li>
                <li>Choisissez <b>Sur l’écran d’accueil</b></li>
                <li>Validez <b>Ajouter</b></li>
              </ol>
            ) : (
              <ol>
                <li>Ouvrez le menu du navigateur (⋮)</li>
                <li>Choisissez <b>Ajouter à l’écran d’accueil</b> ou <b>Installer l’application</b></li>
                <li>Validez — l’icône MKL apparaît parmi vos applis</li>
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}
