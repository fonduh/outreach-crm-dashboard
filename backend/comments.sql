-- Private, per-viewer discussions. These tables never enter the CSV snapshot.
begin;
create schema if not exists crm_private;
revoke all on schema crm_private from public, anon, authenticated;
create table if not exists public.crm_reviewers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
 display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
 token_hash text not null,
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.crm_role_comments (
 id uuid primary key,
 reviewer_id uuid not null references public.crm_reviewers(id) on delete cascade,
 job_id text not null check (job_id ~ '^J[0-9]+$'),
 author_role text not null check (author_role in ('owner','viewer')),
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_role_comments_thread on public.crm_role_comments(reviewer_id,job_id,created_at);
alter table public.crm_reviewers enable row level security;
alter table public.crm_role_comments enable row level security;
revoke all on public.crm_reviewers,public.crm_role_comments from public,anon,authenticated;
grant all on public.crm_reviewers,public.crm_role_comments to service_role;
-- No direct browser table access. Every operation must pass the checks below.
create or replace function crm_private.comment_access(p_slug text,p_token text)
returns table(reviewer_id uuid,owner_id uuid,display_name text,actor text)
language plpgsql stable security definer set search_path = '' as $$
declare r public.crm_reviewers;
begin
 select * into r from public.crm_reviewers where slug=p_slug;
 if r.id is null then raise exception 'This private viewing link is unavailable.'; end if;
 if auth.uid()=r.owner_id then
  return query select r.id,r.owner_id,r.display_name,'owner'::text;
 elsif r.enabled and p_token ~ '^[a-f0-9]{64}$'
  and r.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
  and exists(select 1 from public.crm_shared_views v where v.owner_id=r.owner_id
   and v.share_slug='job-search' and v.enabled and v.detail_level='company_roles') then
  return query select r.id,r.owner_id,r.display_name,'viewer'::text;
 else raise exception 'This private viewing link is unavailable.';
 end if;
end $$;
revoke all on function crm_private.comment_access(text,text) from public,anon,authenticated;

create or replace function public.get_reviewer_context(p_slug text,p_token text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('slug',p_slug,'display_name',a.display_name,'actor',a.actor)
 from crm_private.comment_access(p_slug,p_token) a;
$$;
create or replace function public.list_crm_reviewers()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to manage viewing links.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('slug',r.slug,'display_name',r.display_name,'enabled',r.enabled) order by r.created_at)
 from public.crm_reviewers r where r.owner_id=auth.uid()),'[]'::jsonb);
end $$;
create or replace function public.manage_crm_reviewer(p_slug text,p_name text,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text; r public.crm_reviewers;
begin
 if auth.uid() is null or not exists(select 1 from public.crm_snapshots where owner_id=auth.uid()) then
  raise exception 'Sign in as the CRM owner to manage viewing links.';
 end if;
 if p_action='create' then
  if (select count(*) from public.crm_reviewers where owner_id=auth.uid())>=100 then raise exception 'Viewing link limit reached.'; end if;
  v_token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.crm_reviewers(owner_id,slug,display_name,token_hash)
   values(auth.uid(),p_slug,btrim(p_name),encode(sha256(convert_to(v_token,'UTF8')),'hex')) returning * into r;
 elsif p_action in ('rotate','revoke') then
  select * into r from public.crm_reviewers where slug=p_slug and owner_id=auth.uid() for update;
  if r.id is null then raise exception 'Viewing link not found.'; end if;
  if p_action='rotate' then
   v_token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
   update public.crm_reviewers set token_hash=encode(sha256(convert_to(v_token,'UTF8')),'hex'),enabled=true where id=r.id returning * into r;
  else update public.crm_reviewers set enabled=false where id=r.id returning * into r; end if;
 else raise exception 'Unknown link action.'; end if;
 return jsonb_build_object('slug',r.slug,'display_name',r.display_name,'enabled',r.enabled,'token',v_token);
end $$;
create or replace function public.get_role_comments(p_slug text,p_job_id text,p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a record;
begin
 select * into a from crm_private.comment_access(p_slug,p_token);
 return jsonb_build_object('display_name',a.display_name,'actor',a.actor,'comments',coalesce((
  select jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,'author_role',c.author_role,'version',c.version,
   'created_at',c.created_at,'updated_at',c.updated_at) order by c.created_at,c.id)
  from public.crm_role_comments c where c.reviewer_id=a.reviewer_id and c.job_id=p_job_id),'[]'::jsonb));
end $$;
create or replace function public.save_role_comment(p_slug text,p_job_id text,p_id uuid,p_body text,p_version integer default null,p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; c public.crm_role_comments;
begin
 select * into a from crm_private.comment_access(p_slug,p_token);
 -- Serialize a viewer's writes to enforce limits and idempotent retries.
 perform 1 from public.crm_reviewers where id=a.reviewer_id for update;
 if not exists(select 1 from public.crm_snapshots s,jsonb_array_elements(s.payload->'jobs') j
  where s.owner_id=a.owner_id and j->>'id'=p_job_id) then raise exception 'This role is no longer in the CRM.'; end if;
 if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then raise exception 'Enter a comment between 1 and 4,000 characters.'; end if;
 select * into c from public.crm_role_comments where id=p_id for update;
 if c.id is not null then
  if c.reviewer_id<>a.reviewer_id or c.job_id<>p_job_id or c.author_role<>a.actor then raise exception 'You can edit only your own comments in this thread.'; end if;
  if p_version is null and c.body=btrim(p_body) then return jsonb_build_object('id',c.id,'version',c.version); end if;
  if p_version is null or c.version<>p_version then raise exception 'This comment changed in another tab. Refresh the discussion before editing again.'; end if;
  update public.crm_role_comments set body=btrim(p_body),version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
 else
  if p_version is not null then raise exception 'Comment not found.'; end if;
  if (select count(*) from public.crm_role_comments where reviewer_id=a.reviewer_id and created_at>now()-interval '1 minute')>=20 then raise exception 'Please wait a minute before adding more comments.'; end if;
  if (select count(*) from public.crm_role_comments where reviewer_id=a.reviewer_id and job_id=p_job_id)>=500 then raise exception 'This role discussion has reached its comment limit.'; end if;
  insert into public.crm_role_comments(id,reviewer_id,job_id,author_role,body)
   values(p_id,a.reviewer_id,p_job_id,a.actor,btrim(p_body)) returning * into c;
 end if;
 return jsonb_build_object('id',c.id,'version',c.version);
end $$;
revoke all on function public.get_reviewer_context(text,text),public.get_role_comments(text,text,text),public.save_role_comment(text,text,uuid,text,integer,text),public.list_crm_reviewers(),public.manage_crm_reviewer(text,text,text) from public,anon,authenticated;
grant execute on function public.get_reviewer_context(text,text),public.get_role_comments(text,text,text),public.save_role_comment(text,text,uuid,text,integer,text) to anon,authenticated;
grant execute on function public.list_crm_reviewers(),public.manage_crm_reviewer(text,text,text) to authenticated;
commit;
