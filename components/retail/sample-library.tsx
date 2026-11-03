import {useState} from 'react';
import {ArrowRight,Download,FileSpreadsheet,LoaderCircle} from 'lucide-react';
import {sampleCatalog} from '@/lib/sample-data';
import {num} from '@/lib/retail';
import {useRetail} from '@/lib/retail-context';
import {Badge} from './ui';

export default function SampleLibrary(){
 const {role,openSample,go}=useRetail(),[preparing,setPreparing]=useState(''),[source,setSource]=useState('all');
 const prepare=async(id:string)=>{setPreparing(id);try{await openSample(id)}finally{setPreparing('')}};
 const samples=sampleCatalog.samples.filter(s=>source==='all'||s.sourceId===source);
 return <section className="sample-library" aria-label="Real-data sample library">
  <div className="panel-heading"><div><h2>Choose a real-data study</h2><p>Eight UK-retailer country subsets and three Brazilian marketplace quarters. Each study retains its original currency and licence.</p></div><Badge tone="blue">{sampleCatalog.samples.length} transaction studies</Badge></div>
  <div className="section-toolbar"><label>Transaction source<select aria-label="Sample source" value={source} onChange={e=>setSource(e.target.value)}><option value="all">All transaction sources</option><option value="uci-retail-ii">UCI Online Retail II · GBP</option><option value="olist">Olist Brazilian E-Commerce · BRL</option></select></label><button className="text-button" onClick={()=>go('Business impact')}>View independent forecasting benchmark<ArrowRight size={14}/></button></div>
  <div className="sample-grid">{samples.map(s=><article className="panel sample-card" key={s.id}>
   <div className="sample-title"><span className="dataset-symbol"><FileSpreadsheet size={19}/></span><h3>{s.sourceId==='olist'?s.name:s.country}</h3><Badge>{s.currency}</Badge></div>
   <small className="sample-source">{s.source}</small><p>{s.description}</p><dl><div><dt>Source rows</dt><dd>{num(s.rows)}</dd></div><div><dt>File size</dt><dd>{(s.bytes/1000000).toFixed(2)} MB</dd></div><div><dt>Period</dt><dd>{s.from} → {s.to}</dd></div></dl>
   <div className="sample-actions"><a className="button" href={s.url} download><Download size={14}/>Download CSV</a><button className="button primary" disabled={role!=='manager'||Boolean(preparing)} onClick={()=>prepare(s.id)}>{preparing===s.id?<LoaderCircle size={14} className="spin"/>:<ArrowRight size={14}/>}Use sample</button></div>
   <p className="sample-licence"><a href={s.sourceUrl} target="_blank" rel="noreferrer">Source</a> · <a href={s.licenseUrl} target="_blank" rel="noreferrer">{s.license}</a>{s.sourceId==='olist'?' · Noncommercial educational use; delivered orders only.':''}</p>
   <details className="sample-details"><summary>Preparation and attribution</summary><p>{s.transformations}</p><p>{s.citation}</p></details>
  </article>)}</div>
  <p className="sample-attribution">Subsets from one source are not additional independent retailers. Olist and the UCI retailer remain separate studies; currencies are never converted or pooled. UCI Sales Transactions Weekly is a separate benchmark of 811 products × 52 weeks and has no transaction prices or costs.</p>
 </section>;
}
