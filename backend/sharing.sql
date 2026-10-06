-- A public, read-only projection. The original snapshots stay owner-private.
create table if not exists public.crm_shared_views (
 share_slug text primary key check (share_slug ~ '^[a-z0-9-]{1,80}$'),
 owner_id uuid not null references auth.users(id) on delete cascade,
 detail_level text not null check (detail_level in ('company_roles','totals')),
 enabled boolean not null default false
);
alter table public.crm_shared_views enable row level security;
revoke all on public.crm_shared_views from public, anon, authenticated;
grant all on public.crm_shared_views to service_role;

create or replace function public.get_shared_crm(share_slug text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
 with shared as (
  select s.payload, s.updated_at, v.detail_level
  from public.crm_shared_views v
  join public.crm_snapshots s on s.owner_id = v.owner_id
  where v.share_slug = $1 and v.enabled
 ), roles as (
  select j.value as job, j.ordinality as position, shared.detail_level
  from shared, jsonb_array_elements(shared.payload->'jobs') with ordinality j
 )
 select jsonb_build_object(
  'ok', true, 'storage', 'shared', 'read_only', true,
  'detail_level', shared.detail_level, 'read_at', shared.updated_at,
  'jobs', coalesce((select jsonb_agg(jsonb_build_object(
   'id', case when r.detail_level='company_roles' then r.job->>'id' else 'ROLE-'||r.position end,
   'company_id', case when r.detail_level='company_roles' then r.job->>'company_id' else 'WITHHELD' end,
   'title', case when r.detail_level='company_roles' then r.job->>'title' else 'Role withheld' end,
   'status', r.job->>'status', 'view_stage', r.job->>'view_stage',
   'explicit_application', exists (
    select 1 from jsonb_array_elements(shared.payload->'job_activity') a
    where a->>'job_id'=r.job->>'id' and a->>'stage'='applied'
   )
  ) order by r.position) from roles r), '[]'::jsonb),
  'companies', case when shared.detail_level='company_roles' then coalesce((
   select jsonb_agg(jsonb_build_object('id', c->>'id', 'name', c->>'name'))
   from jsonb_array_elements(shared.payload->'companies') c
   where exists(select 1 from roles r where r.job->>'company_id'=c->>'id')
  ), '[]'::jsonb) else '[]'::jsonb end,
  'contacts', '[]'::jsonb, 'job_contacts', '[]'::jsonb, 'job_activity', '[]'::jsonb
 ) from shared;
$$;
revoke all on function public.get_shared_crm(text) from public;
grant execute on function public.get_shared_crm(text) to anon, authenticated, service_role;
