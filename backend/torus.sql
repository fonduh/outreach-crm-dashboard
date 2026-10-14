-- Isolated prospecting demo. Does not read or write the job-search CRM.
begin;
create schema if not exists torus_private;
revoke all on schema torus_private from public,anon,authenticated;
create table if not exists torus_private.workspaces (
 id text primary key, payload jsonb not null, revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create table if not exists torus_private.links (
 slug text primary key, workspace_id text not null references torus_private.workspaces(id),
 name text not null, token_hash text not null, enabled boolean not null default true
);
create table if not exists torus_private.notes (
 id uuid primary key, workspace_id text not null references torus_private.workspaces(id),
 prospect_id text not null, author_slug text not null references torus_private.links(slug),
 body text not null check(char_length(btrim(body)) between 1 and 4000),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists torus_private.activity (
 id uuid primary key default gen_random_uuid(),workspace_id text not null references torus_private.workspaces(id),
 prospect_id text,actor text not null,body text not null,created_at timestamptz not null default now()
);
alter table torus_private.workspaces enable row level security;
alter table torus_private.links enable row level security;
alter table torus_private.notes enable row level security;
alter table torus_private.activity enable row level security;
revoke all on all tables in schema torus_private from public,anon,authenticated;
create index if not exists torus_notes_thread on torus_private.notes(workspace_id,prospect_id,created_at);
create index if not exists torus_activity_workspace on torus_private.activity(workspace_id,created_at);

create or replace function torus_private.access(p_slug text,p_token text)
returns torus_private.links language plpgsql stable security definer set search_path='' as $$
declare a torus_private.links;
begin
 select * into a from torus_private.links where slug=p_slug and enabled and p_token ~ '^[a-f0-9]{64}$' and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if a.slug is null then raise exception 'This private link is unavailable. Use the full link shared with you.'; end if;
 return a;
end $$;

create or replace function torus_private.validate(p jsonb) returns void language plpgsql set search_path='' as $$
declare j jsonb; k text;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>524288 or jsonb_typeof(p->'prospects') is distinct from 'array' or jsonb_typeof(p->'icp') is distinct from 'object' then raise exception 'Invalid workspace data.'; end if;
 if jsonb_array_length(p->'prospects')>500 then raise exception 'This demo supports up to 500 prospects.'; end if;
 if (select count(*)<>count(distinct v->>'id') from jsonb_array_elements(p->'prospects') v) then raise exception 'Prospect IDs must be unique.'; end if;
 if coalesce((p->'icp'->>'goal')::integer,0) not between 1 and 1000 or coalesce((p->'icp'->>'version')::integer,0)<1 then raise exception 'Invalid ICP target or version.'; end if;
 foreach k in array array['segment','pain','timing','buyer'] loop
  if coalesce(char_length(btrim(p->'icp'->>k)),0) not between 1 and 4000 then raise exception 'Complete the ICP criteria.'; end if;
 end loop;
 for j in select value from jsonb_array_elements(p->'prospects') loop
  if coalesce(j->>'id','') !~ '^[a-zA-Z0-9-]{1,80}$' or coalesce(char_length(btrim(j->>'company')),0) not between 1 and 120 or coalesce(char_length(btrim(j->>'contact')),0) not between 1 and 120 then raise exception 'Add a valid company and contact.'; end if;
  if coalesce(j->>'stage','') not in ('research','ready','contacted','replied','meeting','handoff','nurture','closed') or coalesce(j->>'approval','') not in ('review','approved','rework') then raise exception 'Invalid prospect status.'; end if;
  foreach k in array array['segment','pain','timing','buyer'] loop
   if coalesce(j->'fit'->>k,'') not in ('yes','no','unknown') then raise exception 'Invalid fit signal.'; end if;
  end loop;
  if coalesce(j->'meeting','null'::jsonb)<>'null'::jsonb then
   if coalesce(j->'meeting'->>'status','') not in ('scheduled','held','cancelled') or coalesce(j->'meeting'->>'at','')='' or coalesce((j->'meeting'->>'duration')::integer,0) not in (15,30,45,60) then raise exception 'Invalid meeting.'; end if;
   perform (j->'meeting'->>'at')::timestamptz;
   if coalesce(j->'meeting'->>'url','')<>'' and j->'meeting'->>'url' !~* '^https://' then raise exception 'Use an HTTPS meeting link.'; end if;
  end if;
  if j->>'stage'='meeting' and coalesce(j->'meeting'->>'status','') not in ('scheduled','held') then raise exception 'Add a meeting first.'; end if;
  if j->>'stage'='handoff' and (j->>'approval'<>'approved' or coalesce(j->'meeting'->>'status','')<>'held' or exists(select 1 from jsonb_each_text(j->'fit') v where v.value<>'yes')) then raise exception 'Handoff requires strong fit, founder approval, and a held meeting.'; end if;
 end loop;
end $$;

create or replace function public.torus_read(p_slug text,p_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a torus_private.links; w torus_private.workspaces;
begin
 a:=torus_private.access(p_slug,p_token);select * into w from torus_private.workspaces where id=a.workspace_id;
 return jsonb_build_object('actor',a.name,'revision',w.revision,'payload',w.payload,
 'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'prospect_id',n.prospect_id,'actor',l.name,'body',n.body,'version',n.version,'created_at',n.created_at,'updated_at',n.updated_at) order by n.created_at) from torus_private.notes n join torus_private.links l on l.slug=n.author_slug where n.workspace_id=w.id),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc) from (select id,prospect_id,actor,body,created_at from torus_private.activity where workspace_id=w.id order by created_at desc limit 200) v),'[]'::jsonb));
end $$;

create or replace function public.torus_save(p_slug text,p_token text,p_payload jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a torus_private.links;w torus_private.workspaces;j jsonb;oldj jsonb;v_body text;
begin
 a:=torus_private.access(p_slug,p_token);select * into w from torus_private.workspaces where id=a.workspace_id for update;
 if p_payload=w.payload then return jsonb_build_object('revision',w.revision); end if;
 if p_revision is distinct from w.revision then raise exception 'This workspace changed. Keep your draft, refresh, then reapply your changes.'; end if;
 perform torus_private.validate(p_payload);
 -- Archive instead of deleting; preserve notes and history.
 if exists(select 1 from jsonb_array_elements(w.payload->'prospects') x where not exists(select 1 from jsonb_array_elements(p_payload->'prospects') y where y->>'id'=x->>'id')) then raise exception 'Archive prospects instead of deleting them.'; end if;
 for j in select value from jsonb_array_elements(p_payload->'prospects') loop
  select value into oldj from jsonb_array_elements(w.payload->'prospects') where value->>'id'=j->>'id';
  if j->>'stage'='handoff' and coalesce(oldj->>'stage','')<>'handoff' and coalesce((j->>'fitVersion')::integer,1)<>(p_payload->'icp'->>'version')::integer then raise exception 'Recheck ICP signals before handoff.'; end if;
  if oldj is distinct from j then
   v_body:=case when oldj is null then 'Prospect added' when j->>'archived'='true' and oldj->>'archived'<>'true' then 'Prospect archived' else 'Updated '||concat_ws(', ',case when j->>'stage' is distinct from oldj->>'stage' then 'status: '||(j->>'stage') end,case when j->'meeting' is distinct from oldj->'meeting' then 'meeting' end,case when j->'fit' is distinct from oldj->'fit' then 'ICP signals' end,case when j->>'approval' is distinct from oldj->>'approval' then 'founder decision' end,case when j->'ask' is distinct from oldj->'ask' then 'founder ask' end,case when j->>'next' is distinct from oldj->>'next' then 'next action' end) end;
   if v_body='Updated ' then v_body:='Prospect details updated'; end if;
   insert into torus_private.activity(workspace_id,prospect_id,actor,body) values(w.id,j->>'id',a.name,v_body);
  end if;
 end loop;
 if w.payload->'icp' is distinct from p_payload->'icp' then insert into torus_private.activity(workspace_id,actor,body) values(w.id,a.name,'ICP updated to v'||(p_payload->'icp'->>'version')); end if;
 update torus_private.workspaces set payload=p_payload,revision=revision+1,updated_at=clock_timestamp() where id=w.id returning * into w;
 return jsonb_build_object('revision',w.revision);
end $$;

create or replace function public.torus_note(p_slug text,p_token text,p_prospect text,p_body text,p_id uuid,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a torus_private.links;n torus_private.notes;
begin
 a:=torus_private.access(p_slug,p_token);perform 1 from torus_private.workspaces where id=a.workspace_id for update;
 if not exists(select 1 from torus_private.workspaces w,jsonb_array_elements(w.payload->'prospects') p where w.id=a.workspace_id and p->>'id'=p_prospect) then raise exception 'Prospect not found.'; end if;
 if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then raise exception 'Write a note between 1 and 4,000 characters.'; end if;
 select * into n from torus_private.notes where id=p_id for update;
 if n.id is not null then
  if n.workspace_id<>a.workspace_id or n.prospect_id<>p_prospect or n.author_slug<>a.slug then raise exception 'You can edit only your own notes.'; end if;
  if n.body=btrim(p_body) and (p_version is null or p_version in (n.version,n.version-1)) then return jsonb_build_object('id',n.id,'version',n.version); end if;
  if p_version is distinct from n.version then raise exception 'This note changed. Refresh before editing again.'; end if;
  update torus_private.notes set body=btrim(p_body),version=version+1,updated_at=clock_timestamp() where id=n.id returning * into n;
 else
  if p_version is not null then raise exception 'Note not found.'; end if;
  if (select count(*) from torus_private.notes where workspace_id=a.workspace_id and created_at>now()-interval '1 minute')>=30 then raise exception 'Please wait a minute before adding more notes.'; end if;
  if (select count(*) from torus_private.notes where workspace_id=a.workspace_id)>=5000 then raise exception 'Workspace note limit reached.'; end if;
  insert into torus_private.notes(id,workspace_id,prospect_id,author_slug,body) values(p_id,a.workspace_id,p_prospect,a.slug,btrim(p_body)) returning * into n;
 end if;
 return jsonb_build_object('id',n.id,'version',n.version);
end $$;
revoke all on all functions in schema torus_private from public,anon,authenticated;
revoke all on function public.torus_read(text,text),public.torus_save(text,text,jsonb,integer),public.torus_note(text,text,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.torus_read(text,text),public.torus_save(text,text,jsonb,integer),public.torus_note(text,text,text,text,uuid,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
