import { useEffect, useState } from 'react';
import { ImportsPage } from './features/imports/ImportsPage';

export default function App() {
  const [view,setView]=useState(window.location.hash.slice(1)||'imports');
  useEffect(()=>{const change=()=>setView(window.location.hash.slice(1)||'imports');window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  return <div className="workspace"><header className="app-header"><a className="brand" href="#imports">Poker Tracker</a><span>Local workspace</span></header>
    <div className="app-layout"><nav aria-label="Main navigation">{(['imports','hands','overview'] as const).map(page=><a key={page} href={`#${page}`} aria-current={view===page?'page':undefined}>{page[0].toUpperCase()+page.slice(1)}</a>)}</nav>
      <main id="main">{view==='imports'||!['hands','overview'].includes(view)?<ImportsPage />:null}</main>
    </div></div>;
}
