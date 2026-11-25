-- Marque un dossier SAV comme à facturer, sans changer son statut.

alter table public.sav_cases
  add column if not exists to_invoice boolean not null default false,
  add column if not exists to_invoice_at timestamptz;
