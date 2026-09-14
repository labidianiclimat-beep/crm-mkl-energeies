-- Permissions pour que la clé service_role puisse gérer les tables CRM
-- Exécuter dans Supabase → SQL Editor si vous voyez "permission denied for table profiles"

grant usage on schema public to service_role;

grant all on table public.organizations to service_role;
grant all on table public.profiles to service_role;
grant all on table public.activation_pins to service_role;
grant all on table public.crm_state to service_role;
grant all on table public.clients to service_role;

grant usage, select on all sequences in schema public to service_role;
