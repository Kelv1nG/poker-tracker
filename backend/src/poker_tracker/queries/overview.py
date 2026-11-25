from poker_tracker.storage.database import Database

from .hands import _print_minute


def get_overview(database: Database):
    with database.read_connection() as con:
        count, first, last = con.execute('SELECT count(*),min(started_at_local),max(started_at_local) FROM hands').fetchone()
        sources = con.execute('SELECT count(*) FROM source_files').fetchone()[0]
        attempts, failed, rejected, conflicts, partial = con.execute('''SELECT count(*),
            count(*) FILTER (WHERE status='failed'), coalesce(sum(rejected_count),0),
            coalesce(sum(conflict_count),0),
            count(*) FILTER (WHERE json_extract_string(source_metadata,'$.partial')='true')
            FROM import_jobs''').fetchone()
    return dict(hand_count=count, source_file_count=sources, import_count=attempts,
                failed_import_count=failed, rejected_count=rejected, conflict_count=conflicts,
                partial_import_count=partial, first_observed=_print_minute(first), last_observed=_print_minute(last))
