const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../site/',import.meta.url);
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||'chrome'});
try{
 for(const shared of [false,true]){
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const job={id:'J001',company_id:'CO001',title:'Analyst',status:'rejected',view_stage:'rejected',auto_archived:true,win_loss_outcome:'Lost',win_loss_notes:'Automatically archived after 61 calendar days. <script>bad()</script>',win_loss_date:'2026-10-29',stage_age_days:0,application_age_days:61,age_as_of:'2026-10-29'};
  const data={ok:true,storage:shared?'shared':'browser',read_only:shared,detail_level:'company_roles',read_at:new Date().toISOString(),jobs:[job],companies:[{id:'CO001',name:'Example'}],job_activity:[],job_contacts:[],contacts:[]};
  await page.route('https://crm-test.invalid/**',async route=>{
   const path=new URL(route.request().url()).pathname.slice(1)||'index.html';
   if(['connection.js','shared-connection.js'].includes(path))return route.fulfill({contentType:'text/javascript',body:`window.CRMData={load:async()=>({ok:true,json:async()=>(${JSON.stringify(data)})})};`});
   if(['config.js','supabase.js','comments.js'].includes(path))return route.fulfill({contentType:'text/javascript',body:''});
   try{return route.fulfill({body:await fs.readFile(new URL(path,root)),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:''});}
  });
  await page.goto('https://crm-test.invalid/');await page.locator('[data-job=J001]').waitFor();
  if(shared){assert.equal(await page.locator('[data-section=win-loss]').count(),0);assert.equal(await page.locator('#focus option[value=auto_archived]').evaluate(e=>e.hidden),true);}
  else{await page.locator('#focus').selectOption('auto_archived');assert.equal(await page.locator('.role').count(),1);assert.match(await page.locator('[data-section=win-loss]').innerText(),/61 calendar days/);assert.equal(await page.locator('[data-section=win-loss] script').count(),0);}
  assert.deepEqual(errors,[]);await page.close();console.log(shared?'Shared notes privacy passed':'Private archive filter and escaped notes passed');
 }
}finally{await browser.close();}
