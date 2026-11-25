"use client";

import { useEffect, useState } from "react";
import { authFetch } from "./supabase-rest";
import { DEFAULT_COMPANY } from "./company";

export function useCompany() {
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await authFetch("/api/company");
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && data.company) setCompany(data.company);
      } catch {
        // garde le défaut MKL
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { company, loaded, setCompany };
}
