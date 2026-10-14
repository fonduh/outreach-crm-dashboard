import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '/Users/fondahu/little-kiln/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1512,height:1080},timezoneId:'America/Los_Angeles'});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://127.0.0.1:8842/torus/');await p.getByRole('heading',{name:'Make the next meeting count.'}).waitFor();
 await fs.mkdir('artifacts/torus',{recursive:true});await p.screenshot({path:'artifacts/torus/overview-desktop.png',fullPage:true});
 assert.equal(await p.locator('tbody tr').count(),8);
 await p.locator('#search').fill('Arcwell');assert.equal(await p.locator('tbody tr').count(),1);await p.locator('[data-open="p3"]').first().click();
 await p.locator('[name="approval"]').selectOption('approved');await p.locator('[name="ask_status"]').selectOption('done');
 await p.locator('[name="meeting_at"]').fill('2026-10-20T11:00');await p.locator('[name="meeting_status"]').selectOption('scheduled');await p.locator('[name="agenda"]').fill('Review engineering-document consistency.');
 await p.locator('#prospect-form').getByRole('button',{name:'Save changes'}).click();await p.waitForFunction(()=>document.querySelector('[name=stage]')?.value==='meeting');
 await p.locator('#note-body').fill('<img src=x onerror=alert(1)> Please confirm the project owner.');await p.locator('#post-note').click();await p.getByText('<img src=x onerror=alert(1)> Please confirm the project owner.',{exact:true}).waitFor();assert.equal(await p.locator('.note img').count(),0);
 await p.locator('.note').getByRole('button',{name:'Edit'}).click();await p.locator('#note-body').fill('Please confirm the project owner before the meeting.');await p.locator('#post-note').click();await p.getByText('Please confirm the project owner before the meeting.',{exact:true}).waitFor();
 await p.screenshot({path:'artifacts/torus/prospect-desktop.png',fullPage:true});await p.locator('#close-drawer').click();await p.reload();await p.locator('[data-open="p3"]').first().click();assert.equal(await p.locator('.note').count(),1);assert.equal(await p.locator('[name="meeting_at"]').inputValue(),'2026-10-20T11:00');
 // Qualification gate: cannot hand off before a meeting is held.
 await p.locator('[name="stage"]').selectOption('handoff');await p.locator('#prospect-form').getByRole('button',{name:'Save changes'}).click();await p.locator('#prospect-error').getByText(/Handoff needs/).waitFor();
 await p.locator('[name="meeting_status"]').selectOption('held');await p.locator('#prospect-form').getByRole('button',{name:'Save changes'}).click();await p.waitForFunction(()=>!document.querySelector('#prospect-error .error'));
 await p.locator('#close-drawer').click();await p.locator('[data-view="meetings"]').first().click();assert.equal(await p.locator('.schedule-list article').count(),3);
 const dlPromise=p.waitForEvent('download');await p.locator('[data-ics="p3"]').click();const dl=await dlPromise;const path=await dl.path();assert.match(await fs.readFile(path,'utf8'),/DTSTART:20261020T180000Z/);
 await p.locator('[data-view="prospects"]').first().click();await p.locator('#add-prospect').click();await p.locator('#add-form [name=company]').fill('Test EPC');await p.locator('#add-form [name=contact]').fill('Test Contact');await p.locator('#add-form').getByRole('button',{name:'Add prospect'}).click();await p.locator('.drawer h2').getByText('Test EPC').waitFor();await p.locator('#close-drawer').click();assert.equal(await p.locator('tbody tr').count(),9);
 await p.locator('[data-view="icp"]').click();await p.locator('#edit-icp').click();await p.locator('#icp-form [name="goal"]').fill('8');await p.locator('#icp-form [name=segment]').fill('EPCs with active infrastructure projects');await p.getByRole('button',{name:'Save ICP'}).click();await p.getByRole('heading',{name:'ICP v2'}).waitFor();
 await p.locator('[data-view="overview"]').click();assert.equal(await p.locator('tbody .pill').filter({hasText:'Recheck'}).count(),9);await p.setViewportSize({width:390,height:844});await p.screenshot({path:'artifacts/torus/overview-mobile.png',fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await p.locator('[data-open="p1"]').first().click();await p.screenshot({path:'artifacts/torus/prospect-mobile.png',fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 assert.deepEqual(errors,[]);console.log('PASS: filters, edit/save/reload, meeting times, qualification gate, notes/edit/XSS, add prospect, editable ICP, calendar export, desktop/mobile layout.');
}finally{await browser.close();}
