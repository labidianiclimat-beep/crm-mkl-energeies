-- Permet d’enregistrer une affectation sans salarié, notamment « Garage automobile »,
-- tout en laissant le véhicule au statut disponible.

alter table public.fleet_assignments
  alter column driver_id drop not null;

alter table public.fleet_assignments
  add column if not exists holder_label text;

alter table public.fleet_assignments
  drop constraint if exists fleet_assignments_holder_check;

alter table public.fleet_assignments
  add constraint fleet_assignments_holder_check
  check (driver_id is not null or nullif(btrim(coalesce(holder_label, '')), '') is not null);
