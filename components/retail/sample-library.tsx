import {useState} from 'react';
import {ArrowRight,Download,FileSpreadsheet,LoaderCircle} from 'lucide-react';
import {sampleCatalog} from '@/lib/sample-data';
import {num} from '@/lib/retail';
import {useRetail} from '@/lib/retail-context';
import {Badge} from './ui';

export default function SampleLibrary(){
 const {role,openSample}=useRetail(),[preparing,setPreparing]=useState('');
 const prepare=async(id:string)=>{setPreparing(id);try{await openSample(id)}finally{setPreparing('')}};
 return <section className="sample-library" aria-label="Real-data sample library">
  <div className="panel-heading"><div><h2>Choose a real-data sample</h2><p>Country subsets of the same UCI retailer · historical 2009–2011 · all values in GBP</p></div><Badge tone="blue">3 country studies</Badge></div>
  <div className="sample-grid">{sampleCatalog.samples.map(s=><article className="panel sample-card" key={s.id}>
   <div className="sample-title"><span className="dataset-symbol"><FileSpreadsheet size={19}/></span><h3>{s.country}</h3><Badge>Real data</Badge></div>
   <p>{s.description}</p><dl><div><dt>Source rows</dt><dd>{num(s.rows)}</dd></div><div><dt>File size</dt><dd>{(s.bytes/1000000).toFixed(2)} MB</dd></div><div><dt>Period</dt><dd>{s.from} → {s.to}</dd></div></dl>
   <div className="sample-actions"><a className="button" href={s.url} download><Download size={14}/>Download CSV</a><button className="button primary" disabled={role!=='manager'||Boolean(preparing)} onClick={()=>prepare(s.id)}>{preparing===s.id?<LoaderCircle size={14} className="spin"/>:<ArrowRight size={14}/>}Use sample</button></div>
  </article>)}</div>
  <p className="sample-attribution">{sampleCatalog.citation} · {sampleCatalog.license}. Merchandise codes are selected; source duplicates and credits remain for cleaning. <a href={sampleCatalog.sourceUrl} target="_blank" rel="noreferrer">View source</a></p>
 </section>;
}
