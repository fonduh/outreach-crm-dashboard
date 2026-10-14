"""Temporary workspace for real browser transport checks. Never touches demo records."""
import sys,secrets,hashlib,json,uuid
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from manage_torus import query,quote
from setup_backend import private_json
p=root/'artifacts/torus/test-links.private.json'
if sys.argv[1]=='create':
 w='browser-'+uuid.uuid4().hex;records={}
 query("insert into torus_private.workspaces(id,payload) select "+quote(w)+",payload from torus_private.workspaces where id='torus-demo';")
 for name in ['Fonda','Marcus']:
  slug=w+'-'+name.lower();token=secrets.token_hex(32)
  query("insert into torus_private.links(slug,workspace_id,name,token_hash) values("+','.join(map(quote,[slug,w,name,hashlib.sha256(token.encode()).hexdigest()]))+");")
  records[name]={'slug':slug,'token':token}
 private_json(p,{'workspace':w,'links':records});print('Temporary browser workspace created.')
else:
 d=json.loads(p.read_text());w=quote(d['workspace']);assert d['workspace'].startswith('browser-')
 query('begin; delete from torus_private.notes where workspace_id='+w+';delete from torus_private.activity where workspace_id='+w+';delete from torus_private.links where workspace_id='+w+';delete from torus_private.workspaces where id='+w+';commit;');p.unlink();print('Temporary browser workspace removed.')
