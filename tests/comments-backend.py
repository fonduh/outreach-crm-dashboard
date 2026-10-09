"""Exercise real database authorization inside a rollback-only transaction."""
import json,sys,uuid
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from setup_backend import call
setup=json.loads((root/'supabase-setup-access.private.json').read_text());cfg=json.loads((root/'sync/config.private.json').read_text())
owner=cfg['CRM_OWNER_ID'];suffix=uuid.uuid4().hex[:12];a='check-a-'+suffix;b='check-b-'+suffix;cid=str(uuid.uuid4());oid=str(uuid.uuid4())
q=f"""
begin;
create function pg_temp.verify(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Security assertion failed'; end if; end $$;
create function pg_temp.denied(query text) returns void language plpgsql as $$ declare blocked boolean:=false; begin begin execute query; exception when others then blocked:=true; end; if not blocked then raise exception 'Expected operation to be denied: %',query; end if; end $$;
select set_config('request.jwt.claims','{{"sub":"{owner}","role":"authenticated"}}',true);
set local role authenticated;
select set_config('test.a',public.manage_crm_reviewer('{a}','Test A','create')::text,true);
select set_config('test.b',public.manage_crm_reviewer('{b}','Test B','create')::text,true);
select pg_temp.verify(public.list_crm_reviewers() @> '[{{"slug":"{a}"}}]');
select public.save_role_comment('{a}','J052','{oid}','Owner reply');
set local role anon;
select set_config('request.jwt.claims','{{}}',true);
select pg_temp.denied('select * from public.crm_role_comments');
select pg_temp.denied('select * from public.crm_reviewers');
select pg_temp.denied('select public.list_crm_reviewers()');
select pg_temp.denied('select public.manage_crm_reviewer(''{a}'',''Imposter'',''rotate'')');
select pg_temp.denied('select public.get_role_comments(''{a}'',''J052'')');
select pg_temp.denied('select public.get_role_comments(''{a}'',''J052'',''bad'')');
select pg_temp.denied(format('select public.get_role_comments(%L,''J052'',%L)','{b}',current_setting('test.a')::jsonb->>'token'));
select pg_temp.verify(public.get_reviewer_context('{a}',current_setting('test.a')::jsonb->>'token')->>'display_name'='Test A');
select public.save_role_comment('{a}','J052','{cid}','<script>not executable</script>',null,current_setting('test.a')::jsonb->>'token');
-- Retrying the same create is idempotent.
select public.save_role_comment('{a}','J052','{cid}','<script>not executable</script>',null,current_setting('test.a')::jsonb->>'token');
select pg_temp.verify(jsonb_array_length(public.get_role_comments('{a}','J052',current_setting('test.a')::jsonb->>'token')->'comments')=2);
select pg_temp.verify(jsonb_array_length(public.get_role_comments('{b}','J052',current_setting('test.b')::jsonb->>'token')->'comments')=0);
select pg_temp.denied(format('select public.save_role_comment(%L,''J052'',''{oid}'',''forged owner reply'',1,%L)','{a}',current_setting('test.a')::jsonb->>'token'));
select public.save_role_comment('{a}','J052','{cid}','Edited comment',1,current_setting('test.a')::jsonb->>'token');
select pg_temp.denied(format('select public.save_role_comment(%L,''J052'',''{cid}'',''stale overwrite'',1,%L)','{a}',current_setting('test.a')::jsonb->>'token'));
select pg_temp.denied(format('select public.save_role_comment(%L,''J999999'',''%s'',''unknown role'',null,%L)','{a}',gen_random_uuid(),current_setting('test.a')::jsonb->>'token'));
select pg_temp.denied(format('select public.save_role_comment(%L,''J052'',''%s'','''',null,%L)','{a}',gen_random_uuid(),current_setting('test.a')::jsonb->>'token'));
select pg_temp.denied(format('select public.save_role_comment(%L,''J052'',''%s'',%L,null,%L)','{a}',gen_random_uuid(),repeat('x',4001),current_setting('test.a')::jsonb->>'token'));
select pg_temp.verify(not (public.get_shared_crm('job-search') ? 'comments'));
set local role authenticated;
select set_config('request.jwt.claims','{{"sub":"{owner}","role":"authenticated"}}',true);
select pg_temp.verify(jsonb_array_length(public.get_role_comments('{a}','J052')->'comments')=2);
select pg_temp.denied('select public.save_role_comment(''{a}'',''J052'',''{cid}'',''owner cannot impersonate viewer'',2)');
select set_config('test.a_new',public.manage_crm_reviewer('{a}','','rotate')::text,true);
set local role anon;
select set_config('request.jwt.claims','{{}}',true);
select pg_temp.denied(format('select public.get_role_comments(%L,''J052'',%L)','{a}',current_setting('test.a')::jsonb->>'token'));
select pg_temp.verify(jsonb_array_length(public.get_role_comments('{a}','J052',current_setting('test.a_new')::jsonb->>'token')->'comments')=2);
set local role authenticated;
select set_config('request.jwt.claims','{{"sub":"{owner}","role":"authenticated"}}',true);
select public.manage_crm_reviewer('{a}','','revoke');
select pg_temp.verify(jsonb_array_length(public.get_role_comments('{a}','J052')->'comments')=2);
set local role anon;
select set_config('request.jwt.claims','{{}}',true);
select pg_temp.denied(format('select public.get_role_comments(%L,''J052'',%L)','{a}',current_setting('test.a_new')::jsonb->>'token'));
-- Another authenticated user cannot read or manage the owner's threads.
set local role authenticated;
select set_config('request.jwt.claims','{{"sub":"{uuid.uuid4()}","role":"authenticated"}}',true);
select pg_temp.verify(public.list_crm_reviewers()='[]'::jsonb);
select pg_temp.denied('select public.get_role_comments(''{a}'',''J052'')');
select pg_temp.denied('select public.manage_crm_reviewer(''{a}'','''',''rotate'')');
reset role;
rollback;
"""
# Do not print query results: they include temporary access tokens.
try:call('https://api.supabase.com/v1/projects/'+setup['project_ref']+'/database/query',{'Authorization':'Bearer '+setup['management_access_token']},'POST',{'query':q})
except RuntimeError:
 # Retrieve only the database error message, never the generated SQL or tokens.
 import urllib.request,urllib.error
 req=urllib.request.Request('https://api.supabase.com/v1/projects/'+setup['project_ref']+'/database/query',headers={'Authorization':'Bearer '+setup['management_access_token'],'Content-Type':'application/json'},data=json.dumps({'query':q}).encode())
 try:urllib.request.urlopen(req)
 except urllib.error.HTTPError as e:print(e.read().decode()[:1200])
 raise
print('PASS: owner/viewer isolation, anonymous table denial, cross-viewer denial, own-only edits, role validation, size limits, idempotency, stale-edit rejection, rotation, revocation, and public projection. All test changes rolled back.')
