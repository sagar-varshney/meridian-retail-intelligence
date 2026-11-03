import {profitScenario,forecastComparison,basketEvidence} from '../lib/business-impact.ts';
import {createHash} from 'node:crypto';
import {analysisSummary} from '../lib/analysis-summary.ts';
import {sampleCatalog,sampleProvenance} from '../lib/sample-data.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyseCSV,parseCSV,detectMapping} from '../lib/import-analysis.ts';
import {overview} from '../lib/retail.ts';

const headers='Invoice,StockCode,Description,Quantity,InvoiceDate,Price,Customer ID,Country';
const csv=[headers,
 '100,A,"Red, gift",2,2020-01-01,5,1,UK',
 '100,B,Blue gift,1,2020-01-01,4,1,UK',
 '101,A,Red gift,1,2020-01-02,5,,UK',
 '102,B,Blue gift,3,2020-02-02,4,2,France',
 'C103,A,Red gift,-1,2020-02-03,5,1,UK',
 '102,B,Blue gift,3,2020-02-02,4,2,France',
 '104,A,Red gift,1,2020-02-30,5,1,UK',
 '105,A,Red gift,1,01/02/2020,5,1,UK',
 '106,A,Red gift,1,2020-02-02,-2,1,UK',
 '107,A,Red gift,1,2020-02-02,,1,UK',
].join('\n');
const mapping=detectMapping(parseCSV(csv)[0]);

test('CSV parser handles escaped quotes, commas, CRLF and embedded newlines',()=>{
 assert.deepEqual(parseCSV('\uFEFFa,b\r\n"x,y","a""b\nnext"\r\n'),[['a','b'],['x,y','a"b\nnext']]);
 assert.throws(()=>parseCSV('a,b\n"broken,b'),/unclosed/);
});
test('column aliases and explicit custom mapping are supported',()=>{
 assert.equal(mapping.customer,'Customer ID');assert.equal(mapping.invoice,'Invoice');
 assert.equal(detectMapping(['Order','SKU','Qty']).product,'SKU');
});
test('import separates credits, duplicates, bad dates and anonymous customers',async()=>{
 const r=await analyseCSV(csv,mapping,'Test','GBP','test');
 assert.equal(r.meta.rawRows,10);assert.equal(r.meta.acceptedRows,4);
 assert.equal(r.meta.duplicateRows,1);assert.equal(r.meta.creditRows,1);
 assert.equal(r.customers.length,2);assert.equal(r.orders.length,3);
 assert.equal(r.meta.asOf,'2020-02-03');
 assert.equal(r.customers.find(c=>c.id==='1').monetary,14);
 assert.equal(r.customers.find(c=>c.id==='1').recency,33);
 assert.equal(r.credits.reduce((sum,c)=>sum+c[2],0),5);
 const stats=overview(r,'2020-01','2020-02','All countries');
 assert.equal(stats.revenue,31);assert.equal(stats.units,7);assert.equal(stats.credits,5);
 assert.equal(stats.customers,2);assert.equal(stats.orders.length,3);
 assert.equal(stats.products.reduce((a,p)=>a+p.revenue,0),31);
 assert.equal(overview(r,'2020-02','2020-02','UK').revenue,0);
 assert.equal(overview(r,'2020-02','2020-02','France').revenue,12);
 assert.equal(r.forecast.scores.length,0);assert.equal(r.forecast.next.value,null);
});
test('incomplete cohort months remain unavailable',async()=>{
 const r=await analyseCSV(csv,mapping,'Test','GBP','test');
 assert.equal(r.cohorts[0].retention[0],1);assert.equal(r.cohorts[0].retention[1],null);
});
test('conflicting invoice identities and ambiguous headers cannot corrupt order totals',async()=>{
 const conflict=headers+'\n100,A,One,1,2020-01-01,5,1,UK\n100,B,Two,1,2020-02-01,5,1,UK';
 await assert.rejects(analyseCSV(conflict,mapping,'Bad','GBP','x'),/conflicting dates/);
 await assert.rejects(analyseCSV('Invoice,Invoice\n1,2\n3,4',mapping,'Bad','GBP','x'),/headers/);
});
test('invalid mappings, empty purchases and oversized datasets fail explicitly',async()=>{
 await assert.rejects(analyseCSV(csv,{},'Bad','GBP','x'),/Map the/);
 await assert.rejects(analyseCSV(headers+'\n1,A,X,0,2020-01-01,0,,\n2,B,Y,0,2020-01-02,0,,',mapping,'Bad','GBP','x'),/No valid/);
 await assert.rejects(analyseCSV(headers+'\n'+Array(20001).fill('1,A,X,1,2020-01-01,1,1,UK').join('\n'),mapping,'Big','GBP','x'),/20,000/);
});
test('full study reconciles invoice, product and monthly totals',()=>{
 const r=JSON.parse(fs.readFileSync(new URL('../public/data/retail-demo.json',import.meta.url)));
 assert.equal(r.meta.rawRows,1067371);assert.equal(r.orders.length,39516);
 const s=overview(r,r.months[0],r.months.at(-1),'All countries');
 const productTotal=r.products.reduce((a,p)=>a+p.revenue,0);
 assert.ok(Math.abs(s.revenue-productTotal)<.1);
 assert.ok(Math.abs(s.revenue-s.products.reduce((a,p)=>a+p.revenue,0))<.1);
 assert.ok(Math.abs(s.revenue-s.timeline.reduce((a,m)=>a+m.sales,0))<.1);
 assert.equal(s.customers,r.customers.length);
 assert.equal(s.orders.length,new Set(r.orders.map(o=>o[5])).size);
 assert.equal(r.segments.reduce((a,s)=>a+s.customers,0),r.customers.length);
 assert.ok(r.forecast.history.some(h=>h.actual===null));
 assert.equal(r.forecast.testWeeks,8);
 const best=[...r.forecast.scores].filter(s=>s.selection).sort((a,b)=>a.selection.wape-b.selection.wape)[0];
 assert.equal(r.forecast.champion,best.id);
 for(const rule of r.rules){assert.ok(rule.support>=r.mining.minSupport);assert.ok(rule.confidence>=r.mining.minConfidence);assert.ok(rule.antecedent.length<=2);assert.ok(rule.validationCount<=r.mining.validationOrders)}
});

