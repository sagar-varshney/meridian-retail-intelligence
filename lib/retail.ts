export type RetailReport = {
  version: number; meta: { id: string; name: string; source: string; sourceUrl?: string; license: string; currency: string;
    rawRows: number; acceptedRows: number; creditRows: number; duplicateRows: number; from: string; to: string;
    asOf: string; sha256: string; historical: boolean; country?: string; citation?: string; transformations: string; lastCompleteMonth: string };
  months: string[]; countries: string[];
  orders: [string,string,string,number,number,string][];
  products: {product:string;name:string;revenue:number;units:number;orders:number}[];
  productFacts: [string,string,string,number,number,number][];
  credits: [string,string,number,number][];
  customers: {id:string;country:string;first:string;last:string;recency:number;frequency:number;monetary:number;cluster:number}[];
  segments: {id:number;name:string;customers:number;recency:number;frequency:number;monetary:number;revenue:number}[];
  clusterQuality: {silhouette?:number;seedStabilityARI?:number;method:string};
  cohorts: {month:string;customers:number;retention:(number|null)[]}[];
  rules: {id:string;antecedent:string[];consequent:string;antecedentNames:string[];consequentName:string;count:number;support:number;confidence:number;lift:number;validationCount:number;validationConfidence:number|null;validationLift:number|null}[];
  mining: {algorithm:string;maxLength:number;topProducts:number;minSupport:number;minConfidence:number;discoveryBefore:string;discoveryOrders:number;validationOrders:number;totalRules:number;displayedRules:number;scope:string};
  forecast: {champion:string;scores:{id:string;selection:{mae:number;wape:number;weeks:number}|null;test:{mae:number;wape:number;weeks:number}|null}[];
    selectionWeeks:number;testWeeks:number;testStart?:string;history:{week:string;actual:number|null}[];
    predictions:Record<string,number|string|null>[];next:{week:string;value:number|null};note:string};
  quality: {name:string;count:number;handling:string}[];
};
export type Action = {id:string;workspaceId:string;datasetId:string;title:string;description:string;evidence:string;owner:string;priority:string;status:string;dueDate:string;outcome:string;createdAt:string;updatedAt:string};
export const modelNames:Record<string,string>={previous_week:'Previous week',rolling_mean:'4-week average',seasonal:'Seasonal naïve',random_forest:'Random forest'};
export function money(n:number,currency='GBP',compact=false){return new Intl.NumberFormat('en-GB',{style:'currency',currency,notation:compact?'compact':'standard',maximumFractionDigits:compact?1:0}).format(n)}
export function num(n:number){return new Intl.NumberFormat('en-GB').format(Math.round(n))}
export function pct(n:number|null|undefined){return n==null?'—':`${(n*100).toFixed(1)}%`}
export function monthLabel(s:string){return new Date(s+'-01T12:00:00Z').toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})}
export function downloadCSV(name:string,headers:string[],rows:(string|number|null|undefined)[][]){
  const escape=(v:unknown)=>{let s=String(v??'');if(/^[=+@\t\r]/.test(s)||(/^-/).test(s)&&!Number.isFinite(Number(s)))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
  const blob=new Blob(['\uFEFF'+[headers,...rows].map(r=>r.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
export function overview(report:RetailReport,from:string,to:string,country:string){
  const orders=report.orders.filter(o=>o[0].slice(0,7)>=from&&o[0].slice(0,7)<=to&&(country==='All countries'||o[1]===country));
  const revenue=orders.reduce((a,o)=>a+o[3],0),units=orders.reduce((a,o)=>a+o[4],0),customers=new Set(orders.map(o=>o[2]).filter(Boolean)).size;
  const credits=report.credits.filter(o=>o[0]>=from&&o[0]<=to&&(country==='All countries'||o[1]===country)).reduce((a,o)=>a+o[2],0);
  const timeline=new Map<string,{month:string;sales:number;credits:number;orders:number}>();
  for(const m of report.months.filter(m=>m>=from&&m<=to))timeline.set(m,{month:m,sales:0,credits:0,orders:0});
  for(const o of orders){const v=timeline.get(o[0].slice(0,7));if(v){v.sales+=o[3];v.orders++}}
  for(const c of report.credits.filter(c=>c[0]>=from&&c[0]<=to&&(country==='All countries'||c[1]===country))){const v=timeline.get(c[0]);if(v)v.credits+=c[2]}
  const products=new Map<string,{code:string;revenue:number;units:number;orders:number}>();
  for(const p of report.productFacts){if(p[0]<from||p[0]>to||(country!=='All countries'&&p[1]!==country))continue;let v=products.get(p[2]);if(!v){v={code:p[2],revenue:0,units:0,orders:0};products.set(p[2],v)}v.revenue+=p[3];v.units+=p[4];v.orders+=p[5]}
  const countries=new Map<string,number>();for(const o of orders)countries.set(o[1],(countries.get(o[1])??0)+o[3]);
  return {orders,revenue,units,customers,credits,average:orders.length?revenue/orders.length:0,timeline:[...timeline.values()],products:[...products.values()].sort((a,b)=>b.revenue-a.revenue),countries:[...countries].sort((a,b)=>b[1]-a[1])};
}
