import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let client:Promise<SupabaseClient>|null=null;
export function authClient(){
 if(!client)client=fetch('/api/config').then(async r=>{if(!r.ok)throw new Error('Authentication is not configured.');const c=await r.json();return createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})});
 return client;
}
export async function authHeaders():Promise<Record<string,string>>{const supabase=await authClient();const {data}=await supabase.auth.getSession();return data.session?{Authorization:'Bearer '+data.session.access_token}:{}}
export async function signOut(){const supabase=await authClient();const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;window.location.assign('/')}
export async function socialProviders(){const config=await fetch('/api/config').then(r=>r.json());const response=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.key}});if(!response.ok)return {google:false,github:false};const settings=await response.json();return {google:settings.external?.google===true,github:settings.external?.github===true}}
export async function socialSignIn(provider:'google'|'github'){const supabase=await authClient();const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:window.location.origin}});if(error)throw error}
