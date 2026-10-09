"""Create, replace, or revoke a private viewing link without sending it to anyone."""
import argparse,json,re,uuid
from pathlib import Path
from setup_backend import call,private_json
root=Path(__file__).resolve().parents[1]
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['create','rotate','revoke']);parser.add_argument('slug');parser.add_argument('--name',default='');args=parser.parse_args()
 if not re.fullmatch('[a-z0-9][a-z0-9-]{0,59}',args.slug):parser.error('Use lowercase letters, numbers, and hyphens for the link name.')
 if args.action=='create' and not 1<=len(args.name.strip())<=80:parser.error('Provide --name for a new viewer.')
 setup=json.loads((root/'supabase-setup-access.private.json').read_text());cfg=json.loads((root/'sync/config.private.json').read_text());owner=str(uuid.UUID(cfg['CRM_OWNER_ID']));quote=lambda s:"'"+s.replace("'","''")+"'"
 query="begin; set local role authenticated; select set_config('request.jwt.claims',"+quote(json.dumps({'sub':owner,'role':'authenticated'}))+",true); select public.manage_crm_reviewer("+','.join(map(quote,[args.slug,args.name,args.action]))+") as link; commit;"
 rows=call('https://api.supabase.com/v1/projects/'+setup['project_ref']+'/database/query',{'Authorization':'Bearer '+setup['management_access_token']},'POST',{'query':query})
 record=next(r['link'] for r in rows if 'link' in r)
 if record.get('token'):record['url']='https://fonduh.github.io/outreach-crm-dashboard/share/'+record['slug']+'#access='+record['token']
 folder=root/'artifacts'/'reviewer-links';folder.mkdir(parents=True,exist_ok=True);target=folder/(args.slug+'.private.json');private_json(target,record)
 print(args.action+' completed. Private link record: '+str(target))
if __name__=='__main__':main()
