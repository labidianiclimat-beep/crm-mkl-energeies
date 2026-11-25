"use client";

import { useEffect, useMemo, useState } from "react";
import ClientNumberField from "./client-number-field";
import DirectorySearch from "./directory-search";
import { EXISTING_CLIENT_MESSAGE } from "../lib/existing-client";
import { authFetch } from "../lib/supabase-rest";
import { splitPersonName } from "../lib/devis";
import { visibleProspects } from "../lib/prospect-to-client";
import { formatClientNumber } from "../lib/client-number";
import { commitRecipient, formatProspectNumber, personFromProspectNumber, PROSPECT_NUMBER_PREFIX } from "../lib/prospect-number";

function prospectDirectoryItem(prospect) {
  const split = splitPersonName(prospect.name);
  return {
    ...prospect,
    id: `prospect:${prospect.id}`,
    realId: prospect.id,
    directoryKind: "prospect",
    badge: "Prospect",
    firstName: split.firstName,
    lastName: split.lastName,
    contact: prospect.name,
  };
}

export function ExistingClientGate({ clients = [], title, onSelect, allowCreate = false, allowProspect = false }) {
  return (
    <section className="paper thermal-paper existing-client-gate">
      <h2>{title}</h2>
      <p className="directory-search-help">{allowProspect ? "Le numéro client, le numéro prospect, ou le nom et le prénom. Le formulaire s’ouvre dès que la fiche est trouvée." : "Le numéro client, le numéro prospect, ou le nom et le prénom. Le document s’ouvre une fois la fiche client choisie."}</p>
      <RecipientConnect clients={clients} allowCreate={allowCreate} allowProspect={allowProspect} onSelect={item => { if (item) onSelect(item); }} />
    </section>
  );
}

export default function RecipientConnect({
  clients = [],
  prospects = null,
  onSelect,
  immediate = false,
  allowCreate = false,
  allowProspect = false,
  showChoice = true,
}) {
  const [loaded, setLoaded] = useState([]);
  const [draft, setDraft] = useState(null);
  const [prospectOnly, setProspectOnly] = useState(null);
  const [locked, setLocked] = useState(false);
  const lookupProspects = useMemo(() => {
    const map = new Map();
    for (const item of [...(prospects || []), ...loaded]) {
      if (item?.id) map.set(String(item.id), item);
    }
    return [...map.values()];
  }, [prospects, loaded]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/prospects?includeConverted=1")
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setLoaded(Array.isArray(data.prospects) ? data.prospects : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const directoryItems = useMemo(() => [
    ...(clients || []).map(client => ({
      ...client,
      id: `client:${client.id}`,
      realId: client.id,
      directoryKind: "client",
      badge: "Client",
    })),
    ...visibleProspects(lookupProspects).map(prospectDirectoryItem),
  ], [clients, lookupProspects]);

  function accept(person) {
    setProspectOnly(null);
    setDraft(person);
    setLocked(true);
    onSelect?.(person);
  }

  function choose(item) {
    const person = commitRecipient(item, clients, lookupProspects);
    if (!person) {
      if (locked) return;
      setDraft(null);
      setProspectOnly(null);
      onSelect?.(null);
      return;
    }
    if (person.directoryKind === "prospect" && !allowProspect) {
      setDraft(null);
      setProspectOnly(person);
      setLocked(true);
      onSelect?.(null);
      return;
    }
    accept(person);
  }

  function reset() {
    setDraft(null);
    setProspectOnly(null);
    setLocked(false);
    onSelect?.(null);
  }

  if (locked) {
    const person = draft || prospectOnly;
    const clientNumber = formatClientNumber(person?.clientNumber);
    const prospectNumber = formatProspectNumber(person?.prospectNumber);
    return (
      <div className="recipient-connect">
        {(showChoice || prospectOnly) ? (
          <article className="document-window-choice">
            <span>{person?.directoryKind === "prospect" ? "Prospect retenu" : "Client retenu"}</span>
            <b>{person?.name}</b>
            {clientNumber ? <small>{clientNumber}</small> : null}
            {prospectNumber ? <small>{prospectNumber}</small> : null}
            {prospectOnly ? <p className="client-number-miss">{EXISTING_CLIENT_MESSAGE}</p> : null}
          </article>
        ) : null}
        <button type="button" className="secondary" onClick={reset}>Changer de fiche</button>
      </div>
    );
  }

  return (
    <div className="recipient-connect" onKeyDown={event => {
      if (event.key === "Enter" && event.target?.tagName === "INPUT") event.preventDefault();
    }}>
      <div className="document-window-hero">
        <ClientNumberField variant="hero" clients={clients} clientId="" onSelect={choose} />
      </div>
      <p className="document-window-or">ou</p>
      <div className="document-window-hero">
        <ClientNumberField
          variant="hero"
          clients={lookupProspects}
          clientId=""
          prefix={PROSPECT_NUMBER_PREFIX}
          label="Numéro prospect"
          numberKey="prospectNumber"
          formatNumber={formatProspectNumber}
          findNumber={(list, input) => personFromProspectNumber(list, clients, input)}
          missMessage="Aucun prospect avec ce numéro."
          onSelect={choose}
        />
      </div>
      <p className="document-window-or">ou</p>
      <DirectorySearch
        items={directoryItems}
        kind="recipient"
        allowCreate={allowCreate}
        omitAddress
        showSelected={false}
        value=""
        onChange={choose}
      />
      {showChoice && draft ? (
        <article className="document-window-choice">
          <span>Client retenu</span>
          <b>{draft.name}</b>
        </article>
      ) : null}
      {prospectOnly ? <p className="client-number-miss">{EXISTING_CLIENT_MESSAGE}</p> : null}
    </div>
  );
}
