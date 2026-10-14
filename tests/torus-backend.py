"""Real authorization and concurrency checks; every test mutation rolls back."""
import json,secrets,sys,uuid,urllib.request,urllib.error,re
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from manage_torus import query,quote
s=uuid.uuid4().hex[:10];w='test-'+s;a='test-fonda-'+s;b='test-marcus-'+s;c='test-other-'+s;ta=secrets.token_hex(32);tb=secrets.token_hex(32);tc=secrets.token_hex(32);note=str(uuid.uuid4())
q=f"""
begin;
create function pg_temp.check(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Assertion failed'; end if; end $$;
create function pg_temp.denied(sql text) returns void language plpgsql as $$ declare blocked boolean:=false; begin begin execute sql; exception when others then blocked:=true; end; if not blocked then raise exception 'Expected denial'; end if; end $$;
insert into torus_private.workspaces(id,payload) select '{w}',payload from torus_private.workspaces where id='torus-demo';
insert into torus_private.workspaces(id,payload) select '{w}-other',payload from torus_private.workspaces where id='torus-demo';
insert into torus_private.links values('{a}','{w}','Test Fonda',encode(sha256(convert_to('{ta}','UTF8')),'hex'),true),('{b}','{w}','Test Marcus',encode(sha256(convert_to('{tb}','UTF8')),'hex'),true),('{c}','{w}-other','Other',encode(sha256(convert_to('{tc}','UTF8')),'hex'),true);
set local role anon;
select pg_temp.denied('select * from torus_private.workspaces');
select pg_temp.denied('select * from torus_private.notes');
select pg_temp.denied('select public.torus_read(''{a}'',''bad'')');
select pg_temp.denied('select public.torus_read(''{a}'',''{tb}'')');
select pg_temp.check(public.torus_read('{a}','{ta}')->>'actor'='Test Fonda');
select set_config('test.payload',(public.torus_read('{a}','{ta}')->'payload')::text,true);
select public.torus_note('{a}','{ta}','p1','A useful note','{note}');
select public.torus_note('{a}','{ta}','p1','A useful note','{note}');
select pg_temp.check(jsonb_array_length(public.torus_read('{b}','{tb}')->'notes')=1);
select pg_temp.check(jsonb_array_length(public.torus_read('{c}','{tc}')->'notes')=0);
select pg_temp.denied('select public.torus_note(''{b}'',''{tb}'',''p1'',''forged'',''{note}'',1)');
select public.torus_note('{a}','{ta}','p1','Edited','{note}',1);
select pg_temp.denied('select public.torus_note(''{a}'',''{ta}'',''p1'',''stale'',''{note}'',1)');
select pg_temp.denied(format('select public.torus_note(%L,%L,''missing'',''x'',%L)','{a}','{ta}',gen_random_uuid()));
select public.torus_save('{a}','{ta}',jsonb_set(current_setting('test.payload')::jsonb,'{{prospects,0,next}}','"Test next action"'),1);
select pg_temp.check(public.torus_read('{b}','{tb}')->>'revision'='2');
select pg_temp.check(public.torus_read('{b}','{tb}')->'payload'->'prospects'->0->>'next'='Test next action');
select pg_temp.denied(format('select public.torus_save(%L,%L,%L::jsonb,1)','{b}','{tb}',jsonb_set(current_setting('test.payload')::jsonb,'{{prospects,0,next}}','"Overwrite"')));
select pg_temp.denied(format('select public.torus_save(%L,%L,%L::jsonb,2)','{b}','{tb}',jsonb_set(current_setting('test.payload')::jsonb,'{{prospects,1,stage}}','"handoff"')));
select pg_temp.denied(format('select public.torus_save(%L,%L,%L::jsonb,2)','{b}','{tb}',jsonb_set(current_setting('test.payload')::jsonb,'{{prospects}}','[]')));
reset role;
update torus_private.links set enabled=false where slug='{b}';
set local role anon;
select pg_temp.denied('select public.torus_read(''{b}'',''{tb}'')');
select pg_temp.check(jsonb_array_length(public.torus_read('{a}','{ta}')->'notes')=1);
reset role;
rollback;
"""
try:query(q)
except RuntimeError:
 setup=json.loads((root/'supabase-setup-access.private.json').read_text());req=urllib.request.Request('https://api.supabase.com/v1/projects/'+setup['project_ref']+'/database/query',headers={'Authorization':'Bearer '+setup['management_access_token'],'Content-Type':'application/json'},data=json.dumps({'query':q}).encode())
 try:urllib.request.urlopen(req)
 except urllib.error.HTTPError as e:
  msg=e.read().decode();msg=re.sub(r'[a-f0-9]{64}','[redacted]',msg);print(msg[:1800])
 raise
print('PASS: access tokens, denied table access, private workspace isolation, note authorship/edit/retry, stale-write rejection, qualification gates, no deletion, and revocation. All mutations rolled back.')
