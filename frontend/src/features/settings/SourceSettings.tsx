import { useEffect, useState } from 'react';
import { api, message } from '../../api/client';
import type { UserSettings } from '../../api/contracts';

export function SourceSettings({settings,onSaved}:{settings:UserSettings;onSaved:()=>void}) {
  const [hero,setHero]=useState(settings.hero_name??'');
  const [zone,setZone]=useState(settings.source_timezone??'');
  const [currency,setCurrency]=useState(settings.currency_code??'');
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState('');
  useEffect(()=>{setHero(settings.hero_name??'');setZone(settings.source_timezone??'');setCurrency(settings.currency_code??'');},[settings.hero_name,settings.source_timezone,settings.currency_code]);
  return <details className="panel source-settings"><summary>Source settings</summary>
    <p className="muted">Optional context for newly imported hands. Existing hands keep their original context.</p>
    <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError(null);setNotice('');
      try {await api.saveSettings({hero_name:hero||null,source_timezone:zone.trim()||null,currency_code:currency.trim()||null});onSaved();setNotice('Source settings saved.');}
      catch(error){setError(message(error));}finally{setBusy(false);}}}>
      <div className="form-grid">
        <label>Hero screen name<input value={hero} onChange={e=>setHero(e.target.value)} placeholder="Exact player name" autoComplete="off" /></label>
        <label>Source timezone<input value={zone} onChange={e=>setZone(e.target.value)} placeholder="e.g. Asia/Manila" autoComplete="off" /></label>
        <label>Currency code<input value={currency} onChange={e=>setCurrency(e.target.value)} placeholder="e.g. PHP" maxLength={3} autoComplete="off" /></label>
      </div>
      <button disabled={busy} type="submit">{busy?'Saving…':'Save source settings'}</button>
      {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="muted">{notice}</p>}
    </form>
  </details>;
}
