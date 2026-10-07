import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../site/process-config.js',import.meta.url),'utf8');
const key='job-application-process-v1';
function boot(saved,{audience=false,storage=new Map()}={}){
 if(saved)storage.set(key,JSON.stringify(saved));
 const context=vm.createContext({window:{CRM_AUDIENCE:audience},structuredClone,setTimeout:()=>{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(config,context);
 vm.runInContext(app.slice(0,app.indexOf('\nfunction el(')),context);
 const read=expression=>JSON.parse(vm.runInContext(`JSON.stringify(${expression})`,context));
 return {read,storage};
}
const initial=boot();
const published=initial.read('window.CRM_PUBLISHED_PROCESS');
const prior=initial.read('PREVIOUS_PUBLISHED_SOURCE');
function previous(overrides={}){const {processRevision,...base}=published;return {...base,source:prior,draft:prior,...overrides};}
function sequence(source){
 for(const edge of ['SCREEN --> TASK','TASK --> INTERVIEW','INTERVIEW --> OFFER'])assert.ok(source.includes(edge),edge);
 assert.ok(!source.includes('SCREEN --> INTERVIEW'));
}
test('published and reset diagrams use the requested sequence',()=>{
 sequence(published.source);sequence(initial.read('defaults().source'));
 assert.deepEqual(published.bindings.TASK,['take_home']);
});
test('old saved diagram migrates, backs up and survives reload',()=>{
 const old=previous();const {read,storage}=boot(old);
 sequence(read('state.source'));assert.deepEqual(read('state.bindings'),old.bindings);
 assert.deepEqual(JSON.parse(storage.get(key+'-pre-interview-sequence')),old);
 assert.deepEqual(boot(null,{storage}).read('state'),read('state'));
});
test('custom draft and bindings survive a shipped-source migration',()=>{
 const old=previous({draft:'flowchart LR\n X --> Y',bindings:{...published.bindings,INTERVIEW:['interview'],ONSITE:['onsite']}});
 const {read}=boot(old);sequence(read('state.source'));
 assert.equal(read('state.draft'),old.draft);assert.deepEqual(read('state.bindings'),old.bindings);
});
test('custom applied diagram is preserved byte for byte',()=>{
 const old=previous({source:'flowchart LR\n FIRST --> SECOND',draft:'flowchart LR\n FIRST --> THIRD'});
 const {read,storage}=boot(old);assert.equal(read('state.source'),old.source);assert.equal(read('state.draft'),old.draft);
 assert.equal(storage.get(key),JSON.stringify(old));
});
test('previous aggregate default gets sequential interview stages',()=>{
 const source=initial.read('PREVIOUS_DEFAULT_SOURCE');const {read}=boot(previous({source,draft:source}));
 sequence(read('state.source'));assert.ok(read('state.source').includes('INTERESTED --> APPLIED_TOTAL'));
});
test('audience ignores visitor-local process overrides',()=>{
 const {read}=boot(previous(),{audience:true});assert.deepEqual(read('state'),published);
});
test('revision prevents reapplying a migration after deliberate edits',()=>{
 const old=previous({processRevision:1});assert.deepEqual(boot(old).read('state'),old);
});
