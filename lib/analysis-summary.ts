import type {RetailReport} from './retail';

export type AnalysisAvailability = {name:string;status:'ready'|'limited'|'unavailable';detail:string};

/** Describe evidence that actually exists; a visible page alone is not readiness. */
export function analysisSummary(report:RetailReport){
 const {meta,customers,segments,cohorts,rules,forecast}=report;
 const otherRows=Math.max(0,meta.rawRows-meta.acceptedRows-meta.creditRows-meta.duplicateRows);
 const missingCustomerRows=report.quality.find(q=>q.name==='Missing customer IDs')?.count??0;
 const groups=segments.filter(s=>s.customers>0).length;
 const followUp=cohorts.some(c=>c.retention.slice(1).some(v=>v!=null));
 const evaluated=forecast.scores.find(s=>s.id===forecast.champion)?.test;
 const forecastReady=Boolean(evaluated&&evaluated.weeks>0&&Number.isFinite(evaluated.wape));
 const analyses:AnalysisAvailability[]=[
  {name:'Sales overview',status:meta.acceptedRows?'ready':'unavailable',detail:`${report.orders.length.toLocaleString('en-GB')} purchase orders; credits reported separately.`},
  {name:'Customer grouping',status:customers.length===0?'unavailable':groups>1?'ready':'limited',detail:customers.length===0?'No identified customers. Map customer IDs to analyse customer behaviour.':groups>1?`${customers.length.toLocaleString('en-GB')} identified customers in ${groups} exploratory groups.`:'One descriptive group. More varied identified customers are needed for useful clustering.'},
  {name:'Retention cohorts',status:cohorts.length===0?'unavailable':followUp?'ready':'limited',detail:followUp?'Observed follow-up months are available; incomplete months stay blank.':'No complete follow-up month is observable yet. Entry-month purchases alone do not measure retention.'},
  {name:'Market baskets',status:rules.length?'ready':'limited',detail:rules.length?`${rules.length.toLocaleString('en-GB')} displayed rules; inspect later-period evidence before proposing a bundle.`:'No repeated product pairs meet the discovery thresholds. More orders or a broader period may help.'},
  {name:'Forecast evaluation',status:forecastReady?'ready':'unavailable',detail:forecastReady?`${evaluated!.weeks} evaluation weeks. ${forecast.next.value==null?'Historical baseline only; no forward forecast issued.':'Forward estimate available at the historical cutoff.'}`:'Not enough consecutive weekly history for evaluation. Add more observed weeks; missing weeks are not zero sales.'},
 ];
 return {otherRows,missingCustomerRows,groups,analyses};
}
