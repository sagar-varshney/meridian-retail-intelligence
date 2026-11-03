import type {RetailReport} from './retail';

export type ProfitAssumptions={customers:number;baselineRate:number;treatmentRate:number;orderValue:number;margin:number;incentive:number;contactCost:number;fixedCost:number};

/** An explicit counterfactual scenario, never a learned or observed profit result. */
export function profitScenario(a:ProfitAssumptions){
 if(Object.values(a).some(v=>!Number.isFinite(v)||v<0)||!Number.isSafeInteger(a.customers)||a.customers<1||a.baselineRate>1||a.treatmentRate>1||a.margin>1)throw new Error('Enter non-negative values, at least one customer and rates between 0% and 100%.');
 const contributionPerOrder=a.orderValue*a.margin;
 const additionalOrders=a.customers*(a.treatmentRate-a.baselineRate);
 const incrementalContribution=additionalOrders*contributionPerOrder;
 // Incentives are paid on ALL treatment conversions, including customers who
 // would have purchased anyway. Counting only incremental orders overstates ROI.
 const incentiveCost=a.customers*a.treatmentRate*a.incentive;
 const contactCost=a.customers*a.contactCost;
 const campaignCost=incentiveCost+contactCost+a.fixedCost;
 const profit=incrementalContribution-campaignCost;
 const breakEvenRate=contributionPerOrder>a.incentive?(a.baselineRate*contributionPerOrder+a.contactCost+a.fixedCost/a.customers)/(contributionPerOrder-a.incentive):null;
 return {additionalOrders,incrementalContribution,incentiveCost,contactCost,campaignCost,profit,roi:campaignCost>0?profit/campaignCost:null,breakEvenRate};
}

/** Compare both methods on identical observed target weeks. */
export function forecastComparison(report:RetailReport){
 const f=report.forecast;if(!f.testWeeks)return null;
 const history=new Map(f.history.map(r=>[r.week,r.actual]));
 const rows=f.predictions.slice(-f.testWeeks).flatMap(r=>{
  const week=String(r.week),date=new Date(week+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-7);
  const baseline=r.previous_week??history.get(date.toISOString().slice(0,10));
  const actual=r.actual,predicted=r[f.champion];
  return typeof actual==='number'&&Number.isFinite(actual)&&typeof predicted==='number'&&Number.isFinite(predicted)&&typeof baseline==='number'&&Number.isFinite(baseline)?[{week,actual,predicted,baseline}]:[];
 });
 const total=rows.reduce((a,r)=>a+r.actual,0);if(!rows.length||total<=0)return null;
 const selectedError=rows.reduce((a,r)=>a+Math.abs(r.actual-r.predicted),0),baselineError=rows.reduce((a,r)=>a+Math.abs(r.actual-r.baseline),0);
 return {weeks:rows.length,from:rows[0].week,to:rows.at(-1)!.week,selectedWape:selectedError/total,baselineWape:baselineError/total,relativeErrorReduction:baselineError>0?1-selectedError/baselineError:null,rows};
}

export function basketEvidence(report:RetailReport){
 const evaluated=report.rules.filter(r=>r.validationLift!=null);
 const supported=evaluated.filter(r=>r.validationCount>=5&&r.validationLift!>1);
 return {displayed:report.rules.length,evaluated:evaluated.length,supported:supported.length,missing:report.rules.length-evaluated.length};
}
