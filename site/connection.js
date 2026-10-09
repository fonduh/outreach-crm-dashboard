'use strict';
(() => {
 const prefix='private-crm-pages:'+location.pathname.replace(/index\.html$/,''),configKey=prefix+'config',fileKey=prefix+'snapshot';
 let config=null,client=null,channel=null,snapshot=null,signingOut=false,connectionVersion=0;
 const $=s=>document.querySelector(s),reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 function changed(){window.dispatchEvent(new Event('crm-data-changed'));}
 function banner(text){$('#connection-banner').textContent=text;}
 function authStatus(text){$('#auth-state').textContent=text;}
 function validateSnapshot(value){const d=value.payload||value;for(const key of ['jobs','companies','contacts','job_activity','job_contacts'])if(!Array.isArray(d[key]))throw Error('This is not a CRM snapshot: missing '+key);if(d.jobs.some(j=>!j.id||!j.company_id||!j.status))throw Error('Snapshot contains incomplete job records.');if(d.jobs.length>10000)throw Error('Snapshot is too large.');return structuredClone({...d,ok:true,read_at:d.read_at||new Date().toISOString()});}
 function validateConfig(url,key){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/')throw Error('Use the HTTPS root URL of your Supabase project.');if(key.startsWith('sb_secret_'))throw Error('A secret key cannot be used in the browser. Use the publishable key.');if(key.startsWith('eyJ')){let claims;try{claims=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{throw Error('Invalid public key.');}if(claims.role!=='anon')throw Error('Only a public anon key is allowed here.');}else if(!key.startsWith('sb_publishable_'))throw Error('Use the public publishable or anon key.');return {url:u.origin,key};}
 function connect(next){connectionVersion++;if(channel&&client)client.removeChannel(channel);if(client)client.auth.stopAutoRefresh();config=next;client=window.supabase.createClient(config.url,config.key,{auth:{storageKey:prefix+'auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>{authStatus(session?'Signed in as '+session.user.email:'Not signed in');$('#connection-button').textContent=session?'Account / data':'Sign in';subscribe(session?.user.id);changed();},0);});}
 function subscribe(owner){if(channel){client.removeChannel(channel);channel=null;}if(!owner)return;channel=client.channel('crm-private-'+owner).on('postgres_changes',{event:'*',schema:'public',table:'crm_snapshots',filter:'owner_id=eq.'+owner},changed).subscribe();}
 function empty(){return {ok:true,storage:'empty',read_at:new Date().toISOString(),jobs:[],companies:[],contacts:[],job_activity:[],job_contacts:[]};}
 try{const raw=localStorage.getItem(configKey),c=raw?JSON.parse(raw):window.CRM_PUBLIC_CONFIG;if(c){config=validateConfig(c.url,c.key);connect(config);}}catch(e){authStatus(e.message);}
 try{const raw=sessionStorage.getItem(fileKey);if(raw)snapshot=validateSnapshot(JSON.parse(raw));}catch{}
 window.CRMCommentsTransport={rpc:async(name,args={})=>{if(!client)throw Error('Sign in to use private comments.');const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Sign in to use private comments.');const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message||'The request failed.');return data;}};
 window.CRMData={
  async load(){
   const version=connectionVersion;
   if(signingOut)return reply(empty());
   try{
    if(client){const {data:{session},error}=await client.auth.getSession();if(error)throw error;if(session){
     const {data:row,error}=await client.from('crm_snapshots').select('payload,updated_at').eq('owner_id',session.user.id).maybeSingle();if(error)throw error;
     if(signingOut||version!==connectionVersion)return reply(empty());
     if(!row){banner('Signed in. Waiting for the first upload from your local CRM sync.');return reply(empty());}
     const data=validateSnapshot(row.payload);const {data:requests,error:requestError}=await client.from('crm_tag_requests').select('id,status,error').eq('owner_id',session.user.id).in('status',['pending','rejected']);
     if(signingOut||version!==connectionVersion)return reply(empty());
     const pending=(requests||[]).filter(r=>r.status==='pending').length,rejected=(requests||[]).filter(r=>r.status==='rejected').length;
     banner('Private CRM · synced '+new Date(row.updated_at).toLocaleString()+(pending?' · '+pending+' tag change(s) waiting for local sync':'')+(rejected?' · '+rejected+' tag change(s) need review in the sync log':'')+(requestError?' · tag queue unavailable':''));
     return reply({...data,storage:'private',read_at:row.updated_at});
    }}
    if(snapshot){banner('Local snapshot · stays in this browser tab · refresh by opening a newer export');return reply({...snapshot,storage:'browser'});}
    if(client){
     const {data:shared,error}=await client.rpc('get_shared_crm',{share_slug:'job-search'});
     if(signingOut||version!==connectionVersion)return reply(empty());
     if(error||!shared)throw Error('The shared CRM could not load. Try Refresh CRM or sign in for private access.');
     const data=validateSnapshot(shared);
     banner('CRM connected · public overview · updated '+new Date(data.read_at).toLocaleString()+'. Sign in for private notes and company relationships.');
     return reply({...data,storage:'shared',read_only:true});
    }
    banner('Connect your private backend or open a local CRM snapshot.');return reply(empty());
   }catch(e){return reply({ok:false,error:e.message},400);}
  },
  async saveTags(companyId,tags,expectedTags){
   try{
    if(client){const {data:{session}}=await client.auth.getSession();if(session){const {error}=await client.from('crm_tag_requests').insert({owner_id:session.user.id,company_id:companyId,tags,expected_tags:expectedTags,status:'pending'});if(error)throw error;setTimeout(changed,50);return reply({ok:true,pending:true});}}
    if(!snapshot)throw Error('Open your private CRM data first.');const c=snapshot.companies.find(c=>c.id===companyId);if(!c)throw Error('Company not found.');c.relationship_tags=tags.join('|');sessionStorage.setItem(fileKey,JSON.stringify(snapshot));return reply({ok:true,storage:'browser',company:c});
   }catch(e){return reply({ok:false,error:e.message},400);}
  }
 };
 function openConnection(e){e?.preventDefault();$('#project-url').value=config?.url||'';$('#public-key').value=config?.key||'';$('#backend-settings').open=!config;$('#connection-dialog').showModal();}
 $('#connection-button').onclick=openConnection;$('#privacy-link').onclick=openConnection;$('#connection-close').onclick=()=>$('#connection-dialog').close();
 $('#email-login').onclick=async()=>{const button=$('#email-login');button.disabled=true;try{const next=validateConfig($('#project-url').value.trim(),$('#public-key').value.trim());const email=$('#auth-email').value.trim();if(!email||!$('#auth-email').checkValidity())throw Error('Enter your sign-in email.');localStorage.setItem(configKey,JSON.stringify(next));connect(next);const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});if(error)throw error;authStatus('Check your email for the sign-in link. It will return you to this dashboard.');}catch(e){authStatus(e.message);}finally{button.disabled=false;}};
 $('#sign-out').onclick=async()=>{
  const button=$('#sign-out');button.disabled=true;signingOut=true;window.CRMComments?.clear();connectionVersion++;snapshot=null;sessionStorage.removeItem(fileKey);changed();
  try{if(client)await client.auth.signOut({scope:'local'});}catch{}
  finally{
   // A revoked/expired session can make the server reject logout. Always clear
   // this device's saved credentials and recreate the client without its cache.
   localStorage.removeItem(prefix+'auth');localStorage.removeItem(prefix+'auth-code-verifier');
   if(config)connect(config);signingOut=false;button.disabled=false;authStatus('Signed out on this device');changed();
  }
 };
 $('#snapshot-file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>10000000)throw Error('Choose a snapshot under 10 MB.');const parsed=validateSnapshot(JSON.parse(await f.text()));sessionStorage.setItem(fileKey,JSON.stringify(parsed));snapshot=parsed;authStatus('Local snapshot opened. It was not uploaded.');$('#connection-dialog').close();changed();}catch(e){authStatus(e.message);}};
 $('#snapshot-clear').onclick=()=>{sessionStorage.removeItem(fileKey);snapshot=null;authStatus('Local snapshot cleared.');changed();};
 $('#snapshot-export').onclick=()=>{if(!snapshot){authStatus('No local snapshot is open.');return;}const u=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='private-crm-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);};
})();
