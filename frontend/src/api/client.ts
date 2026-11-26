import type { HandDetail, HandSummary, ImportJob, JobDetail, Overview, Page, UserSettings, Watcher } from './contracts';

function query(values:Record<string,string|number|null|undefined>) {
  const params=new URLSearchParams();
  Object.entries(values).forEach(([key,value])=>{ if(value!==null&&value!==undefined&&value!=='') params.set(key,String(value)); });
  return params.size ? `?${params}` : '';
}

async function request<T>(path:string,init:RequestInit={},signal?:AbortSignal):Promise<T> {
  let response:Response;
  try {
    response=await fetch(`/api${path}`,{...init,signal,
      headers:typeof init.body==='string'?{'Content-Type':'application/json'}:undefined});
  } catch(error) {
    if(signal?.aborted) throw error;
    throw new Error('Cannot reach the local application. Check that it is running.');
  }
  const body=await response.json().catch(()=>null);
  if(!response.ok) {
    const detail=body?.detail;
    throw new Error(typeof detail==='string'?detail:Array.isArray(detail)?detail.map((d:{msg:string})=>d.msg).join('; '):`Request failed (${response.status})`);
  }
  return body as T;
}

export const api={
  imports:(cursor:string|null=null,signal?:AbortSignal)=>request<Page<ImportJob>>(`/imports${query({cursor})}`,{},signal),
  job:(id:string,cursor:string|null=null,signal?:AbortSignal)=>request<JobDetail>(`/imports/${encodeURIComponent(id)}${query({cursor})}`,{},signal),
  upload:(file:File)=>{ const body=new FormData();body.append('file',file);return request<{job_id:string;status:string}>('/imports',{method:'POST',body}); },
  retry:(id:string)=>request<{job_id:string;status:string}>(`/imports/${encodeURIComponent(id)}/retry`,{method:'POST'}),
  settings:(signal?:AbortSignal)=>request<UserSettings>('/settings',{},signal),
  saveSettings:(settings:Partial<UserSettings>)=>request<UserSettings>('/settings',{method:'PATCH',body:JSON.stringify(settings)}),
  watcher:(signal?:AbortSignal)=>request<Watcher>('/watcher',{},signal),
  rescan:()=>request<{scheduled:boolean}>('/watcher/rescan',{method:'POST'}),
  hands:(filters:{from?:string;to?:string;table_name?:string;cursor?:string|null},signal?:AbortSignal)=>request<Page<HandSummary>>(`/hands${query(filters)}`,{},signal),
  hand:(source:string,id:string,signal?:AbortSignal)=>request<HandDetail>(`/hands/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,{},signal),
  overview:(signal?:AbortSignal)=>request<Overview>('/overview',{},signal),
};

export function message(error:unknown) { return error instanceof Error?error.message:'Something went wrong. Please try again.'; }
