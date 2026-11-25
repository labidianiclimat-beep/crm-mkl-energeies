import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildProspectAppointmentEmail,
  formatDurationLabel,
  formatProspectAppointmentWhen,
  isProspectVisitAppointment,
  prospectNotifyEmail,
} from "../app/lib/prospect-appointment-mail.js";

const prospect = {
  firstName: "Marie",
  name: "Marie Dupont",
  email: "marie.dupont@example.com",
  address: "12 rue des Lilas",
  postalCode: "67000",
  city: "Strasbourg",
  type: "Pompe à chaleur",
};

const appointment = {
  start: "2026-09-22T07:00:00.000Z",
  duration: 60,
  kind: "rendez-vous",
  commercialId: "22222222-2222-4222-8222-222222222222",
  commercial: "Karim Benali",
  address: "",
};

test("un email prospect n est envoyé que s il est valide", () => {
  assert.equal(prospectNotifyEmail({ email: "marie.dupont@example.com" }), "marie.dupont@example.com");
  assert.equal(prospectNotifyEmail({ email: " MARIE.DUPONT@EXAMPLE.COM " }), "marie.dupont@example.com");
  assert.equal(prospectNotifyEmail({ email: "" }), "");
  assert.equal(prospectNotifyEmail({ email: "pas-un-mail" }), "");
});

test("la date de rendez-vous s affiche en français à Paris", () => {
  const when = formatProspectAppointmentWhen("2026-09-22T07:00:00.000Z");
  assert.equal(when.weekday, "Mardi");
  assert.match(when.day, /22/);
  assert.match(when.day, /septembre/i);
  assert.match(when.day, /2026/);
  assert.equal(when.time, "09:00");
  assert.equal(formatDurationLabel(60), "1 heure");
  assert.equal(formatDurationLabel(90), "1 h 30");
  assert.equal(isProspectVisitAppointment({ kind: "rendez-vous" }), true);
  assert.equal(isProspectVisitAppointment({ kind: "busy" }), false);
});

test("le mail de confirmation met la date dans une carte soignée", () => {
  const mail = buildProspectAppointmentEmail({
    prospect,
    appointment,
    company: { legalName: "MKL Énergies", tradeName: "MKL Énergies", phone: "03 88 00 00 00", email: "contact@mkl-energies.fr" },
    logoUrl: "https://crm.example/mkl-energies.png",
  });
  assert.equal(mail.to, "marie.dupont@example.com");
  assert.match(mail.subject, /Karim Benali/);
  assert.match(mail.subject, /22/);
  assert.match(mail.subject, /09:00/);
  assert.match(mail.html, /Marie/);
  assert.match(mail.html, /rendez-vous avec Karim Benali/);
  assert.match(mail.html, /Mardi/);
  assert.match(mail.html, /09:00/);
  assert.match(mail.html, /12 rue des Lilas/);
  assert.match(mail.html, /Karim Benali/);
  assert.match(mail.html, /#ffcc00/);
  assert.match(mail.html, /#314d93/);
  assert.match(mail.html, /DM Sans/);
  assert.match(mail.html, /Manrope/);
  assert.match(mail.html, /mkl-energies.png|cid:mkl-logo/);
});

test("sans email, date ou commercial, aucun mail n est préparé", () => {
  assert.equal(buildProspectAppointmentEmail({ prospect: { ...prospect, email: "" }, appointment }), null);
  assert.equal(buildProspectAppointmentEmail({ prospect, appointment: { ...appointment, start: "" } }), null);
  assert.equal(buildProspectAppointmentEmail({ prospect, appointment: { ...appointment, kind: "busy" } }), null);
  assert.equal(buildProspectAppointmentEmail({ prospect, appointment: { ...appointment, commercial: "", commercialId: "" } }), null);
  assert.equal(buildProspectAppointmentEmail({ prospect, appointment: { ...appointment, commercial: "Non affecté" } }), null);
});

test("la création et l attribution préviennent le prospect", () => {
  const create = readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  const assign = readFileSync(new URL("../app/lib/prospect-assign.js", import.meta.url), "utf8");
  const agenda = readFileSync(new URL("../app/api/appointments/route.js", import.meta.url), "utf8");
  assert.match(create, /notifyProspectOfAppointment/);
  assert.match(assign, /notifyProspectOfAppointment/);
  assert.match(agenda, /notifyProspectOfAppointment/);
});
