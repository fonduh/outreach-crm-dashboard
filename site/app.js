'use strict';
const $=s=>document.querySelector(s),KEY=window.CRM_AUDIENCE?'shared-job-application-process-v1':'job-application-process-v1',HEADERS={'Content-Type':'application/json'};
const BUCKETS={not_started:'Not applied',applied:'Awaiting response',recruiter_screen:'Recruiter screen',take_home:'Take-home',interview:'Interview process',onsite:'Onsite',offer:'Offer',rejected:'Rejected',withdrawn:'Withdrawn'};
const AGGREGATES=new Set(['INTERESTED','APPLIED_TOTAL','INTERVIEW_TOTAL']);
const LEGACY_SOURCE=`flowchart LR
    SAVED["Saved / research"] --> APPLIED["Applied"]
    SAVED -. "Build a connection" .-> NETWORK["Referral / outreach"]
    NETWORK --> APPLIED
    APPLIED --> SCREEN["Recruiter screen"]
    SCREEN --> TASK["Take-home"]
    TASK --> INTERVIEW["Interviews"]
    INTERVIEW --> OFFER["Offer"]
    APPLIED -. "Exit at any stage" .-> CLOSED["Closed"]`;
const PREVIOUS_DEFAULT_SOURCE=`flowchart LR
    INTERESTED["Interested · {{INTERESTED}}"] --> READY["Not applied · {{READY}}"]
    INTERESTED --> APPLIED_TOTAL["Applied / recruiting · {{APPLIED_TOTAL}}"]
    APPLIED_TOTAL --> APPLIED["Awaiting response · {{APPLIED}}"]
    APPLIED_TOTAL --> INTERVIEW_TOTAL["Interview process · {{INTERVIEW_TOTAL}}"]
    INTERVIEW_TOTAL --> SCREEN["Recruiter screen · {{SCREEN}}"]
    INTERVIEW_TOTAL --> TASK["Take-home · {{TASK}}"]
    INTERVIEW_TOTAL --> INTERVIEW["Interviews · {{INTERVIEW}}"]
    APPLIED_TOTAL --> OFFER["Offer · {{OFFER}}"]
    APPLIED_TOTAL --> CLOSED["Closed · {{CLOSED}}"]`;
const PREVIOUS_PUBLISHED_SOURCE="flowchart LR\n    INTERESTED --> APPLIED[\"Applied / recruiting · {{APPLIED}}\"]\n    APPLIED --> SCREEN[\"Recruiter screen · {{SCREEN}}\"]\n    SCREEN --> INTERVIEW[\"Interviews · {{INTERVIEW}}\"]\n    INTERVIEW --> OFFER[\"Offer · {{OFFER}}\"]\n    APPLIED --> CLOSED[\"Rejected · {{CLOSED}}\"]";
const DEFAULT_SOURCE=`flowchart LR
    INTERESTED["Interested · {{INTERESTED}}"] --> READY["Not applied · {{READY}}"]
    INTERESTED --> APPLIED_TOTAL["Applied / recruiting · {{APPLIED_TOTAL}}"]
    APPLIED_TOTAL --> APPLIED["Awaiting response · {{APPLIED}}"]
    APPLIED_TOTAL --> INTERVIEW_TOTAL["Interview process · {{INTERVIEW_TOTAL}}"]
    INTERVIEW_TOTAL --> SCREEN["Screen · {{SCREEN}}"]
    SCREEN --> TASK["Take Home · {{TASK}}"]
    TASK --> INTERVIEW["Interview · {{INTERVIEW}}"]
    INTERVIEW --> OFFER["Offer · {{OFFER}}"]
    APPLIED_TOTAL --> CLOSED["Closed · {{CLOSED}}"]`;
