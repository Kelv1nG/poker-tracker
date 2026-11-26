import { api } from '../../api/client';
import { usePoll } from '../../api/usePoll';

export function OverviewPage() {
  const {data,error,reload}=usePoll(signal=>api.overview(signal));
  return <>
    <div className="page-heading"><div><h1>Overview</h1><p className="muted">Your local hand library at a glance.</p></div></div>
    {error&&<p role="alert" className="error">{error} <button onClick={reload}>Try again</button></p>}
    {!data&&!error&&<p role="status">Loading overview…</p>}
    {data&&<>
      <div className="summary-grid">{[['Hands',data.hand_count],['Source files',data.source_file_count],['Import attempts',data.import_count],['Rejected records',data.rejected_count]].map(([label,value])=><div className="panel summary" key={label} role="group" aria-label={String(label)}><span className="muted">{label}</span><strong>{Number(value).toLocaleString()}</strong></div>)}</div>
      <section className="panel"><h2>Observed play</h2>
        {data.first_observed?<dl className="observed"><div><dt>First hand</dt><dd>{data.first_observed.replace('T',' ')}</dd></div><div><dt>Latest hand</dt><dd>{data.last_observed?.replace('T',' ')}</dd></div></dl>:<p className="muted overview-empty">No hands imported yet. <a href="#imports">Import a JSON export</a> to begin.</p>}
        <p className="muted small">Times are shown as printed by the source. These are observed hands, not a guarantee of complete date coverage.</p>
      </section>
      <section className="panel"><h2>Import health</h2><dl className="health"><div><dt>Failed imports</dt><dd>{data.failed_import_count.toLocaleString()}</dd></div><div><dt>Conflicting records</dt><dd>{data.conflict_count.toLocaleString()}</dd></div><div><dt>Partial exports</dt><dd>{data.partial_import_count.toLocaleString()}</dd></div></dl>
        <p className="muted small">Counts describe import attempts. Conflicts are included in rejected records; a rejected record can appear again on retry.</p><a className="overview-link" href="#imports">Review import history</a>
      </section>
    </>}
  </>;
}
