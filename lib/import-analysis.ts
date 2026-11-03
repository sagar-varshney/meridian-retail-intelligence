import type {RetailReport} from './retail';

export function parseCSV(text:string):string[][]{
  const out:string[][]=[];let row:string[]=[],field='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else if(!quoted&&field.length)throw new Error('A quote appears inside an unquoted field.');else quoted=!quoted}
    else if(c===','&&!quoted){row.push(field);field=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))out.push(row);row=[];field=''}
    else field+=c;
  }
  if(quoted)throw new Error('CSV contains an unclosed quoted field.');
  row.push(field);if(row.some(x=>x.trim()))out.push(row);
  return out;
}
const aliases:Record<string,string[]>={invoice:['invoice','invoiceno','invoiceid'],product:['stockcode','product','productid','sku'],description:['description','productname','name'],quantity:['quantity','qty'],date:['invoicedate','date','orderdate'],price:['unitprice','price'],customer:['customerid','customer'],country:['country']};
export function detectMapping(headers:string[]){const mapping:Record<string,string>={};for(const [key,names]of Object.entries(aliases)){const match=headers.find(h=>names.includes(h.toLowerCase().replace(/[^a-z]/g,'')));if(match)mapping[key]=match}return mapping}
const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:0};
const day=(s:string)=>Math.floor(Date.parse(s+'T00:00:00Z')/86400000);
const addDay=(s:string,n:number)=>new Date((day(s)+n)*86400000).toISOString().slice(0,10);