test('import summary reconciles source rows without double-counting missing IDs',async()=>{
 const r=await analyseCSV(csv,mapping,'Summary','GBP','summary');
 const summary=analysisSummary(r);
 assert.equal(summary.otherRows,4);
 assert.equal(r.meta.acceptedRows+r.meta.creditRows+r.meta.duplicateRows+summary.otherRows,r.meta.rawRows);
 assert.equal(summary.missingCustomerRows,1);
 assert.equal(summary.analyses.find(a=>a.name==='Forecast evaluation').status,'unavailable');
 assert.equal(summary.analyses.find(a=>a.name==='Customer grouping').status,'limited');
 const anonymous=await analyseCSV(headers+'\n1,A,One,1,2020-01-01,5,,UK\n2,B,Two,1,2020-01-02,5,,UK',mapping,'Anonymous','GBP','anonymous');
 const availability=analysisSummary(anonymous);
 assert.equal(availability.analyses.find(a=>a.name==='Sales overview').status,'ready');
 assert.equal(availability.analyses.find(a=>a.name==='Customer grouping').status,'unavailable');
 assert.equal(availability.analyses.find(a=>a.name==='Retention cohorts').status,'unavailable');
});

test('real sample files fit limits, retain provenance and produce usable analyses',async()=>{
 for(const sample of sampleCatalog.samples){
  const text=fs.readFileSync(new URL('../public'+sample.url,import.meta.url),'utf8');
  const digest=createHash('sha256').update(text).digest('hex');
  assert.equal(digest,sample.sha256);
  assert.ok(Buffer.byteLength(text)<3000000);
  const rows=parseCSV(text);
  assert.equal(rows.length-1,sample.rows);
  assert.ok(sample.rows<=20000);
  assert.ok(rows.slice(1).every(row=>row[7]===sample.country));
  const r=await analyseCSV(text,detectMapping(rows[0]),sample.name,sample.currency,sample.id);
  assert.equal(r.meta.license,sample.license);
  assert.equal(r.meta.sourceUrl,sample.sourceUrl);
  assert.ok(r.meta.source.includes(sample.source));
  assert.ok(r.meta.citation.includes(sample.citation));
  const summary=analysisSummary(r);
  assert.equal(r.meta.acceptedRows+r.meta.duplicateRows+r.meta.creditRows+summary.otherRows,sample.rows);
  assert.ok(r.orders.length>0);
  assert.equal(summary.analyses.find(a=>a.name==='Customer grouping').status,'ready');
  assert.equal(summary.analyses.find(a=>a.name==='Retention cohorts').status,'ready');
  if(['france','germany'].includes(sample.id))assert.equal(summary.analyses.find(a=>a.name==='Forecast evaluation').status,'ready');
  if(sample.id==='netherlands')assert.equal(summary.analyses.find(a=>a.name==='Forecast evaluation').status,'unavailable');
  assert.equal(r.forecast.next.value,null);
  if(sample.id==='france'){
   await assert.rejects(analyseCSV(text,detectMapping(rows[0]),sample.name,'INR','wrong-currency'),/recorded in GBP/);
   const changed=await analyseCSV(text+'\n',detectMapping(rows[0]),'Changed upload','GBP','changed');
   assert.equal(changed.meta.license,'User-provided data');
   assert.equal(changed.meta.sourceUrl,undefined);
  }
 }
 assert.equal(sampleProvenance('invalid-hash'),undefined);
});

