import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import{chromium}from'/Users/fondahu/little-kiln/node_modules/playwright/index.mjs';
execFileSync('python3',['tests/torus-fixture.py','create']);const fixtures=JSON.parse(await fs.readFile('artifacts/torus/test-links.private.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const url=n=>{const l=fixtures.links[n];return 'http://127.0.0.1:8842/torus/?viewer='+l.slug+'#access='+l.token;};
try{
 const ac=await browser.newContext(),bc=await browser.newContext();const a=await ac.newPage(),b=await bc.newPage();
 await a.goto(url('Fonda'));await b.goto(url('Marcus'));await a.locator('[data-open=p1]').first().click();await b.locator('[data-open=p1]').first().click();
 await b.locator('#note-body').fill('Please confirm the decision-maker before discovery.');await b.locator('#post-note').click();await b.locator('.note').waitFor();
 await a.locator('#close-drawer').click();await a.locator('#refresh').click();await a.locator('[data-open=p1]').first().click();await a.locator('.note').waitFor();assert.match(await a.locator('.note').innerText(),/Marcus/);assert.equal(await a.locator('.note button').count(),0);
 await a.locator('#note-body').fill('Agreed. I will validate that in the first reply.');await a.locator('#post-note').click();await a.waitForFunction(()=>document.querySelectorAll('.note').length===2);
 await b.reload();await b.locator('[data-open=p1]').first().click();await b.waitForFunction(()=>document.querySelectorAll('.note').length===2);assert.equal(await b.locator('.note button').count(),1);
 await a.locator('[name=next]').fill('Confirm budget ownership with Elena');await a.locator('#prospect-form').getByRole('button',{name:'Save changes'}).click();await a.waitForFunction(()=>document.querySelector('#activity')?.innerText.includes('next action'));
 await b.locator('[name=next]').fill('Stale edit must not overwrite');await b.locator('#prospect-form').getByRole('button',{name:'Save changes'}).click();await b.locator('#prospect-error').getByText(/workspace changed/).waitFor();assert.equal(await b.locator('[name=next]').inputValue(),'Stale edit must not overwrite');
 b.on('dialog',d=>d.accept());await b.reload();await b.locator('[data-open=p1]').first().click();assert.equal(await b.locator('[name=next]').inputValue(),'Confirm budget ownership with Elena');
 const publicPage=await ac.newPage();await publicPage.goto('http://127.0.0.1:8842/torus/');await publicPage.locator('[data-open=p1]').first().click();assert.equal(await publicPage.locator('.note').count(),0);
 const invalid=await ac.newPage();await invalid.goto('http://127.0.0.1:8842/torus/?viewer='+fixtures.links.Marcus.slug+'#access='+fixtures.links.Fonda.token);await invalid.getByRole('heading',{name:'Workspace unavailable'}).waitFor();assert.equal(await invalid.locator('tbody tr').count(),0);
 console.log('PASS: live two-person notes, author-only edits, cross-browser persistence, optimistic concurrency with draft retention, public isolation, and invalid-link denial.');
}finally{await browser.close();execFileSync('python3',['tests/torus-fixture.py','delete']);}
