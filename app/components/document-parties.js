"use client";

import { useState } from "react";
import { companyDisplayName, companyEmitterLines } from "../lib/company";
import { formatClientNumber } from "../lib/client-number";
import { personSearchFields } from "../lib/directory-search";
import AddressCallNotice, { dialPhone } from "./address-call-notice";
import { missingAddressParts } from "../lib/address";

export function frozenRecipient(client, fallback = {}) {
  const fields = personSearchFields(client || {});
  const clientName = fallback.clientName
    || client?.company
    || client?.name
    || fields.name
    || [fallback.lastName, fallback.firstName].filter(Boolean).join(" ");
  const clientContact = fallback.clientContact
    || [fields.firstName, fields.lastName].filter(Boolean).join(" ")
    || [fallback.firstName, fallback.lastName].filter(Boolean).join(" ");
  const clientAddress = fallback.clientAddress
    || fields.address
    || [fallback.address, fallback.addressComplement, [fallback.postalCode, fallback.city].filter(Boolean).join(" ")].filter(Boolean).join(" ");
  const clientPhone = fallback.clientPhone || fields.phone || fallback.phone || fallback.mobile || "";
  const clientEmail = fallback.clientEmail || fields.email || fallback.email || "";
  const clientNumber = fallback.clientNumber
    || (Number(client?.clientNumber) > 0 ? formatClientNumber(client.clientNumber) : "")
    || (Number(fallback.clientNumberRaw) > 0 ? formatClientNumber(fallback.clientNumberRaw) : "");
  const clientStreet = String(client?.address || fallback.address || "").trim();
  const clientPostal = String(client?.postalCode || fallback.postalCode || "").trim();
  const clientCity = String(client?.city || fallback.city || "").trim();
  const clientId = client?.id || fallback.clientId || "";
  const addressChecked = Boolean(client) || fallback.addressChecked === true;
  return {
    clientName,
    clientContact,
    clientAddress,
    clientPhone,
    clientEmail,
    clientNumber,
    clientStreet,
    clientPostal,
    clientCity,
    clientId,
    addressChecked,
  };
}

export default function DocumentParties({
  company,
  clientName = "",
  clientContact = "",
  clientAddress = "",
  clientPhone = "",
  clientEmail = "",
  clientTitle = "Client / destinataire",
  clientNumber = "",
  clientStreet = "",
  clientPostal = "",
  clientCity = "",
  clientId = "",
  addressChecked = false,
  children = null,
}) {
  const legal = companyEmitterLines(company);
  const [override, setOverride] = useState(null);
  const street = override?.address ?? clientStreet;
  const postal = override?.postalCode ?? clientPostal;
  const town = override?.city ?? clientCity;
  const shownAddress = override
    ? [override.address, override.postalCode, override.city].filter(Boolean).join(" ")
    : clientAddress;
  const parts = addressChecked
    ? missingAddressParts({ address: street, postalCode: postal, city: town })
    : [];
  return (
    <>
    <div className="document-parties">
      <section className="document-party is-company">
        <span>Émetteur</span>
        <b>{companyDisplayName(company)}</b>
        {legal.map(line => <p key={line}>{line}</p>)}
      </section>
      <section className="document-party is-client">
        <span>{clientTitle}</span>
        {clientNumber ? <p className="document-party-number">{clientNumber}</p> : null}
        {children || (
          <>
            <b>{clientName || "Client"}</b>
            {clientContact && clientContact !== clientName && <p>{clientContact}</p>}
            <p>{shownAddress || "Adresse à compléter"}</p>
            {(clientPhone || clientEmail) && (
              <p>
                {clientPhone ? (
                  parts.length
                    ? <button type="button" className="client-record-call" onClick={() => document.getElementById("address-call-notice")?.scrollIntoView({ block: "nearest" })}>{clientPhone}</button>
                    : <button type="button" className="client-record-call" onClick={() => dialPhone(clientPhone)}>{clientPhone}</button>
                ) : null}
                {clientPhone && clientEmail ? " · " : null}
                {clientEmail || null}
              </p>
            )}
          </>
        )}
      </section>
    </div>
    {parts.length > 0 && (
      <AddressCallNotice
        parts={parts}
        person={{ address: street, postalCode: postal, city: town }}
        clientId={clientId}
        phone={clientPhone}
        onSaved={values => setOverride(values)}
      />
    )}
    </>
  );
}
