import {useEffect,useState} from 'react';
import {Sun,Moon,Monitor} from 'lucide-react';
type Theme='system'|'light'|'dark';
function storedTheme():Theme{try{const t=localStorage.getItem('meridian-theme');return t==='light'||t==='dark'?t:'system'}catch{return 'system'}}
export function initializeTheme(){const t=storedTheme();document.documentElement.dataset.theme=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}
export default function ThemeControl(){
 const [theme,setTheme]=useState<Theme>(storedTheme);
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(media.matches?'dark':'light'):theme};apply();try{localStorage.setItem('meridian-theme',theme)}catch{}media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply)},[theme]);
 const Icon=theme==='dark'?Moon:theme==='light'?Sun:Monitor;
 return <label className="theme-control" title="Choose a colour theme"><Icon size={16}/><select aria-label="Color theme" value={theme} onChange={e=>setTheme(e.target.value as Theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
}
