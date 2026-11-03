import express from 'express';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {analyseCSV} from '../lib/import-analysis';

const app=express();app.set('trust proxy',1);app.disable('x-powered-by');
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!url||!key)throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. No service-role key is required.');
const prefix='meridian_',bucket='meridian-uploads';
const str=(v:unknown,n=2000)=>typeof v==='string'?v.trim().slice(0,n):'';
const action=(r:any)=>({id:r.id,workspaceId:r.workspace_id,datasetId:r.dataset_id,title:r.title,description:r.description,evidence:r.evidence,owner:r.owner,priority:r.priority,status:r.status,dueDate:r.due_date,outcome:r.outcome,createdAt:r.created_at,updatedAt:r.updated_at});
const check=(r:{data:any;error:any})=>{if(r.error)throw r.error;return r.data};
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');next()});
app.get('/api/health',(_req,res)=>res.json({status:'ok',hosting:'Render',database:'Supabase'}));
app.get('/api/config',(_req,res)=>res.json({url,key}));
app.use('/api',express.json({limit:'4mb'}));
app.use('/api',async(req,res)=>{
 try{
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token){res.status(401).json({error:'Sign in to access your workspace.'});return}
  const db=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user){res.status(401).json({error:'Your session expired. Please sign in again.'});return}
  const user=auth.data.user,name=str(user.user_metadata?.display_name,100)||user.email||'Member';
  if(req.method!=='GET'){
   const expected=process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||`${req.protocol}://${req.get('host')}`;
   if(req.get('origin')!==new URL(expected).origin){res.status(403).json({error:'Request origin is not allowed.'});return}
  }
  check(await db.rpc('meridian_bootstrap'));
  const memberships=check(await db.from(prefix+'members').select('*').eq('user_id',user.id));
  const wid=str(req.get('x-workspace-id'),100)||memberships?.[0]?.workspace_id;
  const member=memberships?.find((m:any)=>m.workspace_id===wid);if(!member){res.status(403).json({error:'You are not a member of this workspace.'});return}
  const manager=member.role==='manager',parts=req.path.slice(1).split('/'),p=parts.join('/'),method=req.method,v=req.body||{};
  const fail=(message:string,status=400)=>res.status(status).json({error:message});
  const datasetAllowed=async(id:string)=>id==='uci-retail-ii'||Boolean(check(await db.from(prefix+'datasets').select('id').eq('id',id).eq('workspace_id',wid).maybeSingle()));
  if(p==='bootstrap'&&method==='GET'){
   const [workspaces,team,datasets]=await Promise.all([db.from(prefix+'workspaces').select('*'),db.from(prefix+'members').select('*').eq('workspace_id',wid),db.from(prefix+'datasets').select('*').eq('workspace_id',wid).eq('status','ready').order('created_at',{ascending:false})]);
   res.json({user:{id:user.id,name,email:user.email},workspaceId:wid,role:member.role,
    workspaces:check(workspaces).map((w:any)=>({id:w.id,name:w.name,role:memberships?.find((m:any)=>m.workspace_id===w.id)?.role})),
    members:check(team).map((m:any)=>({id:m.id,userId:m.user_id,name:m.name,email:m.email,role:m.role})),
    datasets:[{id:'uci-retail-ii',name:'Online Retail II',rows:1067371,status:'ready',builtin:true},...check(datasets).map((d:any)=>({...d,createdAt:d.created_at}))]});return;
  }
  if(p==='actions'&&method==='GET'){res.json(check(await db.from(prefix+'actions').select('*').eq('workspace_id',wid).order('updated_at',{ascending:false})).map(action));return}
  if(p==='actions'&&method==='POST'){
   const title=str(v.title,160);if(!title){fail('Enter an action title.');return}const did=str(v.datasetId,100)||'uci-retail-ii';if(!await datasetAllowed(did)){fail('Dataset not found.',404);return}
   const due=str(v.dueDate,10);if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due)){fail('Use an ISO due date.');return}
   const r=check(await db.from(prefix+'actions').insert({workspace_id:wid,dataset_id:did,title,description:str(v.description),evidence:str(v.evidence),owner:str(v.owner,160)||'Unassigned',priority:['High','Medium','Low'].includes(v.priority)?v.priority:'Medium',due_date:due}).select().single());res.status(201).json(action(r));return;
  }
  if(parts[0]==='actions'&&parts.length===2){
   const current=check(await db.from(prefix+'actions').select('*').eq('id',parts[1]).eq('workspace_id',wid).maybeSingle());if(!current){fail('Action not found.',404);return}
   if(method==='GET'){const events=check(await db.from(prefix+'events').select('id,actor,text,created_at').eq('workspace_id',wid).eq('action_id',current.id).order('created_at'));res.json({action:action(current),events:events.map((e:any)=>({...e,createdAt:e.created_at}))});return}
   if(method==='PATCH'){
    const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
    for(const k of ['title','description','evidence','owner','outcome'])if(v[k]!==undefined)patch[k]=str(v[k],k==='title'?160:2000);
    if(v.dueDate!==undefined){const due=str(v.dueDate,10);if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due)){fail('Use an ISO due date.');return}patch.due_date=due}
    if(v.status!==undefined){if(!['To do','In progress','Done'].includes(v.status)){fail('Invalid status.');return}patch.status=v.status}
    if(v.priority!==undefined){if(!['High','Medium','Low'].includes(v.priority)){fail('Invalid priority.');return}patch.priority=v.priority}
    if(patch.title===''){fail('An action needs a title.');return}res.json(action(check(await db.from(prefix+'actions').update(patch).eq('id',current.id).eq('workspace_id',wid).select().single())));return;
   }
   if(method==='DELETE'){if(!manager){fail('Only managers can delete actions.',403);return}check(await db.from(prefix+'actions').delete().eq('id',current.id).eq('workspace_id',wid));res.json({deleted:true});return}
  }
  if(p==='comments'&&method==='POST'){
   if(!str(v.text)){fail('Enter a comment.');return}const a=check(await db.from(prefix+'actions').select('id').eq('id',str(v.actionId,100)).eq('workspace_id',wid).maybeSingle());if(!a){fail('Action not found.',404);return}
   check(await db.from(prefix+'events').insert({workspace_id:wid,action_id:a.id,actor_id:user.id,actor:name,text:str(v.text)}));res.status(201).json({saved:true});return;
  }
  if(p==='datasets'&&method==='GET'){res.json(check(await db.from(prefix+'datasets').select('id,name,rows,status,created_at').eq('workspace_id',wid).order('created_at',{ascending:false})).map((d:any)=>({...d,createdAt:d.created_at})));return}
  if(parts[0]==='datasets'&&parts.length===2&&method==='PATCH'){
   if(!manager){fail('Only managers can archive or restore datasets.',403);return}if(!['ready','archived'].includes(v.status)){fail('Invalid dataset status.');return}
   const r=check(await db.from(prefix+'datasets').update({status:v.status}).eq('id',parts[1]).eq('workspace_id',wid).select('id').maybeSingle());if(!r){fail('Dataset not found.',404);return}res.json({saved:true});return;
  }
  if(p==='datasets'&&method==='POST'){
   if(!manager){fail('Only managers can import datasets.',403);return}if(typeof v.csv!=='string'||Buffer.byteLength(v.csv)>3000000){fail('Choose a CSV smaller than 3 MB.');return}
   if(!['GBP','USD','EUR','INR','AUD','CAD'].includes(v.currency)){fail('Choose a supported currency.');return}
   if(!v.mapping||typeof v.mapping!=='object'||Object.values(v.mapping).some(x=>typeof x!=='string')){fail('Map the CSV columns.');return}
   const id=crypto.randomUUID(),datasetName=str(v.name,100)||'Imported transactions',objectKey=wid+'/'+id;
   const report=await analyseCSV(v.csv,v.mapping,datasetName,v.currency,id);
   try{check(await db.storage.from(bucket).upload(objectKey+'.csv',Buffer.from(v.csv),{contentType:'text/csv'}));check(await db.storage.from(bucket).upload(objectKey+'.json',Buffer.from(JSON.stringify(report)),{contentType:'application/json'}));check(await db.from(prefix+'datasets').insert({id,workspace_id:wid,name:datasetName,object_key:objectKey,rows:report.meta.rawRows,created_by:user.id}));}
   catch(e){await db.storage.from(bucket).remove([objectKey+'.csv',objectKey+'.json']);throw e}
   res.status(201).json({id,name:datasetName,rows:report.meta.rawRows});return;
  }
  if(parts[0]==='reports'&&parts.length===2&&method==='GET'){
   const d=check(await db.from(prefix+'datasets').select('object_key').eq('id',parts[1]).eq('workspace_id',wid).maybeSingle());if(!d){fail('Dataset not found.',404);return}
   const object=check(await db.storage.from(bucket).download(d.object_key+'.json'));res.setHeader('Cache-Control','no-store');res.type('json').send(await object.text());return;
  }
  if(p==='views'&&method==='GET'){res.json(check(await db.from(prefix+'saved_views').select('id,name,config').eq('workspace_id',wid).eq('user_id',user.id).order('created_at',{ascending:false})));return}
  if(p==='views'&&method==='POST'){
   const name=str(v.name,80);if(!name){fail('Name the view.');return}if(JSON.stringify(v.config||{}).length>2000){fail('View configuration is too large.');return}
   check(await db.from(prefix+'saved_views').insert({workspace_id:wid,user_id:user.id,name,config:v.config||{}}));res.status(201).json({saved:true});return;
  }
  if(p==='members'&&method==='POST'){
   if(!manager){fail('Only managers can invite members.',403);return}const email=str(v.email,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){fail('Enter a valid email.');return}
   const exists=check(await db.from(prefix+'members').select('id').eq('workspace_id',wid).eq('email',email).maybeSingle());if(exists){fail('That member is already added.',409);return}
   check(await db.from(prefix+'members').insert({workspace_id:wid,email,name:email,role:v.role==='manager'?'manager':'analyst'}));res.status(201).json({saved:true,note:'Membership added. Your teammate must confirm their email and sign in. No invitation email was sent.'});return;
  }
  fail('Endpoint not found.',404);
 }catch(e:any){const message=e?.message||'Request failed.';if(/CSV|column|Map |rows|purchases|ISO|quote|empty|At least|Confirm your email/.test(message)){res.status(400).json({error:message});return}console.error('Retail API:',e?.code||e?.name||'error');res.status(500).json({error:'The operation could not be completed. Please retry.'})}
});
app.use('/assets',express.static(path.resolve('dist/assets'),{maxAge:'1y',immutable:true}));
app.use(express.static(path.resolve('dist'),{maxAge:'1h',index:false}));
app.get('/{*path}',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.sendFile(path.resolve('dist/index.html'))});
app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(err.status===413?413:400).json({error:err.status===413?'Request exceeds 4 MB.':'Invalid request body.'}));
const server=app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Meridian listening on port '+(process.env.PORT||3000)));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
