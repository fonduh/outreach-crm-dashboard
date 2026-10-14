"""Provision isolated Torus demo tables and private capability links. Sends no messages."""
import argparse,hashlib,json,secrets,subprocess
from pathlib import Path
from setup_backend import call,private_json
ROOT=Path(__file__).resolve().parents[1]
def query(sql):
 setup=json.loads((ROOT/'supabase-setup-access.private.json').read_text())
 return call('https://api.supabase.com/v1/projects/'+setup['project_ref']+'/database/query',{'Authorization':'Bearer '+setup['management_access_token']},'POST',{'query':sql})
def quote(s):return "'"+s.replace("'","''")+"'"
def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['install','create','rotate','revoke']);p.add_argument('--viewer',choices=['fonda','marcus']);a=p.parse_args()
 if a.action=='install':
  query((ROOT/'backend/torus.sql').read_text())
  seed=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {makeSeed} from './site/torus/model.mjs';console.log(JSON.stringify(makeSeed()));"],cwd=ROOT))
  query("insert into torus_private.workspaces(id,payload) values('torus-demo',"+quote(json.dumps(seed))+"::jsonb) on conflict(id) do nothing;")
  print('Isolated Torus schema installed; existing CRM and demo data preserved.');return
 if not a.viewer:p.error('--viewer is required')
 slug='torus-'+a.viewer; token=secrets.token_hex(32);h=hashlib.sha256(token.encode()).hexdigest()
 if a.action=='create':sql="insert into torus_private.links(slug,workspace_id,name,token_hash) values("+','.join(map(quote,[slug,'torus-demo',a.viewer.title(),h]))+") returning slug;"
 elif a.action=='rotate':sql="update torus_private.links set token_hash="+quote(h)+",enabled=true where slug="+quote(slug)+" returning slug;"
 else:sql="update torus_private.links set enabled=false where slug="+quote(slug)+" returning slug;"
 result=query(sql)
 if not result:raise RuntimeError('Link not found; no access changed.')
 record={'slug':slug,'name':a.viewer.title(),'enabled':a.action!='revoke'}
 if a.action!='revoke':record['url']='https://fonduh.github.io/outreach-crm-dashboard/torus/?viewer='+slug+'#access='+token
 folder=ROOT/'artifacts/torus';folder.mkdir(parents=True,exist_ok=True);target=folder/(a.viewer+'.private.json');private_json(target,record)
 print(a.action+' completed. Private link saved to '+str(target))
if __name__=='__main__':main()
