export type Lang = 'vi'|'en';
export type Workplace = {id:string;name:string;address:string;zone:string};
export type Job = {abn?:string;id:string;name:string;role:string;industry:string;employment:string;color:string;status:'active'|'prospective'|'archived';locations:Workplace[];rate:string};
export type Shift = {id:string;jobId:string;locationId:string;locationName:string;address:string;zone:string;date:string;endDate:string;start:string;end:string;startAt:number;endAt:number;breaks:number;kind:'planned'|'actual';rate:string;payment:'unknown'|'unpaid'|'partial'|'paid';received:string;paidDate:string;method:string;payslip:string;note:string;created:string;updated:string};
export type Vault = {version:2;jobs:Job[];shifts:Shift[]};
export const emptyVault = ():Vault=>({version:2,jobs:[],shifts:[]});
export const zones=['Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Adelaide','Australia/Perth','Australia/Darwin','Australia/Hobart','Australia/Lord_Howe'];
export function todayIn(zone:string,now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function addDays(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function weekStart(date:string){const day=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,-((day+6)%7))}
export function monthDays(date:string){const first=date.slice(0,7)+'-01',start=weekStart(first);const n=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).getUTCDate();const offset=Math.round((Date.parse(first)-Date.parse(start))/86400000);return Array.from({length:Math.ceil((offset+n)/7)*7},(_,i)=>addDays(start,i))}
export function moveMonth(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,10)}
export function dateLabel(date:string,lang:Lang,options:Intl.DateTimeFormatOptions={day:'numeric',month:'long',year:'numeric'}){return new Intl.DateTimeFormat(lang==='vi'?'vi-VN':'en-AU',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}
function localParts(ms:number,zone:string){const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ms);const v=(k:string)=>p.find(x=>x.type===k)!.value;return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`}
// Enumerate actual UTC offsets around a wall-clock time, including half-hour DST.
// No match means a skipped clock time; two matches mean a repeated clock time.
export function timeCandidates(date:string,time:string,zone:string):number[]{
 const target=date+'T'+time,base=Date.parse(target+':00Z');if(!Number.isFinite(base))return [];
 const offsets=new Set<number>();for(const h of [-36,-12,0,12,36]){const ms=base+h*3600000;offsets.add(Date.parse(localParts(ms,zone)+':00Z')-ms)}
 return [...offsets].map(offset=>base-offset).filter(ms=>localParts(ms,zone)===target).sort((a,b)=>a-b);
}
export function shiftHours(s:Pick<Shift,'startAt'|'endAt'|'breaks'>){return Math.max(0,(s.endAt-s.startAt)/3600000-s.breaks/60)}
export function overlaps(a:Pick<Shift,'startAt'|'endAt'|'id'>,b:Pick<Shift,'startAt'|'endAt'|'id'>){return a.id!==b.id&&a.startAt<b.endAt&&a.endAt>b.startAt}
export function shiftOnDay(s:Shift,day:string,zone:string){return todayIn(zone,new Date(s.startAt))<=day&&todayIn(zone,new Date(s.endAt-1))>=day}
const b64=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)};
const un64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function deriveKey(password:string,salt:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:un64(salt),iterations:250000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
export function newSalt(){return b64(crypto.getRandomValues(new Uint8Array(16)))}
export async function encryptVault(v:Vault,key:CryptoKey,salt:string){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(v)));return JSON.stringify({salt,iv:b64(iv),data:b64(new Uint8Array(cipher))})}
export async function decryptVault(raw:string,key:CryptoKey):Promise<Vault>{const envelope=JSON.parse(raw),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(envelope.iv)},key,un64(envelope.data));return migrateVault(JSON.parse(new TextDecoder().decode(plain)))}
export function migrateVault(data:unknown):Vault{
 if(Array.isArray(data)){
  const job:Job={id:'legacy',name:'Công việc đã ghi / Previous job',role:'',industry:'',employment:'',color:'#3478f6',status:'active',rate:'',locations:[{id:'legacy-location',name:'Nơi làm trước / Previous workplace',address:'',zone:'Australia/Sydney'}]};
  return {version:2,jobs:data.length?[job]:[],shifts:data.map(e=>{const endDate=e.end<e.start?addDays(e.date,1):e.date;const startAt=timeCandidates(e.date,e.start,'Australia/Sydney')[0],endAt=timeCandidates(endDate,e.end,'Australia/Sydney')[0];if(!Number.isFinite(startAt)||!Number.isFinite(endAt))throw Error('legacy-date');return {...e,jobId:job.id,locationId:'legacy-location',locationName:job.locations[0].name,address:'',zone:'Australia/Sydney',endDate,startAt,endAt,kind:'actual',rate:'',payment:Number(e.pay)>0?'partial':'unknown',received:Number(e.pay)>0?String(e.pay):'',paidDate:'',method:'unknown',payslip:'unknown',updated:e.created,note:[e.note,'[Bản cũ / Legacy: AUD '+e.pay+'; múi giờ giả định / assumed timezone Australia/Sydney]'].filter(Boolean).join('\n')};})};
 }
 if(data&&typeof data==='object'&&(data as Vault).version===2&&Array.isArray((data as Vault).jobs)&&Array.isArray((data as Vault).shifts))return data as Vault;
 throw Error('unsupported-vault');
}
