'use strict';
window.CRM_AUDIENCE = true;
(() => {
 const config=window.CRM_PUBLIC_CONFIG;
 const client=window.supabase.createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 window.CRMData={
  async load(){
   try{
    const {data,error}=await client.rpc('get_shared_crm',{share_slug:'job-search'});
    if(error)throw Error('The shared view could not load. Please try again shortly.');
    if(!data)throw Error('This shared view is not available.');
    document.querySelector('#connection-banner').textContent='Shared view · updated '+new Date(data.read_at).toLocaleString()+' · read only';
    document.body.classList.toggle('totals-only',data.detail_level==='totals');
    return reply(data);
   }catch(e){return reply({ok:false,error:e.message},400);}
  },
  async saveTags(){return reply({ok:false,error:'This shared view is read only.'},403);}
 };
})();
