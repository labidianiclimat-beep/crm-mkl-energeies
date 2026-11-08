"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "./supabase-rest";
import {
  collectDeletedIds,
  DEFAULT_ARTICLE_GROUPS,
  isReadOnlyOrgStateKey,
  readLocalOrgState,
  stripDemoOrgRecords,
} from "./org-state";

export const ORG_STATE_ERROR_EVENT = "mkl-org-state-error";
export const ORG_STATE_SYNC_EVENT = "mkl-org-state-sync";

const orgRevisions = new Map();

export function emitOrgStateSync(key, status, message) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ORG_STATE_SYNC_EVENT, {
    detail: { key, status, message: message || "" },
  }));
}

function emitOrgStateError(key, action, message) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ORG_STATE_ERROR_EVENT, {
    detail: { key, action, message: String(message || "Enregistrement partagé impossible") },
  }));
}

async function fetchOrgState(key) {
  const response = await authFetch(`/api/org-state?key=${encodeURIComponent(key)}`);
  const data = await response.json().catch(() => ({}));
  if (response.status === 403) {
    const error = new Error(data.error || "Accès refusé à cet état partagé.");
    error.code = "FORBIDDEN";
    throw error;
  }
  if (!response.ok) throw new Error(data.error || "État indisponible");
  orgRevisions.set(key, data.updatedAt || "");
  return stripDemoOrgRecords(key, data.value);
}

async function persistOrgState(key, value, deletedIds = []) {
  const response = await authFetch("/api/org-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      value,
      deletedIds,
      expectedUpdatedAt: orgRevisions.get(key) || "",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 409) {
    orgRevisions.set(key, data.updatedAt || "");
    const error = new Error(data.error || "Cette liste vient d’être modifiée par quelqu’un d’autre. L’écran a été rechargé.");
    error.code = "CONFLICT";
    error.value = Array.isArray(data.value) ? stripDemoOrgRecords(key, data.value) : [];
    throw error;
  }
  if (!response.ok) {
    throw new Error(data.error || "Enregistrement impossible");
  }
  if (data.updatedAt) orgRevisions.set(key, data.updatedAt);
  return data;
}

export async function loadSharedOrgState(key) {
  try {
    const remote = await fetchOrgState(key);
    const list = Array.isArray(remote) ? remote : [];
    try { window.localStorage.setItem(key, JSON.stringify(list)); } catch {}
    if (list.length) return list;
    if (key === "mkl-article-groups") return DEFAULT_ARTICLE_GROUPS;
    return [];
  } catch (error) {
    if (error.code === "FORBIDDEN") {
      if (key === "mkl-article-groups") return DEFAULT_ARTICLE_GROUPS;
      return [];
    }
    emitOrgStateError(key, "load", error.message);
    const recovered = stripDemoOrgRecords(key, readLocalOrgState(key));
    if (recovered.length) return recovered;
    if (key === "mkl-article-groups") return DEFAULT_ARTICLE_GROUPS;
    return [];
  }
}

export async function saveSharedOrgState(key, value, { deletedIds } = {}) {
  const cleaned = stripDemoOrgRecords(key, value);
  if (isReadOnlyOrgStateKey(key)) return cleaned;
  try { window.localStorage.setItem(key, JSON.stringify(cleaned)); } catch {}
  await persistOrgState(key, cleaned, deletedIds);
  return cleaned;
}

export function useOrgState(key) {
  const [value, setValue] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const allowWrite = useRef(false);
  const previous = useRef([]);

  useEffect(() => {
    let cancelled = false;
    allowWrite.current = false;
    loadSharedOrgState(key)
      .then(next => {
        if (cancelled) return;
        previous.current = next;
        setValue(next);
      })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      if (!allowWrite.current) {
        allowWrite.current = true;
        previous.current = value;
        return;
      }
      const deletedIds = collectDeletedIds(previous.current, value);
      previous.current = value;
      emitOrgStateSync(key, "saving");
      saveSharedOrgState(key, value, { deletedIds })
        .then(() => emitOrgStateSync(key, "saved"))
        .catch(error => {
          if (error.code === "CONFLICT" && Array.isArray(error.value)) {
            previous.current = error.value;
            try { window.localStorage.setItem(key, JSON.stringify(error.value)); } catch {}
            setValue(error.value);
          }
          emitOrgStateError(key, "save", error.message);
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [key, loaded, value]);

  return [value, setValue];
}
