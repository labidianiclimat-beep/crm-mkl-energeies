import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDemoUser, joinUserName, profileToDirectoryUser, profileToUiUser, resolveUserDisplayName, splitUserName } from "../app/lib/users.js";

test("profileToUiUser mappe un compte réel de l’organisation", () => {
  const user = profileToUiUser({
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Camille Martin",
    email: "camille@mkl-energies.fr",
    role: "Commercial",
    modules: ["Prospects"],
    manager: "Khaled",
    active: true,
    onboarding_completed_at: "2026-09-01T00:00:00Z",
    zone: "44",
    specialties: ["PAC"],
    postal_code: "44000",
    city: "Nantes",
    dispatch_available: true,
  });
  assert.equal(user.supabaseId, user.id);
  assert.equal(user.name, "Camille Martin");
  assert.equal(user.firstName, "Camille");
  assert.equal(user.lastName, "Martin");
  assert.equal(user.identifier, "camille@mkl-energies.fr");
  assert.equal(user.status, "Actif");
  assert.equal(user.authStatus, "Actif");
  assert.equal(isDemoUser(user), false);
  assert.equal(profileToUiUser({ role: "Admin second" }).role, "Superadmin");
});

test("les comptes de démonstration du navigateur sont reconnus", () => {
  assert.equal(isDemoUser({ id: 2, name: "Sébastien Brun", email: "sebastien@mkl-energies.fr" }), true);
  assert.equal(isDemoUser({ id: 3, name: "Karim Aït", email: "karim@mkl-energies.fr" }), true);
  assert.equal(isDemoUser({ id: 1, name: "Khaled", email: "contact@mkl-energies.fr" }), false);
});

test("un compte non activé attend l’envoi du mail depuis le listing", () => {
  const pending = profileToUiUser({
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Léa Moreau",
    email: "lea@mkl-energies.fr",
    role: "Commercial",
    modules: ["Prospects"],
    active: false,
    onboarding_completed_at: null,
  });
  assert.equal(pending.authStatus, "En attente d’envoi");
});

test("la création et le changement d’email envoient le mail d’activation", () => {
  const invite = readFileSync(new URL("../app/api/users/invite/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const patch = readFileSync(new URL("../app/api/users/[id]/route.js", import.meta.url), "utf8");
  const mail = readFileSync(new URL("../app/lib/user-login-pin.js", import.meta.url), "utf8");
  assert.match(invite, /issueAndSendLoginPin/);
  assert.match(invite, /reason: "invite"/);
  assert.match(invite, /assertAssignableAccess/);
  assert.match(patch, /assertAssignableAccess/);
  assert.match(patch, /issueAndSendLoginPin/);
  assert.match(patch, /reason: "email-change"/);
  assert.match(mail, /Votre accès — MKL Énergies CRM/);
  assert.match(page, /Mail d’activation envoyé/);
  assert.match(page, /send-invite/);
  assert.match(page, /\/api\/users\/resend-pin/);
});

test("le nom et le prénom sont saisis séparément puis assemblés", () => {
  assert.equal(joinUserName("Camille", "Martin"), "Camille Martin");
  assert.deepEqual(splitUserName("Camille Martin"), { firstName: "Camille", lastName: "Martin" });
  assert.equal(resolveUserDisplayName({ firstName: "Camille", lastName: "Martin" }), "Camille Martin");
  assert.equal(resolveUserDisplayName({ name: "Camille Martin" }), "Camille Martin");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /name="lastName"/);
  assert.match(page, /name="firstName"/);
  assert.doesNotMatch(page, /Nom complet/);
  assert.doesNotMatch(page, /role-cards/);
  assert.doesNotMatch(page, /permission-detail/);
  assert.match(page, /Fonctions spéciales/);
  assert.match(page, /Journal d’activités/);
  assert.match(page, /ActivityJournalView/);
  assert.doesNotMatch(page, /<ActivityJournal\/>/);
});

test("les utilisateurs viennent de la base, plus du blob local", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.ok(!/useStored\("mkl-users"/.test(source));
  assert.match(source, /authFetch\("\/api\/users"\)/);
  const route = readFileSync(new URL("../app/api/users/route.js", import.meta.url), "utf8");
  assert.match(route, /requireApiSession/);
  assert.match(route, /canListOrganizationUsers/);
  assert.match(route, /profileToDirectoryUser/);
  assert.match(route, /organization_id=eq/);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /Seules les cases cochées donnent réellement accès/);
  const directory = profileToDirectoryUser({
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Camille Martin",
    email: "camille@mkl-energies.fr",
    role: "Commercial",
    modules: ["Prospects", "action:delete_articles"],
    active: true,
  });
  assert.equal(directory.email, undefined);
  assert.equal(directory.modules, undefined);
  assert.equal(directory.name, "Camille Martin");
});
