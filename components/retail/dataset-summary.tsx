import {CheckCircle2,Info,MinusCircle} from 'lucide-react';
import {analysisSummary} from '@/lib/analysis-summary';
import {useRetail} from '@/lib/retail-context';
import {num} from '@/lib/retail';
import {Badge} from './ui';

export default function DatasetSummary(){
 const {report}=useRetail(),{meta}=report;
 const summary=analysisSummary(report),imported=meta.id!=='uci-retail-ii';
 return <section className="panel dataset-summary" aria-label="Dataset analysis summary">
  <div className="panel-heading"><div><h2>{imported?'Your import, explained':'Your study, explained'}</h2><p>{num(meta.rawRows)} source rows · {meta.from} to {meta.to} · {meta.currency}</p></div><Badge tone="blue">{imported?'Import summary':'Full study'}</Badge></div>
  <div className="import-counts">{[
   ['Purchase rows',meta.acceptedRows,'Used for sales and basket analysis'],
   ['Credit rows',meta.creditRows,'Kept separate from positive purchases'],
   ['Duplicate rows',meta.duplicateRows,'Extra exact copies removed'],
   ['Invalid or excluded rows',summary.otherRows,'Not used as purchases or credits'],
  ].map(([label,count,detail])=><div key={String(label)}><small>{label}</small><strong>{num(Number(count))}</strong><span>{detail}</span></div>)}</div>
  <p className="import-quality-note"><Info size={15}/><span>{num(summary.missingCustomerRows)} rows flagged for missing customer IDs. This quality check can overlap with other checks. Valid anonymous purchases still contribute to sales; {num(report.customers.length)} identified customers contribute to customer analysis.</span></p>
  <div className="readiness-heading"><h3>What you can explore</h3><p>Availability reflects the records in this dataset.</p></div>
  <div className="analysis-readiness">{summary.analyses.map(a=><div key={a.name} data-status={a.status}>{a.status==='ready'?<CheckCircle2 size={17}/>:<MinusCircle size={17}/>}<div><strong>{a.name}</strong><p>{a.detail}</p></div><Badge tone={a.status==='ready'?'green':a.status==='limited'?'amber':'neutral'}>{a.status==='ready'?'Available':a.status==='limited'?'Limited':'Unavailable'}</Badge></div>)}</div>
 </section>;
}
