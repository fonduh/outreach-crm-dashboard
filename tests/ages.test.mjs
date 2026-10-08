import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const scope=vm.createContext({});
vm.runInContext(app.slice(app.indexOf('function ageDays('),app.indexOf('function applicationStage(')),scope);
const days=(job,date)=>scope.ageDays(job,'application_age_days',date);
test('ages advance while an unchanged cloud snapshot is offline',()=>{
 assert.equal(days({application_age_days:2,age_as_of:'2026-10-06'},'2026-10-08'),4);
});
test('zero days is valid and missing evidence remains unknown',()=>{
 assert.equal(days({application_age_days:0,age_as_of:'2026-10-08'},'2026-10-08'),0);
 for(const value of [null,undefined,-1,'2'])assert.equal(days({application_age_days:value},'2026-10-08'),null);
 assert.equal(scope.ageText({status:'not_started'},'application_age_days'),'Not applied');
 assert.equal(scope.ageText({status:'interview'},'stage_age_days'),'Date unknown');
});
test('calendar-day arithmetic is unaffected by daylight saving changes',()=>{
 assert.equal(days({application_age_days:0,age_as_of:'2026-03-07'},'2026-03-09'),2);
 assert.equal(days({application_age_days:0,age_as_of:'2026-10-31'},'2026-11-02'),2);
});
test('fresh counts are not counted twice and clock skew never subtracts days',()=>{
 assert.equal(days({application_age_days:4,age_as_of:'2026-10-08'},'2026-10-08'),4);
 assert.equal(days({application_age_days:4,age_as_of:'2026-10-09'},'2026-10-08'),4);
});
