/** Politique de conservation des contenus techniques des demandes du site. */

/**
 * Durées validées.
 *
 * `payloadDays` : durée de conservation du contenu brut reçu du site pour une
 * demande traitée. Au-delà, la demande reste en base, mais son contenu
 * technique n'a plus de raison d'être gardé.
 *
 * `graceDays` : délai supplémentaire accordé aux demandes non résolues. Une
 * demande en échec ou en attente de vérification de doublon n'est jamais
 * effacée à l'échéance : elle est d'abord signalée, et ce n'est qu'après ce
 * délai, si personne ne l'a traitée, que son contenu disparaît.
 *
 * Ces durées ne concernent que les contenus techniques temporaires. Les fiches
 * prospect, clients, devis et rendez-vous du CRM suivent leurs propres règles
 * et ne sont jamais touchées par cette purge.
 */
export const WEB_LEAD_RETENTION = {
  payloadDays: 30,
  graceDays: 30,
};

/** Durée maximale pendant laquelle un contenu brut peut subsister. */
export function maxRetentionDays() {
  return WEB_LEAD_RETENTION.payloadDays + WEB_LEAD_RETENTION.graceDays;
}

export function retentionSummary() {
  return `Contenus techniques conservés ${WEB_LEAD_RETENTION.payloadDays} jours, `
    + `puis ${WEB_LEAD_RETENTION.graceDays} jours de plus après signalement `
    + `pour les demandes non résolues.`;
}
