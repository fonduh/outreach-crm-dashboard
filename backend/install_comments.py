"""Install only the private role-discussion schema in the existing project."""
import json
from pathlib import Path
from setup_backend import call
root=Path(__file__).resolve().parents[1]
setup=json.loads((root/'supabase-setup-access.private.json').read_text())
config=json.loads((root/'sync/config.private.json').read_text())
assert config['SUPABASE_URL']==setup['project_url']
call('https://api.supabase.com/v1/projects/'+setup['project_ref']+'/database/query',
 {'Authorization':'Bearer '+setup['management_access_token']},'POST',{'query':(root/'backend/comments.sql').read_text()})
print('Private role-comment schema installed in the existing CRM project.')