test('profit scenarios charge incentives on all treatment purchases and include losses',()=>{
 const a={customers:1000,baselineRate:.02,treatmentRate:.03,orderValue:50,margin:.4,incentive:2,contactCost:.1,fixedCost:0};
 const p=profitScenario(a);
 assert.ok(Math.abs(p.additionalOrders-10)<1e-10);
 assert.equal(p.incentiveCost,60);
 assert.ok(Math.abs(p.profit-40)<1e-10);
 assert.ok(Math.abs(p.roi-.25)<1e-10);
 const be=profitScenario({...a,treatmentRate:p.breakEvenRate});
 assert.ok(Math.abs(be.profit)<1e-9);
 assert.ok(profitScenario({...a,treatmentRate:a.baselineRate}).profit<0);
 assert.equal(profitScenario({...a,incentive:0,contactCost:0,fixedCost:0}).roi,null);
 assert.throws(()=>profitScenario({...a,treatmentRate:1.1}));
 assert.throws(()=>profitScenario({...a,customers:0}));
 assert.throws(()=>profitScenario({...a,margin:NaN}));
});

test('historical forecast comparison uses matched weeks and reports the naive baseline honestly',()=>{
 const r=JSON.parse(fs.readFileSync(new URL('../public/data/retail-demo.json',import.meta.url)));
 const c=forecastComparison(r);
 assert.equal(c.weeks,8);
 assert.ok(Math.abs(c.selectedWape-.1155022576780172)<1e-10);
 assert.ok(Math.abs(c.baselineWape-.1264650211268952)<1e-10);
 assert.ok(c.relativeErrorReduction>0);
 const noData=structuredClone(r);noData.forecast.testWeeks=0;assert.equal(forecastComparison(noData),null);
 const b=basketEvidence(r);assert.ok(b.supported<=b.evaluated&&b.evaluated<=b.displayed);
});

test('independent weekly benchmark reproduces source metrics without future target leakage',()=>{
 const b=JSON.parse(fs.readFileSync(new URL('../public/data/evidence/weekly-benchmark.json',import.meta.url)));
 const raw=fs.readFileSync(new URL('../public'+b.rawUrl,import.meta.url),'utf8');
 assert.equal(createHash('sha256').update(raw).digest('hex'),b.sha256);
 const rows=parseCSV(raw),head=rows.shift();assert.equal(rows.length,811);
 let actual=0,naiveError=0,meanError=0;
 for(const row of rows){const y=Array.from({length:52},(_,i)=>Number(row[head.indexOf('W'+i)]));for(let i=44;i<52;i++){actual+=y[i];naiveError+=Math.abs(y[i]-y[i-1]);meanError+=Math.abs(y[i]-y.slice(i-4,i).reduce((a,v)=>a+v,0)/4)}}
 assert.equal(b.observations,811*52);
 assert.equal(b.champion,[...b.scores].sort((a,b)=>a.selection.wape-b.selection.wape)[0].id);
 assert.equal(b.scores.find(s=>s.id==='rolling_mean').test.wape,meanError/actual);
 assert.equal(b.scores.find(s=>s.id==='previous_week').test.wape,naiveError/actual);
 assert.ok(meanError<naiveError);
});
