"use client";

import { useEffect, useRef, useState } from "react";
import { getCloudState, saveCloudState } from "./supabase-rest";

/**
 * Stockage local temporaire du prototype.
 *
 * Le hook garde la même interface qu'un état React classique. Il est isolé
 * ici afin que chaque module puisse ensuite passer à une base de données sans
 * devoir réécrire les écrans du CRM.
 */
export function useStored(key, fallback) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);
  const allowCloudWrite = useRef(false);

  useEffect(() => {
    let cancelled=false;
    try {
      const savedValue = window.localStorage.getItem(key);
      if (savedValue) setValue(JSON.parse(savedValue));
    } catch {
      // Une donnée locale endommagée ne doit jamais bloquer l'ouverture du CRM.
    }
    getCloudState(key).then(result=>{
      if(cancelled) return;
      if(result.connected&&result.value!==null) {
        setValue(result.value);
        window.localStorage.setItem(key,JSON.stringify(result.value));
      }
    }).catch(()=>{}).finally(()=>{if(!cancelled)setLoaded(true);});
    return ()=>{cancelled=true;};
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    const timer=setTimeout(()=>{
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Le CRM reste utilisable même si le navigateur refuse le stockage.
    }
      if(!allowCloudWrite.current) {
        allowCloudWrite.current = true;
        return;
      }
      saveCloudState(key,value).catch(()=>{});
    },450);
    return ()=>clearTimeout(timer);
  }, [key, loaded, value]);

  return [value, setValue];
}
