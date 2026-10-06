-- Run once in your own Supabase project's SQL editor. No CRM data is included.
create table if not exists public.crm_snapshots (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null,
 revision text not null,
 updated_at timestamptz not null default now()
);
alter table public.crm_snapshots enable row level security;
revoke all on public.crm_snapshots from anon, authenticated;
grant select on public.crm_snapshots to authenticated;
grant all on public.crm_snapshots to service_role;
drop policy if exists "owner reads own snapshot" on public.crm_snapshots;
create policy "owner reads own snapshot" on public.crm_snapshots
 for select to authenticated using (owner_id = (select auth.uid()));

create table if not exists public.crm_tag_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 company_id text not null check (company_id ~ '^CO[0-9]+$'),
 tags text[] not null check (tags <@ array['champion','executive_sponsor']::text[] and cardinality(tags)<=2),
 expected_tags text[] not null check (expected_tags <@ array['champion','executive_sponsor']::text[] and cardinality(expected_tags)<=2),
 status text not null default 'pending' check (status in ('pending','applied','rejected')),
 created_at timestamptz not null default now(),
 processed_at timestamptz,
 error text
);
alter table public.crm_tag_requests enable row level security;
revoke all on public.crm_tag_requests from anon, authenticated;
grant select on public.crm_tag_requests to authenticated;
grant insert (owner_id,company_id,tags,expected_tags,status) on public.crm_tag_requests to authenticated;
grant all on public.crm_tag_requests to service_role;
drop policy if exists "owner reads own requests" on public.crm_tag_requests;
create policy "owner reads own requests" on public.crm_tag_requests for select to authenticated
 using (owner_id = (select auth.uid()));
drop policy if exists "owner queues own tags" on public.crm_tag_requests;
create policy "owner queues own tags" on public.crm_tag_requests for insert to authenticated
 with check (owner_id = (select auth.uid()) and status='pending' and processed_at is null and error is null);
create index if not exists crm_tag_requests_pending on public.crm_tag_requests(owner_id,created_at) where status='pending';

do $$ begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='crm_snapshots') then
  alter publication supabase_realtime add table public.crm_snapshots;
 end if;
end $$;
