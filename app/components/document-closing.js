"use client";

export default function DocumentClosing({
  place = "",
  onPlace,
  placeName = "place",
  date = "",
  onDate,
  dateName = "signatureDate",
  single = false,
  children,
}) {
  return (
    <div className="document-closing">
      <div className="document-closing-meta">
        <label>Fait à
          {onPlace
            ? <input value={place} onChange={event => onPlace(event.target.value)} placeholder="Commune" autoComplete="off" />
            : <input name={placeName} defaultValue={place} placeholder="Commune" autoComplete="off" />}
        </label>
        <label>Le
          {onDate
            ? <input type="date" value={date} onChange={event => onDate(event.target.value)} />
            : <input type="date" name={dateName} defaultValue={date} />}
        </label>
      </div>
      <div className={`document-closing-signs${single ? " is-single" : ""}`}>{children}</div>
    </div>
  );
}
