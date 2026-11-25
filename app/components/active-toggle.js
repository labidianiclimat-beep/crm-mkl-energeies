"use client";

export function isItemActive(item) {
  if (!item) return true;
  if (item.active === false || item.actif === false) return false;
  if (item.status === "Inactif") return false;
  return true;
}

export default function ActiveToggle({ active = true, onChange, disabled = false, busy = false }) {
  const enabled = Boolean(active);
  return (
    <div className={`active-toggle ${enabled ? "is-on" : "is-off"}`} role="group" aria-label="Activation">
      <button
        type="button"
        className={enabled ? "selected" : ""}
        aria-pressed={enabled}
        disabled={disabled || busy}
        onClick={() => !enabled && onChange?.(true)}
      >
        Activé
      </button>
      <button
        type="button"
        className={!enabled ? "selected" : ""}
        aria-pressed={!enabled}
        disabled={disabled || busy}
        onClick={() => enabled && onChange?.(false)}
      >
        Désactivé
      </button>
    </div>
  );
}
