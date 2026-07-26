"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { cloudConfigured, hasCloudSession, signIn, signOut, updatePassword } from "../lib/supabase-rest";

export default function CrmAccessGate({ children }) {
  const [ready,setReady]=useState(false);
  const [unlocked,setUnlocked]=useState(false);
  const [email,setEmail]=useState("labidianiclimat@gmail.com");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [recoveryToken,setRecoveryToken]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [error,setError]=useState("");
  const [submitting,setSubmitting]=useState(false);

  useEffect(()=>{
    const recovery=new URLSearchParams(window.location.hash.slice(1));
    if(["recovery","invite","magiclink","signup"].includes(recovery.get("type"))&&recovery.get("access_token")) {
      setRecoveryToken(recovery.get("access_token"));
    }
    hasCloudSession().then(setUnlocked).finally(()=>setReady(true));
    const logout=async()=>{
      await signOut();
      setUnlocked(false);
      setPassword("");
    };
    window.addEventListener("mkl-crm-logout",logout);
    return ()=>window.removeEventListener("mkl-crm-logout",logout);
  },[]);

  const submit=async event=>{
    event.preventDefault();
    if(!cloudConfigured) return setError("La connexion en ligne n’est pas encore configurée.");
    setSubmitting(true);
    try {
      await signIn(email.trim(),password);
      setUnlocked(true);
      setError("");
    } catch(error) {
      const message=String(error?.message||"");
      setError(/fetch|serveur|network|connexion/i.test(message)
        ?"Le service de connexion est momentanément inaccessible."
        :"Adresse e-mail ou mot de passe incorrect.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  const submitRecovery=async event=>{
    event.preventDefault();
    if(password.length<10) return setError("Le mot de passe doit contenir au moins 10 caractères.");
    if(password!==confirmPassword) return setError("Les deux mots de passe sont différents.");
    setSubmitting(true);
    try {
      await updatePassword(recoveryToken,password);
      await signIn(email.trim(),password);
      window.history.replaceState(null,"",window.location.pathname);
      setUnlocked(true);
      setError("");
    } catch {
      setError("Le lien a expiré ou le mot de passe n’a pas pu être modifié.");
    } finally {
      setSubmitting(false);
    }
  };

  if(!ready) return <div className="access-loading" aria-label="Chargement"/>;
  if(unlocked&&!recoveryToken) return children;

  return <main className="access-page">
    <section className="access-card">
      <div className="access-brand">
        <img src="/mkl-energies.png" alt="MKL Énergies"/>
        <p>ESPACE CRM SÉCURISÉ</p>
      </div>
      <div className="access-copy">
        <span className="access-icon"><LockKeyhole size={22}/></span>
        <h1>{recoveryToken?"Nouveau mot de passe":"Bienvenue"}</h1>
        <p>{recoveryToken?"Choisissez un mot de passe d’au moins 10 caractères.":"Connectez-vous avec votre compte MKL Énergies."}</p>
      </div>
      <form onSubmit={recoveryToken?submitRecovery:submit}>
        {!recoveryToken&&<>
          <label htmlFor="crm-email">Adresse e-mail</label>
          <div className="access-password">
            <Mail size={18}/>
            <input id="crm-email" type="email" value={email}
              onChange={event=>{setEmail(event.target.value);setError("");}}
              placeholder="nom@mkl-energies.fr" autoComplete="username" required/>
          </div>
        </>}
        <label htmlFor="crm-password">{recoveryToken?"Nouveau mot de passe":"Mot de passe"}</label>
        <div className={`access-password ${error?"has-error":""}`}>
          <LockKeyhole size={18}/>
          <input id="crm-password" type={showPassword?"text":"password"} value={password}
            onChange={event=>{setPassword(event.target.value);setError("");}}
            placeholder={recoveryToken?"10 caractères minimum":"Votre mot de passe"}
            autoComplete={recoveryToken?"new-password":"current-password"} required autoFocus/>
          <button type="button" onClick={()=>setShowPassword(value=>!value)}
            aria-label={showPassword?"Masquer le mot de passe":"Afficher le mot de passe"}>
            {showPassword?<EyeOff size={18}/>:<Eye size={18}/>}
          </button>
        </div>
        {recoveryToken&&<>
          <label htmlFor="crm-password-confirm">Confirmer le mot de passe</label>
          <div className={`access-password ${error?"has-error":""}`}>
            <LockKeyhole size={18}/>
            <input id="crm-password-confirm" type={showPassword?"text":"password"}
              value={confirmPassword}
              onChange={event=>{setConfirmPassword(event.target.value);setError("");}}
              placeholder="Confirmez le mot de passe" autoComplete="new-password" required/>
          </div>
        </>}
        {error&&<p className="access-error" role="alert">{error}</p>}
        <button className="access-submit" type="submit" disabled={submitting}>
          {submitting?"Validation…":recoveryToken?"Modifier le mot de passe":"Accéder au CRM"}
        </button>
      </form>
      <footer>MKL Énergies · Votre énergie, notre expertise</footer>
    </section>
  </main>;
}
