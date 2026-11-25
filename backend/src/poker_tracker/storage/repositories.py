from poker_tracker.json_codec import decode_json, encode_json

from poker_tracker.ingestion.jobs import Counts, ImportJob


def encode(value):
    return encode_json(value)


class Repository:
    @staticmethod
    def get_job(con, job_id: str) -> ImportJob:
        cursor = con.execute('SELECT * FROM import_jobs WHERE job_id=?', [job_id])
        row = cursor.fetchone()
        if row is None:
            raise KeyError(job_id)
        data = dict(zip([d[0] for d in cursor.description], row))
        counts = Counts(*(data.pop(f'{key}_count') for key in ('new', 'duplicate', 'rejected', 'conflict')))
        metadata = data.pop('source_metadata')
        return ImportJob(**data, counts=counts, source_metadata=decode_json(metadata) if metadata else None)

    @staticmethod
    def remember_watch_receipt(con, receipt):
        row = con.execute("SELECT value FROM app_settings WHERE key='watcher_seen'").fetchone()
        seen = decode_json(row[0]) if row else {}
        seen[receipt.path] = list(receipt.signature)
        con.execute("INSERT OR REPLACE INTO app_settings VALUES ('watcher_seen', ?)", [encode(seen)])

    @staticmethod
    def insert_hand(con, hand):
        identity = [hand.source_id, hand.hand_id]
        con.execute('INSERT INTO hands VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            *identity, hand.payload_hash, encode(hand.payload), hand.table_name,
            hand.started_at_local, hand.time_precision, hand.source_timezone,
            hand.started_at_utc, hand.currency_code, encode(hand.quality_flags)])
        con.executemany('INSERT INTO hand_players VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            [*identity, i, p.name, p.starting_balance.value, p.starting_balance.display,
             p.starting_balance.symbol, p.net_result.value, p.net_result.display,
             p.net_result.symbol, encode(p.final_hand)] for i, p in enumerate(hand.players)])
        con.executemany('INSERT INTO hand_phases VALUES (?, ?, ?, ?, ?, ?)', [
            [*identity, i, p.name, encode(p.board), encode(p.new_cards)] for i, p in enumerate(hand.phases)])
        events = [[*identity, i, j, e.type, e.player, e.action or '', e.action_code,
                   e.amount.value, e.amount.display, e.amount.symbol, encode(e.cards)]
                  for i, p in enumerate(hand.phases) for j, e in enumerate(p.events)]
        if events:
            con.executemany('INSERT INTO hand_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', events)

    @staticmethod
    def finish_job(con, job_id: str, counts: Counts, metadata: dict):
        con.execute('''UPDATE import_jobs SET status=?, new_count=?, duplicate_count=?,
            rejected_count=?, conflict_count=?, source_metadata=?, finished_at=current_timestamp,
            error=NULL WHERE job_id=?''', [
                'completed_with_errors' if counts.rejected else 'completed', counts.new,
                counts.duplicate, counts.rejected, counts.conflict, encode(metadata), job_id])
