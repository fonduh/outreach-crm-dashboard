// Run with PLAYWRIGHT_MODULE pointing to an installed playwright index.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1050}});const page=await ctx.newPage();
const failures=[];page.on('pageerror',e=>failures.push(e.message));
const token='a'.repeat(64),name='Niral',comments=[],reviewers=[{slug:'niral',display_name:name,enabled:true}];
const payload={ok:true,read_only:true,storage:'shared',detail_level:'company_roles',read_at:new Date().toISOString(),jobs:[{id:'J001',company_id:'CO001',title:'Revenue Operations',status:'applied',view_stage:'applied'},{id:'J002',company_id:'CO002',title:'Strategy and Operations',status:'not_started',view_stage:'not_started'}],companies:[{id:'CO001',name:'Fixture One'},{id:'CO002',name:'Fixture Two'}],contacts:[],job_activity:[],job_contacts:[]};
let owner=false;
await page.route('**/rest/v1/rpc/*',async route=>{
 const rpc=new URL(route.request().url()).pathname.split('/').at(-1),args=route.request().postDataJSON()||{};let value;
 if(rpc!=='get_shared_crm'&&!owner&&(!reviewers.some(r=>r.slug===args.p_slug&&r.enabled)||args.p_token!==token))return route.fulfill({status:400,json:{message:'This private viewing link is unavailable.'}});
 if(rpc==='get_shared_crm')value=payload;
 else if(rpc==='get_reviewer_context')value={slug:args.p_slug,display_name:name,actor:'viewer'};
 else if(rpc==='get_role_comments')value={display_name:name,actor:owner?'owner':'viewer',comments:comments.filter(c=>c.slug===args.p_slug&&c.job===args.p_job_id)};
 else if(rpc==='save_role_comment'){
  const found=comments.find(c=>c.id===args.p_id);if(found){found.body=args.p_body;found.version++;}else comments.push({id:args.p_id,slug:args.p_slug,job:args.p_job_id,body:args.p_body,author_role:owner?'owner':'viewer',version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});value={id:args.p_id};
 }else if(rpc==='list_crm_reviewers')value=reviewers;
 else if(rpc==='manage_crm_reviewer'){value={slug:args.p_slug,display_name:args.p_name,token,enabled:args.p_action!=='revoke'};if(args.p_action==='create')reviewers.push(value);else reviewers.find(r=>r.slug===args.p_slug).enabled=value.enabled;}
 else throw Error('Unexpected RPC '+rpc);
 return route.fulfill({json:value});
});
try{
 await page.goto('http://127.0.0.1:8799/share/?viewer=niral#access='+token);
 await page.waitForSelector('#role-comment-body');assert.equal(new URL(page.url()).pathname,'/share/niral');
 await page.locator('[data-job="J001"]').click();
 const body='<img src=x onerror="window.xss=true"> Helpful introduction';
 await page.locator('#role-comment-body').fill(body);await page.locator('#post-role-comment').click();
 await page.waitForFunction(()=>document.querySelector('.comment')?.innerText.includes('Helpful introduction'));
 assert.equal(await page.locator('.comment img').count(),0);assert.equal(await page.evaluate(()=>window.xss),undefined);
 await page.locator('.comment button').click();await page.locator('#role-comment-body').fill('Updated introduction');await page.locator('#post-role-comment').click();
 await page.waitForFunction(()=>document.querySelector('.comment')?.innerText.includes('Updated introduction'));
 assert.equal(comments.length,1);assert.equal(comments[0].version,2);
 await page.locator('#role-comment-body').fill('Unsent draft');await page.locator('[data-job="J002"]').click();assert.equal(await page.locator('#role-comment-body').inputValue(),'');await page.locator('[data-job="J001"]').click();assert.equal(await page.locator('#role-comment-body').inputValue(),'Unsent draft');
 await page.locator('#refresh').click();await page.waitForTimeout(400);assert.equal(await page.locator('#role-comment-body').inputValue(),'Unsent draft');
 await page.locator('#role-comment-body').fill('');await page.goto('http://127.0.0.1:8799/share/?viewer=niral#access='+token);await page.waitForSelector('.comment');assert.match(await page.locator('.comment').innerText(),/Updated introduction/);
 await fs.mkdir('artifacts/comments',{recursive:true});await page.screenshot({path:'artifacts/comments/viewer-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/comments/viewer-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.goto('http://127.0.0.1:8799/share/?viewer=other#access='+token);await page.waitForFunction(()=>document.querySelector('#live-status')?.innerText.includes('unavailable'));assert.equal(await page.locator('#role-comments').isVisible(),false);
 await page.goto('http://127.0.0.1:8799/share/');await page.waitForSelector('[data-job]');assert.equal(await page.locator('#role-comments').isVisible(),false);
 // Real owner UI with a mocked transport. Database ownership is exercised separately.
 owner=true;await page.setViewportSize({width:1440,height:1050});
 await page.route('**/connection.js*',route=>route.fulfill({contentType:'application/javascript',body:`window.CRMData={load:async()=>new Response(JSON.stringify(${JSON.stringify({...payload,storage:'private',read_only:false})}))};window.CRMCommentsTransport={rpc:async(name,args={})=>{const r=await fetch(window.CRM_PUBLIC_CONFIG.url+'/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args)});return r.json();}};`}));
 await page.goto('http://127.0.0.1:8799/');await page.waitForSelector('#comment-reviewer');assert.match(await page.locator('.comment').innerText(),/Updated introduction/);assert.equal(await page.locator('.comment button').count(),0);
 await page.locator('#role-comment-body').fill('Thanks, Niral.');await page.locator('#post-role-comment').click();await page.waitForFunction(()=>document.querySelectorAll('.comment').length===2);
 await page.locator('#viewing-links').click();await page.locator('#reviewer-name').fill('New Viewer');await page.locator('#viewing-links-dialog button', {hasText:'Create viewing link'}).click();await page.waitForSelector('[aria-label="Private viewing link"]');assert.match(await page.locator('[aria-label="Private viewing link"]').inputValue(),/\/share\/new-viewer#access=/);await page.locator('#viewing-links-dialog button',{hasText:'Done'}).click();
 await page.screenshot({path:'artifacts/comments/owner-desktop.png',fullPage:true});
 assert.deepEqual(failures,[]);console.log('PASS: viewer post/edit/reload, plain-text XSS safety, per-role drafts, draft retention during refresh, mobile layout, cross-link denial, public-page privacy, owner replies, and link creation.');
}finally{await browser.close();}