function defaults(){return {schemaVersion:2,processRevision:1,source:DEFAULT_SOURCE,draft:DEFAULT_SOURCE,bindings:{READY:['not_started'],APPLIED:['applied'],SCREEN:['recruiter_screen'],TASK:['take_home'],INTERVIEW:['interview','onsite'],OFFER:['offer'],CLOSED:['rejected','withdrawn']}};}
function migrateLegacy(old){
 if(old.schemaVersion!==1)return old;
 const transform=source=>{
  if(source===LEGACY_SOURCE)return DEFAULT_SOURCE;
  let text=source.replace(/\bSAVED\b/g,'READY').replaceAll('Saved / research','Not applied').replace('APPLIED["Applied"]','APPLIED["Awaiting response"]');
  text+='\n    INTERESTED["Interested · {{INTERESTED}}"] --> READY\n    INTERESTED --> APPLIED_TOTAL["Applied / recruiting · {{APPLIED_TOTAL}}"]\n    APPLIED_TOTAL --> APPLIED\n    APPLIED_TOTAL --> INTERVIEW_TOTAL["Interview process · {{INTERVIEW_TOTAL}}"]';
  return text;
 };
 const next=structuredClone(old);next.schemaVersion=2;next.source=transform(old.source);next.draft=old.draft===old.source?next.source:transform(old.draft);
 if(Object.hasOwn(next.bindings,'SAVED')){next.bindings.READY=next.bindings.SAVED;delete next.bindings.SAVED;}
 for(const id of AGGREGATES)delete next.bindings[id];
 return next;
}
function validateState(s){
 if(s?.schemaVersion===1)s=migrateLegacy(s);
 if(!s||s.schemaVersion!==2||typeof s.source!=='string'||typeof s.draft!=='string'||s.source.length>50000||s.draft.length>50000||!s.bindings||typeof s.bindings!=='object'||Array.isArray(s.bindings))throw Error('Choose a job-application process export (version 2).');
 const used=new Set();for(const [id,list] of Object.entries(s.bindings)){if(['__proto__','constructor','prototype'].includes(id)||AGGREGATES.has(id)||!Array.isArray(list))throw Error('Invalid stage binding.');for(const key of list){if(!BUCKETS[key]||used.has(key))throw Error('Invalid or duplicate CRM-stage mapping.');used.add(key);}}
 return structuredClone(s);
}
// Upgrade only shipped diagrams. Preserve custom sources, unfinished drafts and bindings.
function restoreInterviewSequence(saved){
 const next=validateState(saved);
 if(next.processRevision>=1)return next;
 const restore=source=>source===PREVIOUS_PUBLISHED_SOURCE&&window.CRM_PUBLISHED_PROCESS
  ?window.CRM_PUBLISHED_PROCESS.source:source===PREVIOUS_DEFAULT_SOURCE?DEFAULT_SOURCE:source;
 next.source=restore(next.source);next.draft=restore(next.draft);next.processRevision=1;
 return next;
}

let state=window.CRM_PUBLISHED_PROCESS?validateState(window.CRM_PUBLISHED_PROCESS):defaults(),data=null,nodes=[],history=[],selectedStage='',selectedJob='',bindingStage='APPLIED',statusFilter='',revision=0,zoom=1,box=null,busy=false;
try{
 const saved=window.CRM_AUDIENCE?null:localStorage.getItem(KEY);
 if(saved){
  const old=JSON.parse(saved);
  if(old.schemaVersion===1&&!localStorage.getItem(KEY+'-pre-interested'))localStorage.setItem(KEY+'-pre-interested',saved);
  state=restoreInterviewSequence(old);
  if(state.source!==old.source||state.draft!==old.draft){
   if(!localStorage.getItem(KEY+'-pre-interview-sequence'))localStorage.setItem(KEY+'-pre-interview-sequence',saved);
   localStorage.setItem(KEY,JSON.stringify(state));
  }
 }
}catch(e){setTimeout(()=>notice('Saved process could not be loaded; original storage has not been overwritten.'),1000);}

