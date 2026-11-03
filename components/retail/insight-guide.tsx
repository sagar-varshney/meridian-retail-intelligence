import {ArrowRight,Lightbulb} from 'lucide-react';

export default function InsightGuide({meaning,nextStep,note,action,onAction}:{meaning:string;nextStep:string;note:string;action?:string;onAction?:()=>void}){
 return <section className="insight-guide" aria-label="Business interpretation">
  <div className="insight-guide-title"><Lightbulb size={18}/><h2>From the numbers to a decision</h2></div>
  <div className="insight-guide-body"><div><h3>What this means</h3><p>{meaning}</p></div><div><h3>Suggested next step</h3><p>{nextStep}</p></div></div>
  <div className="insight-guide-footer"><small>{note}</small>{action&&onAction&&<button className="text-button" onClick={onAction}>{action}<ArrowRight size={14}/></button>}</div>
 </section>;
}
