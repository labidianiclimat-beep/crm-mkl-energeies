-- Autorise la visite technique sur l’agenda des techniciens,
-- à côté de l’entretien, du dépannage et de l’installation.
-- À coller dans Supabase → SQL Editor.

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'entretien_visits'
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) ilike '%nature_proposed%'
        or pg_get_constraintdef(con.oid) ilike '%nature_validated%'
      )
  loop
    execute format('alter table public.entretien_visits drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.entretien_visits
  add constraint entretien_visits_nature_proposed_check
  check (nature_proposed in ('entretien', 'installation', 'depannage', 'visite_technique', 'autre') or nature_proposed is null);

alter table public.entretien_visits
  add constraint entretien_visits_nature_validated_check
  check (nature_validated in ('entretien', 'installation', 'depannage', 'visite_technique', 'autre') or nature_validated is null);
