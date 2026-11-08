-- Études thermiques commerciales : module, crm_state, droits.

insert into public.permissions (code, label, category) values
  ('module:Études thermiques', 'Études thermiques', 'module')
on conflict (code) do update set
  label = excluded.label,
  category = excluded.category;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.code = 'module:Études thermiques'
  and r.code in ('admin_vip', 'admin_second', 'direction', 'responsable_commercial', 'commercial')
on conflict do nothing;

create or replace function public.state_key_to_module(state_key text)
returns text
language sql
immutable
as $$
  select case state_key
    when 'mkl-prospects' then 'Prospects'
    when 'mkl-commercial-appointments' then 'Agenda commercial'
    when 'mkl-clients' then 'Clients'
    when 'mkl-billing' then 'Devis'
    when 'mkl-contracts' then 'Maintenance'
    when 'mkl-cost-requests' then 'Demandes de chiffrage'
    when 'mkl-suppliers' then 'Fournisseurs'
    when 'mkl-installations' then 'Planning'
    when 'mkl-installation-teams' then 'Équipes d''installation'
    when 'mkl-technical-visits' then 'Visites techniques'
    when 'mkl-pv-projects' then 'Photovoltaïque administratif'
    when 'mkl-thermal-studies' then 'Études thermiques'
    when 'mkl-articles' then 'Gestion des articles'
    when 'mkl-article-groups' then 'Gestion des articles'
    when 'mkl-article-bundles' then 'Gestion des articles'
    when 'mkl-users' then 'Utilisateurs'
    when 'mkl-purchase-orders' then 'Visites techniques'
    else null
  end;
$$;

update public.profiles
set modules = array_append(modules, 'Études thermiques')
where role in ('Commercial', 'Responsable commercial', 'Direction', 'Admin VIP', 'Admin second')
  and modules is not null
  and not ('Études thermiques' = any (modules));
