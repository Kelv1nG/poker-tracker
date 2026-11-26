export interface Page<T> { items:T[]; total:number; next_cursor:string|null }
export interface Counts { new:number; duplicate:number; rejected:number; conflict:number }
export type JobStatus = 'queued'|'processing'|'completed'|'completed_with_errors'|'failed';
export interface ImportJob {
  job_id:string; source_hash:string; source_id:string; filename:string;
  trigger:'upload'|'watch'|'retry'; importer_version:number; status:JobStatus; counts:Counts;
  created_at:string; started_at:string|null; finished_at:string|null; error:string|null; retry_of:string|null;
  source_metadata: { partial?:boolean; message?:unknown; [key:string]:unknown }|null;
}
export interface Issue { source_index:number; hand_id:string|null; outcome:'rejected'|'conflict'; reason:string }
export interface Submission { filename:string; trigger:string; submitted_at:string }
export interface JobDetail extends ImportJob { issues:Page<Issue>; submissions:Submission[] }
export interface UserSettings { watch_path:string; watch_enabled:boolean; hero_name:string|null; source_timezone:string|null; currency_code:string|null }
export interface Watcher { enabled:boolean; state:'paused'|'watching'|'error'; watch_path:string; last_scan:number|null; error:string|null }
export type Card = string|null;
export interface Player { name:string; starting_balance:string; net_result:string; final_hand:Card[] }
export type HandEvent = { type:'board'; board:Card[]; new_cards:Card[] } | {
  type:'action'|'system'; player:string|null; action:string; action_code:string|null; amount:string|null; cards:Card[] };
export interface Phase { name:string; board:Card[]; new_cards:Card[]; events:HandEvent[] }
export interface HandPayload { id:string; table_name:string; started_at:string; started_at_display?:string; players:Player[]; phases:Phase[] }
export interface HandIdentity { source_id:string; hand_id:string; table_name:string; started_at_local:string }
export interface HandSummary extends HandIdentity {
  player_count:number; player:string|null; player_dealt:boolean|null; dealt_player_count:number|null;
  game_type:'HU'|'MULTIWAY'|'UNKNOWN'; hole_cards:Card[]; boards:Card[][];
  action_line:{street:string;actions:string[];description:string}[];
  preflop_spot:string|null; position:string|null; position_evidence:string|null;
  net_result:string|null; net_result_display:string|null; starting_balance:string|null; starting_balance_display:string|null;
  posted_sb:string|null; posted_bb:string|null; nominal_sb:string|null; nominal_bb:string|null;
  currency_code:string|null; currency_symbol:string|null;
}
export interface HandFilters {
  from?:string; to?:string; table_name?:string; player?:string; include_not_dealt?:boolean;
  game_type?:string; result?:string; position?:string; action?:string; street?:string;
  net_min?:string; net_max?:string; unit?:string; stake?:string; sort?:string; cursor?:string|null;
}
export interface HandOptions { players:string[]; units:{value:string;label:string}[]; stakes:{value:string;label:string;unit:string}[] }
export interface Provenance { source_hash:string; source_index:number; payload_hash:string; is_conflict:boolean; filenames:string[]; submissions:Submission[] }
export interface HandDetail extends HandIdentity { payload:HandPayload; source_timezone:string|null; started_at_utc:string|null; currency_code:string|null; quality_flags:string[]; provenance:Provenance[] }
export interface Overview { hand_count:number; source_file_count:number; import_count:number; failed_import_count:number; rejected_count:number; conflict_count:number; partial_import_count:number; first_observed:string|null; last_observed:string|null }
