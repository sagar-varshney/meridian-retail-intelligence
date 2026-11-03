import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let client:Promise<SupabaseClient>|null=null;
export function authClient(){
 if(!client)client=fetch('/api/config').then(async r=>{if(!r.ok)throw new Error('Authentication is not configured.');const c=await r.json();return createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})});
 return client;
}
export async function authHeaders():Promise<Record<string,string>>{const supabase=await authClient();const {data}=await supabase.auth.getSession();return data.session?{Authorization:'Bearer '+data.session.access_token}:{}}
export async function signOut(){const supabase=await authClient();await supabase.auth.signOut();window.location.assign('/')}
