"""Read Termius rows without losing IndexedDB's out-of-line local IDs."""
import math


def record_row(record):
    if not isinstance(record.value, dict):
        return None
    row = dict(record.value)
    for field in ('id', 'local_id'):
        if not isinstance(row.get(field), (int, str)) or isinstance(row.get(field), bool):
            row.pop(field, None)
    if row.get('local_id') is None:
        key = getattr(record.key, 'value', None)
        if isinstance(key, (int, float)) and not isinstance(key, bool) and math.isfinite(key) and key > 0 and int(key) == key:
            row['local_id'] = int(key)
    return row


def read_tables(source, path):
    wrapped = source.ccl.WrappedIndexDB(path)
    available = {db.name for db in wrapped.database_ids}
    tables, counts = {}, {}
    for name in source.WANTED_DATABASES:
        if name not in available:
            continue
        db = wrapped[name]
        stores = list(db.object_store_names)
        if not stores:
            continue
        rows = [row for record in db[stores[0]].iterate_records() if (row := record_row(record)) is not None]
        counts[name] = len(rows)
        tables[name] = source._dedup_latest(rows)
    return source.RawTables(tables=tables, counts_before_dedup=counts)
