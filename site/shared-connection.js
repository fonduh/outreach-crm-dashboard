'use strict';
window.CRM_AUDIENCE = true;
(() => {
 const config=window.CRM_PUBLIC_CONFIG;
 const client=window.supabase.createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 window.CRMCommentsTransport={rpc:async(name,args={})=>{const {data,error}=await client.rpc(name,{...args,p_token:window.CRM_VIEWER?.token||null});if(error)throw Error(error.message||'Comments could not load.');return data;}};
 const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 window.CRMData={
  async load(){
   try{
    let reviewer=null;
    if(window.CRM_VIEWER?.requested){if(!window.CRM_VIEWER.slug)throw Error('This private viewing link is unavailable.');reviewer=await window.CRMCommentsTransport.rpc('get_reviewer_context',{p_slug:window.CRM_VIEWER.slug});}
    const {data,error}=await client.rpc('get_shared_crm',{share_slug:'job-search'});
    if(error)throw Error('The shared view could not load. Please try again shortly.');
    if(!data)throw Error('This shared view is not available.');
    document.querySelector('#connection-banner').textContent='Shared view · updated '+new Date(data.read_at).toLocaleString()+(reviewer?' · private discussion with '+reviewer.display_name:' · read only');
    document.querySelector('#process-save').textContent=reviewer?'Application details are read only · comments save privately.':'Read-only application overview · no sign-in required.';
    document.body.classList.toggle('totals-only',data.detail_level==='totals');
    return reply({...data,reviewer});
   }catch(e){window.CRMComments?.clear();return reply({ok:false,error:e.message},400);}
  },
  async saveTags(){return reply({ok:false,error:'This shared view is read only.'},403);}
 };
})();
