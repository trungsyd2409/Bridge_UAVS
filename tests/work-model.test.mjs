import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/work-model.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('calendar crosses year and handles leap years without relying on host timezone',()=>{
 assert.equal(m.addDays('2026-12-31',1),'2027-01-01');assert.equal(m.addDays('2028-02-28',1),'2028-02-29');assert.equal(m.addDays('2027-02-28',1),'2027-03-01');
 assert.equal(m.weekStart('2027-01-01'),'2026-12-28');assert.equal(m.moveMonth('2026-12-31',1),'2027-01-01');
 const days=m.monthDays('2028-02-15');assert(days.includes('2028-02-29'));assert.equal(days.length%7,0);assert.equal(new Date(days[0]+'T00:00Z').getUTCDay(),1);
 assert.equal(m.todayIn('Australia/Sydney',new Date('2026-12-31T15:00:00Z')),'2027-01-01');
});
test('Sydney DST gap is rejected and repeated time has two explicit choices',()=>{
 assert.deepEqual(m.timeCandidates('2026-10-04','02:30','Australia/Sydney'),[]);
 const times=m.timeCandidates('2026-04-05','02:30','Australia/Sydney');assert.equal(times.length,2);assert.equal(times[1]-times[0],3600000);
});
test('elapsed hours account for both DST directions and overnight unpaid breaks',()=>{
 const duration=(day,start,end,breaks=0)=>m.shiftHours({startAt:m.timeCandidates(day,start,'Australia/Sydney')[0],endAt:m.timeCandidates(day,end,'Australia/Sydney')[0],breaks});
 assert.equal(duration('2026-10-04','01:00','04:00'),2);assert.equal(duration('2026-04-05','01:00','04:00'),4);
 const s={id:'a',startAt:m.timeCandidates('2026-09-12','22:00','Australia/Sydney')[0],endAt:m.timeCandidates('2026-09-13','06:00','Australia/Sydney')[0],breaks:30};assert.equal(m.shiftHours(s),7.5);assert(m.shiftOnDay(s,'2026-09-13','Australia/Sydney'));
});
test('Lord Howe half-hour DST and Perth fixed offset are supported',()=>{
 const a=m.timeCandidates('2026-04-05','01:45','Australia/Lord_Howe');assert.equal(a.length,2);assert.equal(a[1]-a[0],1800000);
 assert.equal(m.timeCandidates('2026-10-04','02:30','Australia/Perth').length,1);
});
test('overlap checks ignore self and allow adjacent shifts across jobs',()=>{
 assert(!m.overlaps({id:'a',startAt:0,endAt:10},{id:'a',startAt:1,endAt:11}));assert(!m.overlaps({id:'a',startAt:0,endAt:10},{id:'b',startAt:10,endAt:20}));assert(m.overlaps({id:'a',startAt:0,endAt:10},{id:'b',startAt:9,endAt:20}));
});
test('legacy journal migration keeps original payment information and marks uncertainty',()=>{
 const data=m.migrateVault([{id:'old',date:'2026-09-12',start:'22:00',end:'06:00',breaks:30,pay:0,note:'original',created:'2026-09-13T01:00Z'}]);
 assert.equal(data.version,2);assert.equal(data.jobs.length,1);assert.equal(data.shifts[0].endDate,'2026-09-13');assert.equal(data.shifts[0].payment,'unknown');assert.equal(data.shifts[0].received,'');assert.match(data.shifts[0].note,/original/);assert.equal(m.shiftHours(data.shifts[0]),7.5);
});
test('encrypted multi-job vault round trips; wrong password and tampering fail',async()=>{
 const data=m.emptyVault();data.jobs=[{id:'one',name:'Job 1',locations:[]},{id:'two',name:'Job 2',locations:[]}];
 const salt=m.newSalt(),key=await m.deriveKey('a-test-password',salt),raw=await m.encryptVault(data,key,salt);assert(!raw.includes('Job 1'));assert.deepEqual(await m.decryptVault(raw,key),data);
 const wrong=await m.deriveKey('wrong-password',salt);await assert.rejects(m.decryptVault(raw,wrong));const tampered=JSON.parse(raw);tampered.data=(tampered.data[0]==='A'?'B':'A')+tampered.data.slice(1);await assert.rejects(m.decryptVault(JSON.stringify(tampered),key));
 assert.notEqual(JSON.parse(await m.encryptVault(data,key,salt)).iv,JSON.parse(raw).iv);
});
