-- Read-only evidence over normalized imports; archives and canonical identities are untouched.
CREATE VIEW player_hand_analysis AS
WITH pre AS (
 SELECT e.* FROM hand_events e JOIN hand_phases f ON
 e.source_id=f.source_id AND e.hand_id=f.hand_id AND e.phase_ordinal=f.ordinal
 WHERE f.name='Preflop'
), deals AS (
 SELECT DISTINCT source_id,hand_id,player FROM pre WHERE action='Was dealt'
 AND type='action' AND json_array_length(cards)=2
), roster AS (
 SELECT h.source_id,h.hand_id,
 (SELECT count(*) FROM deals d WHERE d.source_id=h.source_id AND d.hand_id=h.hand_id) AS dealt_count,
 (SELECT count(*) FROM hand_phases f WHERE f.source_id=h.source_id AND f.hand_id=h.hand_id AND f.name='Preflop')=1
 AND NOT EXISTS (SELECT 1 FROM hand_events e WHERE e.source_id=h.source_id AND e.hand_id=h.hand_id
 AND e.type='action' AND e.action_code IN ('CALL','RAISE','BET','CHECK','FOLD') AND NOT EXISTS
 (SELECT 1 FROM deals d WHERE d.source_id=e.source_id AND d.hand_id=e.hand_id AND d.player=e.player))
 AND NOT EXISTS (SELECT 1 FROM pre e WHERE e.source_id=h.source_id AND e.hand_id=h.hand_id AND
 ((e.action='Was dealt' AND (json_array_length(e.cards)<>2 OR NOT EXISTS
 (SELECT 1 FROM hand_players p WHERE p.source_id=e.source_id AND p.hand_id=e.hand_id AND p.name=e.player)))
 OR (e.action_code IN ('SMALL_BLIND','BIG_BLIND','CALL','RAISE','BET','CHECK','FOLD') AND NOT EXISTS
 (SELECT 1 FROM deals d WHERE d.source_id=e.source_id AND d.hand_id=e.hand_id AND d.player=e.player)))) AS consistent
 FROM hands h
), blinds AS (
 SELECT source_id,hand_id,
 count(*) FILTER (WHERE action_code='SMALL_BLIND') AS sb_count,
 count(*) FILTER (WHERE action_code='BIG_BLIND') AS bb_count,
 max(player) FILTER (WHERE action_code='SMALL_BLIND') AS sb,
 max(player) FILTER (WHERE action_code='BIG_BLIND') AS bb,
 max(amount) FILTER (WHERE action_code='SMALL_BLIND') AS sb_amount,
 max(amount) FILTER (WHERE action_code='BIG_BLIND') AS bb_amount
 FROM pre GROUP BY source_id,hand_id
), decisions AS (
 SELECT source_id,hand_id,player,min(ordinal) AS first_action
 FROM pre WHERE action_code IN ('CALL','RAISE','BET','CHECK','FOLD') AND type='action'
 GROUP BY source_id,hand_id,player
), ordered AS (
 SELECT d.*,row_number() OVER (PARTITION BY d.source_id,d.hand_id ORDER BY first_action DESC) AS reverse_order
 FROM decisions d JOIN blinds b USING(source_id,hand_id)
 JOIN deals a ON a.source_id=d.source_id AND a.hand_id=d.hand_id AND a.player=d.player
 WHERE d.player NOT IN (b.sb,b.bb)
), orbit AS (
 SELECT b.source_id,b.hand_id,count(o.player) AS acted_nonblinds,max(o.first_action) AS last_nonblind,
 (SELECT min(d.first_action) FROM decisions d WHERE d.source_id=b.source_id AND d.hand_id=b.hand_id AND d.player IN (b.sb,b.bb)) AS first_blind,
 (SELECT min(d.first_action) FROM decisions d WHERE d.source_id=b.source_id AND d.hand_id=b.hand_id AND d.player=b.sb) AS sb_first,
 (SELECT min(d.first_action) FROM decisions d WHERE d.source_id=b.source_id AND d.hand_id=b.hand_id AND d.player=b.bb) AS bb_first,
 (SELECT count(*) FROM decisions d WHERE d.source_id=b.source_id AND d.hand_id=b.hand_id) AS first_decisions,
 (SELECT count(*) FROM pre e WHERE e.source_id=b.source_id AND e.hand_id=b.hand_id AND e.type='action'
 AND e.action_code IN ('CALL','RAISE','BET','CHECK','FOLD') AND e.ordinal<=(
 SELECT max(d.first_action) FROM decisions d WHERE d.source_id=b.source_id AND d.hand_id=b.hand_id)) AS prefix_actions
 FROM blinds b LEFT JOIN ordered o USING(source_id,hand_id) GROUP BY b.source_id,b.hand_id,b.sb,b.bb
), facts AS (
 SELECT h.source_id,h.hand_id,h.table_name,h.started_at_local,p.name AS player,p.ordinal AS player_ordinal,
 p.starting_balance,p.starting_balance_display,p.net_result,p.net_result_display,
 h.currency_code,p.net_currency_symbol AS currency_symbol,
 (SELECT count(*) FROM hand_players x WHERE x.source_id=h.source_id AND x.hand_id=h.hand_id) AS player_count,
 CASE WHEN r.consistent AND r.dealt_count>=2 THEN r.dealt_count END AS dealt_player_count,
 CASE WHEN a.player IS NOT NULL THEN true WHEN r.consistent AND r.dealt_count>=2 THEN false END AS player_dealt,
 CASE WHEN r.consistent AND r.dealt_count=2 THEN 'HU' WHEN r.consistent AND r.dealt_count>2 THEN 'MULTIWAY' ELSE 'UNKNOWN' END AS game_type,
 CASE WHEN b.sb_count=1 THEN b.sb_amount END AS posted_sb,
 CASE WHEN b.bb_count=1 THEN b.bb_amount END AS posted_bb,
 CASE WHEN b.bb_count=1 AND b.bb_amount>0 AND bb.starting_balance>b.bb_amount THEN b.bb_amount END AS nominal_bb,
 CASE WHEN b.sb_count=1 AND b.bb_count=1 AND b.sb<>b.bb AND b.sb_amount>0 AND b.sb_amount<b.bb_amount
 AND sb.starting_balance>b.sb_amount AND bb.starting_balance>b.bb_amount THEN b.sb_amount END AS nominal_sb,
 CASE WHEN b.sb_count=1 AND p.name=b.sb AND a.player IS NOT NULL THEN 'SB'
 WHEN b.bb_count=1 AND p.name=b.bb AND a.player IS NOT NULL THEN 'BB'
 WHEN r.consistent AND r.dealt_count BETWEEN 3 AND 6 AND b.sb_count=1 AND b.bb_count=1 AND b.sb<>b.bb
 AND o.prefix_actions=o.first_decisions AND (o.sb_first IS NULL OR o.bb_first IS NULL OR o.sb_first<o.bb_first)
 AND o.acted_nonblinds=r.dealt_count-2 AND o.last_nonblind<coalesce(o.first_blind,2147483647)
 THEN CASE n.reverse_order WHEN 1 THEN 'BTN' WHEN 2 THEN 'CO' WHEN 3 THEN 'HJ' WHEN 4 THEN 'UTG' ELSE 'UNKNOWN' END
 ELSE 'UNKNOWN' END AS position,
 CASE WHEN a.player IS NULL THEN CASE WHEN r.consistent AND r.dealt_count>=2 THEN 'Not dealt' ELSE 'Unknown' END
 WHEN d.first_action IS NULL THEN 'No decision'
 WHEN NOT r.consistent THEN 'Unknown'
 WHEN (SELECT count(*) FROM pre e WHERE e.source_id=h.source_id AND e.hand_id=h.hand_id AND e.ordinal<d.first_action AND e.action_code='RAISE')>=2 THEN 'Facing re-raise'
 WHEN EXISTS(SELECT 1 FROM pre e WHERE e.source_id=h.source_id AND e.hand_id=h.hand_id AND e.ordinal<d.first_action AND e.action_code='RAISE') THEN 'Facing raise'
 WHEN EXISTS(SELECT 1 FROM pre e WHERE e.source_id=h.source_id AND e.hand_id=h.hand_id AND e.ordinal<d.first_action AND e.action_code='CALL') THEN 'Limped'
 ELSE 'Unopened' END AS preflop_spot
 FROM hands h JOIN hand_players p USING(source_id,hand_id)
 JOIN roster r USING(source_id,hand_id)
 LEFT JOIN blinds b USING(source_id,hand_id)
 LEFT JOIN deals a ON a.source_id=h.source_id AND a.hand_id=h.hand_id AND a.player=p.name
 LEFT JOIN decisions d ON d.source_id=h.source_id AND d.hand_id=h.hand_id AND d.player=p.name
 LEFT JOIN ordered n ON n.source_id=h.source_id AND n.hand_id=h.hand_id AND n.player=p.name
 LEFT JOIN orbit o ON o.source_id=h.source_id AND o.hand_id=h.hand_id
 LEFT JOIN hand_players sb ON sb.source_id=h.source_id AND sb.hand_id=h.hand_id AND sb.name=b.sb
 LEFT JOIN hand_players bb ON bb.source_id=h.source_id AND bb.hand_id=h.hand_id AND bb.name=b.bb
)
SELECT *,CASE WHEN position IN ('SB','BB') THEN 'Ordinary blind post'
 WHEN position<>'UNKNOWN' THEN 'Inferred from complete dealt-player first betting orbit'
 ELSE 'Insufficient or inconsistent deal, blind or first-orbit evidence' END AS position_evidence
FROM facts;
