import { atomicWriteJson, readJsonArray, withStoreLock } from "./json-store.mjs";
import { enqueueCrmJob } from "./crm-outbox.mjs";

/** Ajoute une demande sans effacer les lignes déjà présentes. */
export async function appendLeadRecord(directory, leadsPath, outboxPath, lead) {
  return withStoreLock(directory, async () => {
    const leads = await readJsonArray(leadsPath);
    if (leads.some((row) => row.id === lead.id)) {
      await enqueueCrmJob(directory, outboxPath, {
        kind: "lead",
        sourceId: lead.id,
        createdAt: lead.createdAt,
      });
      return { created: false, leads };
    }
    leads.unshift(lead);
    await atomicWriteJson(leadsPath, leads);
    await enqueueCrmJob(directory, outboxPath, {
      kind: "lead",
      sourceId: lead.id,
      createdAt: lead.createdAt,
    });
    return { created: true, leads };
  });
}

/**
 * Un rendez-vous et sa copie locale. Une seule tâche de synchro, sur le rendez-vous.
 * Le même identifiant n’est pas écrit une seconde fois.
 */
export async function appendAppointmentRecord(directory, paths, appointment, mirror) {
  return withStoreLock(directory, async () => {
    const appointments = await readJsonArray(paths.appointmentsPath);
    const already = appointments.some((row) => row.id === appointment.id);
    if (!already) {
      appointments.unshift(appointment);
      await atomicWriteJson(paths.appointmentsPath, appointments);
    }
    const leads = await readJsonArray(paths.leadsPath);
    if (!leads.some((row) => row.id === mirror.id)) {
      leads.unshift(mirror);
      await atomicWriteJson(paths.leadsPath, leads);
    }
    await enqueueCrmJob(directory, paths.outboxPath, {
      kind: "appointment",
      sourceId: appointment.id,
      createdAt: appointment.createdAt,
    });
    return { created: !already, appointments, leads };
  });
}

/** Met à jour une liste existante sans la remplacer par une lecture périmée. */
export async function updateJsonRecords(directory, filePath, mutator) {
  return withStoreLock(directory, async () => {
    const rows = await readJsonArray(filePath);
    const next = await mutator(rows);
    await atomicWriteJson(filePath, next);
    return next;
  });
}
