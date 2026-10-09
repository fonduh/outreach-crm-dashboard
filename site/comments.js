'use strict';
(() => {
 const root=document.querySelector('#role-comments'),manage=document.querySelector('#viewing-links');
 let job=null,mode='',reviewer=null,reviewers=[],active='',ticket=0,editor=null,thread=null,feedback=null,form=null,editing=null,pendingId=null,loading=false;
 const drafts=new Map(),node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
 const rpc=(name,args)=>window.CRMCommentsTransport.rpc(name,args);
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
 const status=(text,error=false)=>{if(feedback){feedback.textContent=text;feedback.classList.toggle('error',error);}};
 function stash(){if(active&&editor)drafts.set(active,{text:editor.value,editing,pendingId});}
 function clear(){ticket++;mode='';job=null;reviewer=null;active='';editor=null;drafts.clear();root.replaceChildren();root.hidden=true;if(manage)manage.hidden=true;document.querySelector('#viewing-links-dialog')?.close();document.querySelector('#viewing-links-dialog')?.remove();}
 async function listReviewers(){reviewers=await rpc('list_crm_reviewers',{});if(!reviewers.some(r=>r.slug===reviewer?.slug))reviewer=reviewers[0]||null;}
 async function show(next,data){
  const nextMode=data?.reviewer?'viewer':data?.storage==='private'?'owner':'';
  if(!nextMode){clear();return;}
  if(manage)manage.hidden=nextMode!=='owner';
  if(mode!==nextMode){stash();ticket++;reviewer=null;active='';drafts.clear();}
  mode=nextMode;job=next;
  if(!job){root.hidden=true;return;}
  if(mode==='viewer')reviewer=data.reviewer;
  if(mode==='owner'&&!reviewer&&!loading){loading=true;try{await listReviewers();}catch(e){root.hidden=false;root.textContent=e.message;return;}finally{loading=false;}}
  if(mode!==nextMode||!job)return;
  const key=[mode,reviewer?.slug||'',job.id].join(':');
  if(key===active){if(!editor?.value&&!editing)refresh();return;}
  stash();active=key;ticket++;build();refresh();
 }
 function build(){
  root.hidden=false;root.replaceChildren();root.append(node('h3','Private comments'),node('p',job.title,'hint'));
  if(mode==='owner'){
   const label=node('label','Discussion with');label.htmlFor='comment-reviewer';const select=node('select');select.id='comment-reviewer';
   for(const r of reviewers){const option=node('option',r.display_name+(r.enabled?'':' · link revoked'));option.value=r.slug;select.append(option);}select.value=reviewer?.slug||'';
   select.onchange=()=>{stash();reviewer=reviewers.find(r=>r.slug===select.value);active=[mode,reviewer.slug,job.id].join(':');ticket++;build();refresh();};root.append(label,select);
  }
  if(!reviewer){root.append(node('p','Create a private viewing link to start a discussion.','hint'));return;}
  root.append(node('p',mode==='viewer'?'Only you and Fonda can read this discussion. Keep your full viewing link private.':'Only you and '+reviewer.display_name+' can read this discussion.','hint'));
  thread=node('div','','comment-thread');thread.setAttribute('aria-live','polite');root.append(thread);
  form=node('form');const label=node('label',mode==='owner'?'Write a reply':'Add a comment about this role');label.htmlFor='role-comment-body';editor=node('textarea');editor.id='role-comment-body';editor.maxLength=4000;editor.required=true;editor.placeholder='Suggestions, introductions, or feedback…';
  const draft=drafts.get(active);editor.value=draft?.text||'';editing=draft?.editing||null;pendingId=draft?.pendingId||null;
  const actions=node('div','','actions'),submit=node('button',editing?'Save edit':'Post comment');submit.type='submit';submit.className='primary';submit.id='post-role-comment';const cancel=button('Cancel edit',()=>{editing=null;pendingId=null;editor.value='';stash();build();refresh();});cancel.hidden=!editing;actions.append(submit,cancel);
  feedback=node('p','','comment-feedback');feedback.setAttribute('role','status');form.append(label,editor,actions,feedback);root.append(form);
  editor.oninput=stash;
  form.onsubmit=async e=>{
   e.preventDefault();if(!editor.value.trim()){status('Enter a comment first.',true);return;}
   const target=active,slug=reviewer.slug,jobId=job.id,body=editor.value,id=editing?.id||(pendingId||=crypto.randomUUID()),version=editing?.version??null;stash();submit.disabled=true;status('Saving…');
   try{await rpc('save_role_comment',{p_slug:slug,p_job_id:jobId,p_id:id,p_body:body,p_version:version});drafts.delete(target);if(active!==target)return;editor.value='';editing=null;pendingId=null;submit.textContent='Post comment';cancel.hidden=true;status('Saved');await refresh();}
   catch(err){if(active===target)status(err.message,true);}
   finally{if(active===target)submit.disabled=false;}
  };
 }
 async function refresh(){
  if(!reviewer||!job||root.hidden)return;const target=active,t=++ticket,slug=reviewer.slug,jobId=job.id;
  try{const result=await rpc('get_role_comments',{p_slug:slug,p_job_id:jobId});if(t!==ticket||target!==active)return;thread.replaceChildren();
   if(!result.comments.length)thread.append(node('p','No comments on this role yet.','hint'));
   for(const c of result.comments){const item=node('article','','comment');const who=c.author_role==='owner'?'Fonda':result.display_name;
    item.append(node('small',who+' · '+new Date(c.created_at).toLocaleString()+(c.version>1?' · edited':'')),node('p',c.body));
    if(c.author_role===result.actor)item.append(button('Edit',()=>{stash();drafts.set(active,{text:c.body,editing:c,pendingId:null});build();refresh();editor.focus();}));thread.append(item);}
  }catch(e){if(t!==ticket||target!==active)return;thread.replaceChildren();status(e.message,true);if(mode==='viewer'){form.hidden=true;thread.append(node('p','This private discussion is unavailable. Open the latest full viewing link.','hint'));}}
 }
 function shareURL(r){const url=new URL('share/'+r.slug,document.baseURI);url.hash=new URLSearchParams({access:r.token}).toString();return url.href;}
 async function manager(){
  document.querySelector('#viewing-links-dialog')?.remove();const dialog=node('dialog');dialog.id='viewing-links-dialog';const close=button('Done',()=>dialog.close());dialog.append(node('h2','Private viewing links'),node('p','Each person gets a separate discussion on every role. A full link grants access to that person’s comments; the name alone does not.'));
  const list=node('div'),result=node('div'),message=node('p');message.setAttribute('role','status');
  const create=node('form'),name=node('input'),slug=node('input');name.id='reviewer-name';name.required=true;name.maxLength=80;slug.id='reviewer-slug';slug.required=true;slug.pattern='[a-z0-9][a-z0-9-]{0,59}';slug.maxLength=60;
  for(const [text,input] of [['Person’s name',name],['Link name, e.g. niral',slug]]){const label=node('label',text);label.htmlFor=input.id;create.append(label,input);}
  name.oninput=()=>{if(!slug.dataset.edited)slug.value=name.value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);};slug.oninput=()=>slug.dataset.edited='true';
  const add=node('button','Create viewing link','primary');add.type='submit';create.append(add);dialog.append(list,create,result,message,close);document.body.append(dialog);dialog.showModal();
  async function act(action,s,n=''){
   message.textContent='Saving…';dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const r=await rpc('manage_crm_reviewer',{p_slug:s,p_name:n,p_action:action});result.replaceChildren();if(r.token){result.className='link-result';result.append(node('strong','Private link for '+r.display_name));const input=node('input');input.value=shareURL(r);input.readOnly=true;input.setAttribute('aria-label','Private viewing link');result.append(input,button('Copy link',async()=>{try{await navigator.clipboard.writeText(input.value);message.textContent='Link copied.';}catch{input.select();message.textContent='Select and copy the full link.';}}),node('p','Copy this link now. Replacing it later disables the old link but keeps the discussion.','hint'));}message.textContent=action==='revoke'?'Link revoked. Existing comments are still visible to you.':'Saved';await render();active='';if(job)show(job,{storage:'private'});}
   catch(e){message.textContent=e.message;}finally{dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  async function render(){await listReviewers();list.replaceChildren();for(const r of reviewers){const row=node('div','','reviewer-row');row.append(node('strong',r.display_name),node('p','/share/'+r.slug+(r.enabled?' · active':' · revoked'),'hint'));const actions=node('div','','actions');actions.append(button(r.enabled?'Replace link':'Create replacement link',()=>{if(confirm('Replace '+r.display_name+'’s viewing link? The old link will stop working.'))act('rotate',r.slug);}));if(r.enabled)actions.append(button('Revoke access',()=>{if(confirm('Revoke '+r.display_name+'’s access?'))act('revoke',r.slug);}));row.append(actions);list.append(row);}}
  create.onsubmit=e=>{e.preventDefault();act('create',slug.value.trim(),name.value.trim());};try{await render();}catch(e){message.textContent=e.message;}
 }
 if(manage)manage.onclick=manager;
 window.CRMComments={show,clear};
 setInterval(()=>{if(!document.hidden&&active&&!editor?.value&&!editing)refresh();},15000);
})();
