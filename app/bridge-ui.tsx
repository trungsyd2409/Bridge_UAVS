'use client';
import {createContext,useContext,ReactNode} from 'react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {ArrowUpRight,BookOpen} from 'lucide-react';
import {Lang} from '@/lib/work-model';
export const Language=createContext<Lang>('vi');
export function useText(){const lang=useContext(Language);return (vi:string,en:string)=>lang==='vi'?vi:en}
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
export function Pick({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:(string|[string,string])[]}){return <div className="field"><span>{label}</span><Select value={value||'__empty'} onValueChange={v=>onChange(v==='__empty'?'':v)}><SelectTrigger className="picker" aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return <SelectItem value={v||'__empty'} key={v}>{l}</SelectItem>})}</SelectContent></Select></div>}
export function Brand(){return <span className="brand"><svg viewBox="0 0 100 48" aria-hidden="true"><path d="M5 40Q50-22 95 40M8 40Q50 26 92 40M28 18V34M50 8V31M72 18V34" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/></svg>BRIDGE</span>}
export function Orb({busy=false}:{busy?:boolean}){return <span aria-hidden="true" className={'orb '+(busy?'busy':'')}><span/><i/><b/></span>}
export function Source({url,label='Fair Work Ombudsman'}:{url:string;label?:string}){const t=useText();return <a className="source" href={url} target="_blank" rel="noreferrer"><BookOpen size={18}/><span>{label}<small>{t('Mở nguồn chính thức','Open official source')}</small></span><ArrowUpRight size={18}/></a>}
