import { useEffect, useRef, useState, type DependencyList } from 'react';
import { message } from './client';

export function usePoll<T>(loader:(signal:AbortSignal)=>Promise<T>,keys:DependencyList=[],interval=1000) {
  const load=useRef(loader); load.current=loader;
  const [revision,refresh]=useState(0);
  const [state,setState]=useState<{data:T|null;loading:boolean;error:string|null}>({data:null,loading:true,error:null});
  useEffect(()=>{
    let active=true; let timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    setState(old=>({...old,loading:true,error:null}));
    async function poll() {
      try { const data=await load.current(controller.signal); if(active) setState({data,loading:false,error:null}); }
      catch(error) { if(active) setState(old=>({...old,loading:false,error:message(error)})); }
      finally { if(active&&interval>0) timer=setTimeout(poll,interval); }
    }
    void poll();
    return ()=>{active=false;controller.abort();clearTimeout(timer);};
  },[...keys,revision,interval]);
  return {...state,reload:()=>refresh(value=>value+1)};
}