function el(tag,cls='',text=''){const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;}
function notice(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').hidden=true,6000);}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));$('#process-save').textContent='Process saved in this browser · export to keep a copy';}catch{$('#process-save').textContent='Browser save unavailable — export your process';}}
function remember(snapshot=state){history.push(structuredClone(snapshot));if(history.length>30)history.shift();$('#undo').disabled=false;}
function bound(id){return Object.hasOwn(state.bindings,id)?state.bindings[id]:[];}
function progressed(j){return j.status!=='not_started';}
function stageJobs(id,process=state){
 if(!data)return [];
 if(!id||id==='INTERESTED')return data.jobs;
 if(id==='APPLIED_TOTAL')return data.jobs.filter(progressed);
 if(id==='INTERVIEW_TOTAL')return data.jobs.filter(j=>j.status==='interview');
 if(id==='UNMAPPED')return data.jobs.filter(j=>groupFor(j)==='UNMAPPED');
 const buckets=Object.hasOwn(process.bindings,id)?process.bindings[id]:[];
 return data.jobs.filter(j=>buckets.includes(j.view_stage));
}
function renderSource(source,process=state){return source.replace(/\{\{([A-Za-z0-9_]+)\}\}/g,(_,id)=>data?String(stageJobs(id,process).length):'?');}
function groupFor(job){return nodes.find(n=>!AGGREGATES.has(n.id)&&bound(n.id).includes(job.view_stage))?.id||'UNMAPPED';}
function labelFor(id){return nodes.find(n=>n.id===id)?.label||id;}
function explicitAppliedIds(){return new Set([...data.job_activity.filter(a=>a.stage==='applied').map(a=>a.job_id),...data.jobs.filter(j=>j.explicit_application===true).map(j=>j.id)]);}
function company(job){return data.companies.find(c=>c.id===job.company_id)||{name:job.company_id,relationship_tags:''};}
function tags(c){return (c.relationship_tags||'').split('|').filter(Boolean);}
function isOpen(j){return !['rejected','withdrawn'].includes(j.status);}
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// Calendar-day ages use Pacific dates, including when a shared snapshot is offline.
function ageDays(job,field,asOf=new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'})){
 const days=job[field];if(!Number.isInteger(days)||days<0)return null;
 const stamp=job.age_as_of;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(stamp||''))return days;
 const elapsed=Math.floor((Date.parse(asOf+'T00:00:00Z')-Date.parse(stamp+'T00:00:00Z'))/86400000);
 return Number.isFinite(elapsed)?days+Math.max(0,elapsed):days;
}
function ageText(job,field){
 const days=ageDays(job,field);
 if(days!==null)return days+' '+(days===1?'day':'days');
 return field==='application_age_days'&&job.status==='not_started'?'Not applied':'Date unknown';
}
function applicationStage(job){
 const box=el('div','action-box');box.append(el('strong','','APPLICATION STAGE'),el('p','',BUCKETS[job.view_stage]||job.status));
 const age=el('div','stage-age','Days in application stage: '+ageText(job,'stage_age_days'));
 age.title='Calendar days since this stage was first recorded. Notes and follow-ups do not reset the count.';
 box.append(age);return box;
}
function due(j){return isOpen(j)&&j.next_step_date&&j.next_step_date<=today();}
function fit(){if(!box)return;const v=$('#chart-viewport'),svg=$('#chart svg');if(!svg)return;const scale=Math.min((v.clientWidth-30)/box.width,(v.clientHeight-20)/box.height)*zoom;svg.style.width=box.width*scale+'px';svg.style.height=box.height*scale+'px';$('#chart').style.width=svg.style.width;}
function selectStage(id){selectedStage=id;statusFilter='';if(id&&id!=='UNMAPPED'&&!AGGREGATES.has(id)){bindingStage=id;renderBindings();}renderAll();}
function renderStats(){
 const root=$('#stats');root.replaceChildren();const entries=[['Interested',data.jobs.length,''],['Applied / recruiting',data.jobs.filter(progressed).length,'progressed'],['Awaiting response',data.jobs.filter(j=>j.status==='applied').length,'applied'],['Interview process',data.jobs.filter(j=>j.status==='interview').length,'interview'],['Offers',data.jobs.filter(j=>j.status==='offer').length,'offer'],['Closed',data.jobs.filter(j=>!isOpen(j)).length,'closed']];
 for(const [label,count,filter] of entries){const b=el('button','stat');b.append(el('span','',label),el('strong','',String(count)));b.onclick=()=>{statusFilter=filter;selectedStage='';$('#focus').value='all';renderAll();};root.append(b);}
}
function renderChips(){
 const root=$('#stage-chips');root.replaceChildren();
 const groups=nodes.some(n=>n.id==='INTERESTED')?[...nodes]:[{id:'',label:'Interested'},...nodes];if(data.jobs.some(j=>groupFor(j)==='UNMAPPED'))groups.push({id:'UNMAPPED',label:'Unmapped'});
 for(const n of groups){const count=stageJobs(n.id).length;const b=el('button','chip'+((selectedStage===n.id||!selectedStage&&n.id==='INTERESTED')&&!statusFilter?' active':''),n.label+' · '+count);b.dataset.stage=n.id;b.onclick=()=>selectStage(n.id);root.append(b);}
 document.querySelectorAll('#chart .node').forEach(e=>e.classList.toggle('selected',e.dataset.stageId===selectedStage));
}
function renderBindings(){
 const select=$('#binding-stage');select.replaceChildren();for(const n of nodes.filter(n=>!AGGREGATES.has(n.id)))select.add(new Option(n.label,n.id));if(!nodes.some(n=>n.id===bindingStage&&!AGGREGATES.has(n.id)))bindingStage=nodes.find(n=>!AGGREGATES.has(n.id))?.id||'';select.value=bindingStage;
 const root=$('#binding-list');root.replaceChildren();if(!bindingStage){root.append(el('p','hint','Add a current-stage node to configure a group.'));return;}for(const [key,label] of Object.entries(BUCKETS)){const l=el('label'),b=document.createElement('input');b.type='checkbox';b.checked=bound(bindingStage).includes(key);b.dataset.bucket=key;
 b.onchange=()=>{remember();for(const id of Object.keys(state.bindings))state.bindings[id]=state.bindings[id].filter(x=>x!==key);if(b.checked){if(!Object.hasOwn(state.bindings,bindingStage))state.bindings[bindingStage]=[];state.bindings[bindingStage].push(key);}persist();applySource(state.source,{record:false,save:false,preserveDraft:true});};l.append(b,document.createTextNode(label));root.append(l);}
}
function visibleJobs(){
 const query=$('#search').value.toLowerCase().trim(),focus=$('#focus').value;
 return data.jobs.filter(j=>(!selectedStage||stageJobs(selectedStage).some(x=>x.id===j.id))&&(!statusFilter||(statusFilter==='closed'?!isOpen(j):statusFilter==='progressed'?progressed(j):j.status===statusFilter))&&(!query||[company(j).name,j.title,j.id].join(' ').toLowerCase().includes(query))&&(focus==='all'||focus==='open'&&isOpen(j)||focus==='due'&&due(j)||['champion','executive_sponsor'].includes(focus)&&tags(company(j)).includes(focus)))
 .sort((a,b)=>({interview:0,offer:1,applied:2,not_started:3,rejected:4,withdrawn:5}[a.status]-{interview:0,offer:1,applied:2,not_started:3,rejected:4,withdrawn:5}[b.status])||(b.last_activity_date||b.date_added||'').localeCompare(a.last_activity_date||a.date_added||'')||a.id.localeCompare(b.id));
}
function renderRoles(){
 const jobs=visibleJobs();if(!jobs.some(j=>j.id===selectedJob))selectedJob=jobs[0]?.id||'';
 $('#roles-title').textContent=selectedStage==='UNMAPPED'?'Unmapped roles':nodes.find(n=>n.id===selectedStage)?.label||(statusFilter==='closed'?'Closed roles':statusFilter==='progressed'?'Applied / recruiting':statusFilter?BUCKETS[statusFilter]:'Interested · all roles');$('#role-count').textContent=jobs.length+' roles';const root=$('#role-list');root.replaceChildren();
 for(const j of jobs){const c=company(j),b=el('button','role'+(selectedJob===j.id?' selected':''));b.dataset.job=j.id;const top=el('div','role-top');top.append(el('b','',c.name),el('span','status'+(!isOpen(j)?' closed':''),BUCKETS[j.view_stage]||j.status));b.append(top,el('div','role-title',j.title));const age=el('div','application-age','Total application age: '+ageText(j,'application_age_days'));age.title='Calendar days since the first recorded application date; unknown dates are not estimated.';b.append(age,el('div','next',data.read_only?'':j.next_step||'No next step recorded'));
 const bottom=el('div','role-bottom');bottom.append(el('span',due(j)?'due':'',data.read_only?labelFor(groupFor(j)):j.next_step_date?(due(j)?'Review due · ':'Review · ')+j.next_step_date:'No review date'),el('span','',tags(c).map(t=>t==='champion'?'Champion':'Exec sponsor').join(' · ')||j.id));b.append(bottom);b.onclick=()=>{selectedJob=j.id;renderRoles();renderDetails();};root.append(b);}
 if(!jobs.length)root.append(el('div','empty','No roles match this view. Use All roles or change your filters.'));
}
function sourceLinks(text,parent){for(const url of [...new Set(text.match(/https?:\/\/[^\s\])]+/g)||[])]){try{const u=new URL(url);const a=el('a','',u.hostname.includes('google')?'Email source ↗':'Source ↗');a.href=u.href;a.target='_blank';a.rel='noopener';parent.append(a,document.createTextNode(' '));}catch{}}}
function renderDetails(){
 const root=$('#job-details');root.replaceChildren();const j=data.jobs.find(j=>j.id===selectedJob);if(!j){$('#company-name').textContent='Choose a role';$('#job-id').textContent='';root.append(el('p','empty','Select a role from the list to see its next step and history.'));return;}
 const c=company(j);$('#company-name').textContent=c.name;$('#job-id').textContent=j.id;root.append(el('h3','',j.title),el('span','status'+(!isOpen(j)?' closed':''),BUCKETS[j.view_stage]||j.status));
 root.append(applicationStage(j));
 if(data.read_only){
  root.append(el('p','hint',explicitAppliedIds().has(j.id)?'Application submission recorded.':progressed(j)?'Recruiting activity recorded; submission date not established.':'Included in interested roles.'));
  root.append(el('p','hint','This shared view includes company, role, stage, and age in days.'));
  return;
 }
 if(/^https?:\/\//.test(j.url)){const a=el('a','','View posting ↗');a.href=j.url;a.target='_blank';a.rel='noopener';root.append(document.createTextNode(' · '),a);}
 const action=el('div','action-box');action.append(el('strong','','NEXT STEP'),el('p','',j.next_step||'No next step recorded.'),el('small','',j.next_step_date?'Internal review: '+j.next_step_date:'No internal review date'));root.append(action);
 root.append(el('h4','','Company relationships'));const tagBox=el('div','tags'),feedback=el('p','hint','Select either or both. Changes save at company level.');
 for(const [tag,label] of [['champion','Champion'],['executive_sponsor','Executive sponsor']]){const l=el('label'),input=document.createElement('input');input.type='checkbox';input.checked=tags(c).includes(tag);input.dataset.tag=tag;input.onchange=async()=>{const boxes=[...tagBox.querySelectorAll('input')],requested=boxes.filter(x=>x.checked).map(x=>x.dataset.tag);boxes.forEach(b=>b.disabled=true);feedback.textContent='Saving company tags…';try{const r=await window.CRMData.saveTags(c.id,requested,tags(c));const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'Save failed');if(!result.pending)c.relationship_tags=result.company.relationship_tags;feedback.textContent=result.pending?'Queued for your local CRM to sync':result.storage==='browser'?'Saved in this browser snapshot':'Saved to '+c.name;const previousJob=selectedJob;renderRoles();if(selectedJob!==previousJob)renderDetails();}catch(e){boxes.forEach(b=>b.checked=tags(c).includes(b.dataset.tag));feedback.textContent=e.message;feedback.classList.add('error');}finally{boxes.forEach(b=>b.disabled=false);}};l.append(input,document.createTextNode(label));tagBox.append(l);}root.append(tagBox,feedback);
 const contacts=data.job_contacts.filter(r=>r.job_id===j.id);root.append(el('h4','','People'));if(!contacts.length)root.append(el('p','contacts','No contact linked to this role.'));else for(const link of contacts){const p=data.contacts.find(p=>p.id===link.contact_id);root.append(el('p','contacts',(p?.name||link.contact_name||link.contact_id)+' · '+link.relationship.replaceAll('_',' ')));}
 root.append(el('h4','','Recorded activity'));const timeline=el('div','timeline');const events=data.job_activity.filter(a=>a.job_id===j.id).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));for(const a of events){const row=el('div','event');row.append(el('small','',a.date+' · '+a.stage.replaceAll('_',' ')));const clean=a.note.replace(/\[email-import:[^\]]*\]/g,'').replace(/https?:\/\/[^\s\])]+/g,'').replace(/Sources?:\s*[.;]?/g,'').trim();row.append(el('p','',clean));sourceLinks(a.note,row);timeline.append(row);}if(!events.length)timeline.append(el('p','hint','Interested only — no application activity recorded.'));root.append(timeline);
 if(j.notes){const details=el('details');details.append(el('summary','','Additional role notes'),el('p','',j.notes));root.append(details);}
}
function renderAll(){if(!data)return;document.body.classList.toggle('shared-data',!!data.read_only);document.body.classList.toggle('totals-only',data.detail_level==='totals');if(data.read_only&&['due','champion','executive_sponsor'].includes($('#focus').value))$('#focus').value='all';document.querySelector('.detail .eyebrow').textContent=data.read_only?'03 / APPLICATION STAGE':'03 / NEXT ACTION';const explicit=explicitAppliedIds();const progress=data.jobs.filter(progressed);$('#count-note').textContent='Interested includes every role. '+progress.length+' applied / recruiting: '+progress.filter(j=>explicit.has(j.id)).length+' explicit submissions, '+progress.filter(j=>!explicit.has(j.id)).length+' with other recruiting evidence. Parent totals overlap.';renderStats();renderChips();renderRoles();renderDetails();}
async function applySource(source,{replacement=null,save=true,record=true,preserveDraft=false}={}){
 const ticket=++revision,draftAtStart=state.draft;busy=true;$('#apply').disabled=true;$('#code-status').textContent='Rendering…';$('#code-status').classList.remove('error');
 try{if(source.length>50000)throw Error('Limit the process to 50,000 characters.');const parsed=await mermaid.mermaidAPI.getDiagramFromText(source);if(!['flowchart','flowchart-v2'].includes(parsed.type))throw Error('Use a Mermaid flowchart.');const verts=parsed.db.getVertices();const nextNodes=[...(verts instanceof Map?verts.entries():Object.entries(verts))].map(([id,v])=>({id,label:String(v.text||id).replace(/<[^>]*>/g,'').replace(/\s*·\s*\{\{[A-Za-z0-9_]+\}\}/g,'')}));if(!nextNodes.length||nextNodes.length>100)throw Error('Use 1–100 stages.');if(nextNodes.some(n=>['__proto__','constructor','prototype','UNMAPPED'].includes(n.id)))throw Error('Choose a different node ID for reserved names.');const {svg}=await mermaid.render('jobsMap'+ticket,renderSource(source,replacement||state));if(ticket!==revision)return false;
 if(record)remember(replacement?state:{...state,draft:state.source});const changed=!replacement&&state.draft!==draftAtStart;if(replacement)state=structuredClone(replacement);state.source=source;if(!preserveDraft&&!changed)state.draft=source;nodes=nextNodes;if(!nodes.some(n=>n.id===selectedStage))selectedStage='';$('#source').value=state.draft;$('#chart').innerHTML=svg;const v=$('#chart svg').viewBox.baseVal;box={width:v.width,height:v.height};
 for(const g of document.querySelectorAll('#chart .node')){const n=[...nodes].sort((a,b)=>b.id.length-a.id.length).find(n=>g.id.startsWith('flowchart-'+n.id+'-'));if(!n)continue;g.dataset.stageId=n.id;g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label','Show roles in '+n.label);g.onclick=()=>selectStage(n.id);g.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();selectStage(n.id);}};}
 renderBindings();renderAll();fit();$('#code-status').textContent=state.draft===source?'Valid flowchart · counts reflect current CRM':'Draft differs from chart · Apply to preview';if(save)persist();return true;
 }catch(e){if(ticket===revision){$('#code-status').textContent='Previous chart kept. '+String(e.message||e).slice(0,250);$('#code-status').classList.add('error');}return false;}finally{if(ticket===revision){busy=false;$('#apply').disabled=false;}}
}
async function refresh(){const button=$('#refresh');button.disabled=true;try{const r=await window.CRMData.load();const next=await r.json();if(!r.ok||!next.ok)throw Error(next.error||'CRM could not load');data=next;$('#live-status').textContent=next.storage==='empty'?'No CRM connected':next.storage==='browser'?'Local snapshot · '+next.read_at.slice(0,10):next.storage==='shared'?'Updated · '+new Date(next.read_at).toLocaleString():'Private sync · '+new Date(next.read_at).toLocaleString();$('#live-status').classList.remove('error');renderAll();if(nodes.length)await applySource(state.source,{record:false,save:false,preserveDraft:true});}catch(e){$('#live-status').textContent=data?'Refresh failed · previous data shown':'CRM unavailable';$('#live-status').classList.add('error');notice(e.message);}finally{button.disabled=false;}}
function download(name,text,type='text/plain'){const u=URL.createObjectURL(new Blob([text],{type})),a=el('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}
function confirm(title,text,action){$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;$('#confirm').showModal();$('#confirm-ok').onclick=()=>{$('#confirm').close();action();};}
$('#source').value=state.draft;$('#source').oninput=()=>{state.draft=$('#source').value;persist();$('#code-status').textContent='Draft saved · Apply to update the map';};$('#source').onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();$('#apply').click();}};$('#apply').onclick=()=>applySource($('#source').value);
$('#binding-stage').onchange=e=>{bindingStage=e.target.value;renderBindings();};$('#search').oninput=()=>{renderRoles();renderDetails();};$('#focus').onchange=()=>{renderRoles();renderDetails();};$('#all').onclick=()=>{statusFilter='';selectedStage='';$('#focus').value='all';$('#search').value='';renderAll();};$('#refresh').onclick=refresh;
$('#zoom-in').onclick=()=>{zoom=Math.min(zoom*1.3,5);fit();};$('#zoom-out').onclick=()=>{zoom=Math.max(zoom/1.3,.4);fit();};$('#fit').onclick=()=>{zoom=1;fit();};new ResizeObserver(fit).observe($('#chart-viewport'));
$('#undo').onclick=async()=>{if(!history.length||busy)return;if(await applySource(history.at(-1).source,{replacement:history.at(-1),record:false,preserveDraft:true})){history.pop();$('#undo').disabled=!history.length;}};
$('#reset').onclick=()=>confirm('Restore the starting process?','This restores the diagram and display groups. Your applications and company tags stay in the CRM.',()=>{const next=defaults();applySource(next.source,{replacement:next});});$('#cancel').onclick=()=>$('#confirm').close();
$('#export').onclick=()=>download('job-application-process.json',JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2),'application/json');$('#mmd').onclick=()=>download('job-application-process.mmd',renderSource($('#source').value));
$('#role-map').onclick=()=>{if(data.read_only){const rows=[['company','role','current_stage','application_age_days','stage_age_days'],...data.jobs.map(j=>[company(j).name,j.title,BUCKETS[j.view_stage]||j.status,ageDays(j,'application_age_days'),ageDays(j,'stage_age_days')])];download('shared-job-stages.csv',rows.map(row=>row.map(v=>'\"'+String(v??'').replaceAll('\"','\"\"')+'\"').join(',')).join('\r\n'),'text/csv');return;}const confirmed=explicitAppliedIds(),rows=[['job_id','company','role','interested','applied_or_recruiting','explicit_application_entry','current_stage','mapped_group','application_age_days','stage_age_days','next_step','review_date'],...data.jobs.map(j=>[j.id,company(j).name,j.title,'yes',progressed(j)?'yes':'no',confirmed.has(j.id)?'yes':'no',BUCKETS[j.view_stage]||j.status,labelFor(groupFor(j)),ageDays(j,'application_age_days'),ageDays(j,'stage_age_days'),j.next_step,j.next_step_date])];download('job-stage-map.csv',rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv');};$('#import').onclick=()=>$('#import-file').click();$('#import-file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>1000000)throw Error('File is too large.');const next=validateState(JSON.parse(await f.text()));confirm('Import this process?','Replace the diagram and display groups? This does not change job records.',()=>applySource(next.source,{replacement:next,preserveDraft:true}));}catch(e){notice('Import failed: '+e.message);}};
(async()=>{mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,maxTextSize:50000,maxEdges:300,theme:'base',fontFamily:'Arial, sans-serif',themeVariables:{primaryColor:'#f2f5ec',primaryTextColor:'#264532',primaryBorderColor:'#afc5b2',lineColor:'#92ac99',edgeLabelBackground:'#fff',fontSize:'15px'},flowchart:{htmlLabels:false,curve:'basis',nodeSpacing:22,rankSpacing:30,padding:12,useMaxWidth:false}});await refresh();if(!await applySource(state.source,{save:false,record:false,preserveDraft:true})){const next=defaults();await applySource(next.source,{replacement:next,save:false,record:false});notice('Saved process could not render; showing the starter without overwriting saved storage.');}})();

window.addEventListener('crm-data-changed',()=>{if(!busy)refresh();});
setInterval(()=>{if(document.visibilityState==='visible'&&!busy&&!document.querySelector('dialog[open]'))refresh();},30000);
window.addEventListener('focus',()=>{if(!busy)refresh();});
