"use client";

import { useEffect, useRef, useState } from "react";
import { stripInstallationFinance } from "./installation-finance";
import { installationTeamsEmbedFiles } from "./installation-planning";
import { collectDeletedIds, stripDemoOrgRecords } from "./org-state";
import { RECORD_TABLE_BY_ORG_KEY } from "./record-table-kinds";
import { offloadSubcontractorDocuments } from "./subcontractor-file-upload";
import { authFetch } from "./supabase-rest";
import { emitOrgStateSync, loadSharedOrgState, ORG_STATE_ERROR_EVENT, saveSharedOrgState } from "./use-org-state";

function publicInstallations(orgStateKey, records) {
  if (orgStateKey !== "mkl-installations" || !Array.isArray(records)) return records;
  return records.map(stripInstallationFinance);
}

function emitError(key, action, message) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ORG_STATE_ERROR_EVENT, {
    detail: { key, action, message: String(message || "Enregistrement partagé impossible") },
  }));
}

async function fetchRecordTable(kind) {
  const response = await authFetch(`/api/record-tables?kind=${encodeURIComponent(kind)}`);
  const data = await response.json().catch(() => ({}));
  if (response.status === 403) {
    const error = new Error(data.error || "Accès refusé à ces dossiers.");
    error.code = "FORBIDDEN";
    throw error;
  }
  if (response.status === 501 || data.missing) {
    const error = new Error("MISSING_TABLE");
    error.code = "MISSING_TABLE";
    throw error;
  }
  if (!response.ok) throw new Error(data.error || "Dossiers indisponibles");
  return Array.isArray(data.value) ? data.value : [];
}

async function persistRecordTable(kind, value, deletedIds = []) {
  const response = await authFetch("/api/record-tables", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, value, deletedIds }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 403) {
    const error = new Error(data.error || "Accès refusé à ces dossiers.");
    error.code = "FORBIDDEN";
    throw error;
  }
  if (response.status === 501 || data.missing) {
    const error = new Error("MISSING_TABLE");
    error.code = "MISSING_TABLE";
    throw error;
  }
  if (!response.ok) throw new Error(data.error || "Enregistrement impossible");
  return Array.isArray(data.value) ? data.value : value;
}

export async function loadSharedRecordsState(orgStateKey) {
  const kind = RECORD_TABLE_BY_ORG_KEY[orgStateKey];
  if (!kind) {
    return { value: await loadSharedOrgState(orgStateKey), forbidden: false };
  }
  try {
    const remote = publicInstallations(orgStateKey, await fetchRecordTable(kind));
    try { window.localStorage.setItem(orgStateKey, JSON.stringify(remote)); } catch {}
    return { value: remote, forbidden: false };
  } catch (error) {
    if (error.code === "FORBIDDEN") return { value: [], forbidden: true };
    if (error.code === "MISSING_TABLE") {
      return { value: publicInstallations(orgStateKey, await loadSharedOrgState(orgStateKey)), forbidden: false };
    }
    emitError(orgStateKey, "load", error.message);
    return { value: publicInstallations(orgStateKey, await loadSharedOrgState(orgStateKey)), forbidden: false };
  }
}

export async function loadSharedRecords(orgStateKey) {
  const { value } = await loadSharedRecordsState(orgStateKey);
  return value;
}

export async function saveSharedRecords(orgStateKey, value, { deletedIds } = {}) {
  const kind = RECORD_TABLE_BY_ORG_KEY[orgStateKey];
  let cleaned = publicInstallations(orgStateKey, stripDemoOrgRecords(orgStateKey, value));
  if (orgStateKey === "mkl-installation-teams") {
    cleaned = await offloadSubcontractorDocuments(cleaned);
  }
  if (!kind) return saveSharedOrgState(orgStateKey, cleaned, { deletedIds });
  try { window.localStorage.setItem(orgStateKey, JSON.stringify(cleaned)); } catch {}
  try {
    return publicInstallations(orgStateKey, await persistRecordTable(kind, cleaned, deletedIds));
  } catch (error) {
    if (error.code === "FORBIDDEN") throw new Error(error.message || "Accès refusé à ces dossiers.");
    if (error.code === "MISSING_TABLE") {
      return saveSharedOrgState(orgStateKey, cleaned, { deletedIds });
    }
    throw error;
  }
}

export function useRecordTable(orgStateKey) {
  const [value, setValue] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const allowWrite = useRef(false);
  const writable = useRef(true);
  const previous = useRef([]);

  useEffect(() => {
    let cancelled = false;
    allowWrite.current = false;
    writable.current = true;
    loadSharedRecordsState(orgStateKey)
      .then(({ value: next, forbidden }) => {
        if (cancelled) return;
        writable.current = !forbidden;
        previous.current = next;
        setValue(next);
      })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [orgStateKey]);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      if (!allowWrite.current) {
        allowWrite.current = true;
        previous.current = value;
        return;
      }
      if (!writable.current) {
        previous.current = value;
        return;
      }
      const deletedIds = collectDeletedIds(previous.current, value);
      previous.current = value;
      emitOrgStateSync(orgStateKey, "saving");
      const embeddedFiles = orgStateKey === "mkl-installation-teams" && installationTeamsEmbedFiles(value);
      saveSharedRecords(orgStateKey, value, { deletedIds })
        .then(saved => {
          if (embeddedFiles && Array.isArray(saved) && !installationTeamsEmbedFiles(saved) && previous.current === value) {
            previous.current = saved;
            setValue(saved);
          }
          emitOrgStateSync(orgStateKey, "saved");
        })
        .catch(error => {
          if (error.code === "CONFLICT" && Array.isArray(error.value)) {
            previous.current = error.value;
            try { window.localStorage.setItem(orgStateKey, JSON.stringify(error.value)); } catch {}
            setValue(error.value);
          }
          emitError(orgStateKey, "save", error.message);
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [orgStateKey, loaded, value]);

  return [value, setValue];
}