export async function analyseCSV(text:string,mapping:Record<string,string>,name:string,currency:string,id:string):Promise<RetailReport>{
  const csv=parseCSV(text),headers=csv.shift();if(!headers)throw new Error('The file is empty.');
  if(headers.some(h=>!h.trim())||new Set(headers).size!==headers.length)throw new Error('CSV headers must be non-empty and unique.');
  if(csv.length>20000)throw new Error('Interactive imports support 20,000 rows. Use the Python pipeline for larger datasets.');
  if(csv.length<2)throw new Error('At least two transaction rows are required.');
  const idx=Object.fromEntries(Object.entries(mapping).map(([k,v])=>[k,headers.indexOf(v)]));
  for(const k of ['invoice','product','description','quantity','date','price'])if(idx[k]==null||idx[k]<0)throw new Error(`Map the ${k} column before importing.`);
  const read=(row:string[],k:string)=>idx[k]>=0?(row[idx[k]]??'').trim():'';
  const seen=new Set<string>(),orders=new Map<string,any>(),products=new Map<string,any>(),facts=new Map<string,any>(),creditFacts=new Map<string,any>(),customerMap=new Map<string,any>();
  const baskets=new Map<string,Set<string>>(),invoiceIdentity=new Map<string,string>(),qualityCounts={duplicates:0,invalid:0,excluded:0,missing:0,credits:0};let accepted=0,first='9999',last='';
  for(const row of csv){
    if(row.length!==headers.length){qualityCounts.invalid++;continue}
    const signature=JSON.stringify(row);if(seen.has(signature)){qualityCounts.duplicates++;continue}seen.add(signature);
    const invoice=read(row,'invoice'),product=read(row,'product').toUpperCase(),description=read(row,'description'),dateRaw=read(row,'date');
    // Explicit ISO parsing avoids US/UK day/month ambiguity and silent calendar rollover.
    const dateMatch=/^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/.exec(dateRaw);
    const date=dateMatch?.[1]??'';const quantityRaw=read(row,'quantity'),priceRaw=read(row,'price');
    const quantity=Number(quantityRaw),price=Number(priceRaw),country=read(row,'country')||'Unknown',customer=read(row,'customer');
    const timePart=dateRaw.slice(11).replace(/Z$/,'').split(':');
    const badTime=dateRaw.length>10&&(Number(timePart[0])>23||Number(timePart[1])>59||Number(timePart[2]??0)>=60);
    if(!invoice||!product||!date||!quantityRaw||!priceRaw||badTime||!Number.isFinite(day(date))||new Date(day(date)*86400000).toISOString().slice(0,10)!==date||!Number.isFinite(quantity)||!Number.isFinite(price)||!Number.isSafeInteger(quantity)||!Number.isFinite(quantity*price)||Math.abs(quantity*price)>Number.MAX_SAFE_INTEGER/2000000){qualityCounts.invalid++;continue}
    if(!customer)qualityCounts.missing++;
    const month=date.slice(0,7),value=Math.abs(quantity*price);
    if(price<=0||quantity===0){qualityCounts.excluded++;continue}
    if(quantity<0){qualityCounts.credits++;const key=JSON.stringify([month,country]);const c=creditFacts.get(key)??[month,country,0,0];c[2]+=value;c[3]++;creditFacts.set(key,c);continue}
    if(invoice.toUpperCase().startsWith('C')){qualityCounts.invalid++;continue}
    const identity=JSON.stringify([date,country,customer]);
    if(invoiceIdentity.has(invoice)&&invoiceIdentity.get(invoice)!==identity)throw new Error(`CSV invoice ${invoice.slice(0,60)} has conflicting dates, customer IDs or countries. Use unique invoice IDs.`);
    invoiceIdentity.set(invoice,identity);
    accepted++;first=date<first?date:first;last=date>last?date:last;
    const key=JSON.stringify([invoice,country,customer]);const o=orders.get(key)??[date,country,customer,0,0,invoice];o[0]=date<o[0]?date:o[0];o[3]+=value;o[4]+=quantity;orders.set(key,o);
    const b=baskets.get(key)??new Set<string>();b.add(product);baskets.set(key,b);
    const p=products.get(product)??{product,name:description||product,revenue:0,units:0,invoices:new Set<string>()};p.revenue+=value;p.units+=quantity;p.invoices.add(key);products.set(product,p);
    const fk=JSON.stringify([month,country,product]);const f=facts.get(fk)??{month,country,product,value:0,units:0,invoices:new Set<string>()};f.value+=value;f.units+=quantity;f.invoices.add(key);facts.set(fk,f);
    if(customer){const c=customerMap.get(customer)??{id:customer,country,first:date,last:date,invoices:new Set<string>(),monetary:0};c.first=date<c.first?date:c.first;if(date>=c.last){c.last=date;c.country=country}c.invoices.add(key);c.monetary+=value;customerMap.set(customer,c)}
  }
  if(!accepted)throw new Error('No valid positive purchases were found. Check column mapping and ISO dates.');
  const asOf=addDay(last,1);
  const customers=[...customerMap.values()].map(c=>({id:c.id,country:c.country,first:c.first,last:c.last,recency:day(asOf)-day(c.last),frequency:c.invoices.size,monetary:c.monetary,cluster:0}));
  // Deterministic k-means on standardized log RFM; skip clustering for tiny uploads.
  const k=customers.length>=8?Math.min(4,customers.length):1;
  const x=customers.map(c=>[c.recency,c.frequency,c.monetary].map(Math.log1p));
  const means=[0,1,2].map(j=>x.reduce((a,r)=>a+r[j],0)/(x.length||1));
  const sd=means.map((m,j)=>Math.sqrt(x.reduce((a,r)=>a+(r[j]-m)**2,0)/(x.length||1))||1);
  const z=x.map(r=>r.map((v,j)=>(v-means[j])/sd[j]));let centers=Array.from({length:k},(_,i)=>z[Math.floor(i*z.length/k)]??[0,0,0]);
  for(let iter=0;iter<30&&z.length;iter++){const groups=Array.from({length:k},()=>[] as number[][]);z.forEach((r,i)=>{let best=0,distance=Infinity;centers.forEach((center,j)=>{const d=r.reduce((a,v,n)=>a+(v-center[n])**2,0);if(d<distance){best=j;distance=d}});customers[i].cluster=best;groups[best].push(r)});centers=groups.map((g,i)=>g.length?[0,1,2].map(j=>g.reduce((a,r)=>a+r[j],0)/g.length):centers[i])}
  const segments=Array.from({length:k},(_,id)=>{const g=customers.filter(c=>c.cluster===id);return{id,name:k===1?'All identified customers':`Customer group ${id+1}`,customers:g.length,recency:median(g.map(c=>c.recency)),frequency:median(g.map(c=>c.frequency)),monetary:median(g.map(c=>c.monetary)),revenue:g.reduce((a,c)=>a+c.monetary,0)}});
  const orderRows=[...orders.values()] as RetailReport['orders'];const months=[...new Set(orderRows.map(o=>o[0].slice(0,7)))].sort();
  const split=orderRows.map(o=>o[0]).sort()[Math.floor(orderRows.length*.7)];
  const training=[...orders.keys()].filter(key=>orders.get(key)[0]<split),testing=[...orders.keys()].filter(key=>orders.get(key)[0]>=split);
  const counts=new Map<string,number>();for(const key of training)for(const p of baskets.get(key)!)counts.set(p,(counts.get(p)??0)+1);
  const chosen=new Set([...counts].sort((a,b)=>b[1]-a[1]).slice(0,40).map(p=>p[0]));
  const pairCounts=(keys:string[])=>{const single=new Map<string,number>(),pairs=new Map<string,number>();for(const key of keys){const b=[...baskets.get(key)!].filter(p=>chosen.has(p)).sort();for(const p of b)single.set(p,(single.get(p)??0)+1);for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++){const pk=JSON.stringify([b[i],b[j]]);pairs.set(pk,(pairs.get(pk)??0)+1)}}return{single,pairs}};
  const tr=pairCounts(training),te=pairCounts(testing),rules:RetailReport['rules']=[];const minCount=Math.max(3,Math.ceil(training.length*.02));
  for(const [key,count]of tr.pairs){if(count<minCount)continue;const [a,b]=JSON.parse(key);for(const [left,right]of[[a,b],[b,a]]){const confidence=count/tr.single.get(left)!,lift=confidence/(tr.single.get(right)!/training.length);if(confidence<.2||lift<1.2)continue;const vc=te.pairs.get(key)??0,va=te.single.get(left)??0,vb=te.single.get(right)??0;rules.push({id:left+'>'+right,antecedent:[left],consequent:right,antecedentNames:[products.get(left).name],consequentName:products.get(right).name,count,support:count/training.length,confidence,lift,validationCount:vc,validationConfidence:va?vc/va:null,validationLift:va&&vb?vc*testing.length/(va*vb):null})}}
  rules.sort((a,b)=>b.lift-a.lift);const totalRules=rules.length;
  const weekly=new Map<string,number>();for(const o of orderRows){const date=new Date(o[0]+'T00:00:00Z'),weekday=(date.getUTCDay()+6)%7;const week=addDay(o[0],-weekday);weekly.set(week,(weekly.get(week)??0)+o[4])}
  const history=[...weekly].sort((a,b)=>a[0].localeCompare(b[0])).map(([week,actual])=>({week,actual}));
  const lookup=new Map(history.map(h=>[h.week,h.actual]));const predictions:Record<string,string|number|null>[]=[];
  for(const h of history.slice(-12)){const previous=[1,2,3,4].map(i=>lookup.get(addDay(h.week,-7*i)));if(previous.every(v=>v!==undefined)&&h.week>=first&&addDay(h.week,7)<=last)predictions.push({week:h.week,actual:h.actual,rolling_mean:previous.reduce((a,v)=>a+(v??0),0)/4})}
  const enough=predictions.length>=4;const total=predictions.reduce((a,r)=>a+Number(r.actual),0),mae=predictions.reduce((a,r)=>a+Math.abs(Number(r.actual)-Number(r.rolling_mean)),0)/(predictions.length||1);
  const lastMonthDate=new Date(last.slice(0,7)+'-01T00:00:00Z');lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth()-1);const lastCompleteMonth=lastMonthDate.toISOString().slice(0,7);
  const cohorts:RetailReport['cohorts']=[];for(const month of months.filter(m=>m<=lastCompleteMonth)){const group=customers.filter(c=>c.first.slice(0,7)===month);if(!group.length)continue;const retention=Array.from({length:12},(_,age)=>{const t=new Date(month+'-01T00:00:00Z');t.setUTCMonth(t.getUTCMonth()+age);const target=t.toISOString().slice(0,7);if(target>lastCompleteMonth)return null;const active=new Set(orderRows.filter(o=>o[0].slice(0,7)===target).map(o=>o[2]));return group.filter(c=>active.has(c.id)).length/group.length});cohorts.push({month,customers:group.length,retention})}
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return {version:1,meta:{id,name,source:'Workspace CSV upload',license:'User-provided data',currency,rawRows:csv.length,acceptedRows:accepted,creditRows:qualityCounts.credits,duplicateRows:qualityCounts.duplicates,from:first,to:last,asOf,sha256:[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join(''),historical:true,transformations:'Exact duplicate quarantine; ISO dates; positive purchases; negative quantities reported as credits. Uploads must contain merchandise records only.',lastCompleteMonth},
    months,countries:[...new Set(orderRows.map(o=>o[1]))].sort(),orders:orderRows,products:[...products.values()].map(p=>({product:p.product,name:p.name,revenue:p.revenue,units:p.units,orders:p.invoices.size})),
    productFacts:[...facts.values()].map(f=>[f.month,f.country,f.product,f.value,f.units,f.invoices.size]),credits:[...creditFacts.values()],customers,segments,clusterQuality:{method:customers.length<8?'Too few customers for clustering; one descriptive group.':'K-means, up to four groups, standardized log1p RFM. Exploratory; stability not measured for uploads.'},cohorts,
    rules:rules.slice(0,150),mining:{algorithm:'Apriori · pairs',maxLength:2,topProducts:40,minSupport:.02,minConfidence:.2,discoveryBefore:split,discoveryOrders:training.length,validationOrders:testing.length,totalRules,displayedRules:Math.min(150,totalRules),scope:'Frequent singleton screening, pair candidate generation and support pruning. Top 40 training products. Date-based 70/30 discovery/validation split. No rule is shown if evidence is insufficient.'},
    forecast:{champion:'rolling_mean',scores:enough?[{id:'rolling_mean',selection:null,test:{mae,wape:total?mae*predictions.length/total:0,weeks:predictions.length}}]:[],selectionWeeks:0,testWeeks:enough?predictions.length:0,history,predictions:enough?predictions:[],next:{week:history.length?addDay(history[history.length-1].week,7):last,value:null},note:'Upload forecast uses a four-week average baseline only. At least four valid evaluation weeks with four consecutive earlier observed weeks are required. Missing weeks remain unavailable. No forward forecast is issued because upload coverage and the final week completeness are unknown.'},
    quality:[{name:'Exact duplicate rows',count:qualityCounts.duplicates,handling:'One copy kept.'},{name:'Missing customer IDs',count:qualityCounts.missing,handling:'Excluded only from customer analysis.'},{name:'Credit lines',count:qualityCounts.credits,handling:'Negative quantities shown separately.'},{name:'Invalid rows',count:qualityCounts.invalid,handling:'Excluded; check dates, mapping and values.'},{name:'Free or zero-value lines',count:qualityCounts.excluded,handling:'Excluded from positive purchases.'}]};
}
