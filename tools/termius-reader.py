"""Hopdock's offline Termius reader. Secrets travel over stdout to Electron only."""
import argparse
import contextlib
import io
import json
import os
import pathlib
import shutil
import sys
import tempfile
from types import SimpleNamespace

from termius_export import source
from termius_export.crypto import DecryptionFailed, Decryptor, UnknownCipherVersion, first_ciphertext
from termius_export.datadir import default_data_dir
from termius_export.localkey import LocalKeyNotFound, load_local_key
from termius_export.normalize import build_model
from termius_normalizer import build_bundle, apply_identity_links
from termius_storage import read_tables

COMMIT = 'd1a34e9bbf1dcf63dbcb910cfc24d54460a287d0'
EXTRA = ('snippets', 'scripts', 'snippets_packages', 'snippet_packages', 'snippet_groups', 'snippet_folders', 'ssh_config_identities', 'ssh_config_identities_shared')

def read_bundle(data_dir=None):
    candidates = [data_dir] if data_dir else [os.path.join(os.environ.get('APPDATA', ''), 'Termius') if os.environ.get('APPDATA') else None, default_data_dir()]
    leveldb = None
    for candidate in candidates:
        if not candidate:
            continue
        try:
            leveldb = source.locate_leveldb(candidate)
            break
        except source.IndexedDbNotFound:
            continue
    if leveldb is None:
        raise source.IndexedDbNotFound('TERMIUS_PROFILE_NOT_FOUND')
    # Never open the live database with a writer. Read an encrypted temporary snapshot.
    with tempfile.TemporaryDirectory(prefix='hopdock-termius-') as temporary:
        snapshot = pathlib.Path(temporary) / 'profile'
        shutil.copytree(leveldb, snapshot, ignore=shutil.ignore_patterns('LOCK'))
        source.WANTED_DATABASES = tuple(dict.fromkeys((*source.WANTED_DATABASES, *EXTRA)))
        tables = read_tables(source, snapshot)
        sample = first_ciphertext(tables.tables)
        def valid(key):
            if sample is None:
                return True
            try:
                Decryptor.from_base64(key).field(sample)
                return True
            except (ValueError, DecryptionFailed, UnknownCipherVersion):
                return False
        key, _ = load_local_key(None, valid)
        decryptor = Decryptor.from_base64(key)
        decrypted = {name: [decryptor.walk(row) for row in rows] for name, rows in tables.tables.items()}
        apply_identity_links(decrypted)
        model = build_model(source.RawTables(decrypted, tables.counts_before_dedup), SimpleNamespace(walk=lambda row: row, stats=decryptor.stats), source_info={'leveldb': str(leveldb)})
        return build_bundle(model, decrypted, include_secrets=True, tool_commit=COMMIT)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir')
    parser.add_argument('--summary', action='store_true')
    args = parser.parse_args()
    # Suppress parser/library diagnostics: they must never leak decrypted fields.
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            bundle = read_bundle(args.data_dir)
        if args.summary:
            bundle = {'hosts': len(bundle['hosts']), 'keys': len(bundle['keys']), 'snippets': len(bundle['snippets'])}
        sys.stdout.buffer.write(json.dumps(bundle, ensure_ascii=False).encode('utf-8'))
        return 0
    except source.IndexedDbNotFound:
        code = 'TERMIUS_PROFILE_NOT_FOUND'
    except LocalKeyNotFound:
        code = 'TERMIUS_KEY_UNAVAILABLE'
    except DecryptionFailed:
        code = 'TERMIUS_DECRYPT_FAILED'
    except UnknownCipherVersion:
        code = 'TERMIUS_ENCRYPTION_UNSUPPORTED'
    except (PermissionError, shutil.Error):
        code = 'TERMIUS_PROFILE_LOCKED'
    except Exception:
        code = 'TERMIUS_READ_FAILED'
    sys.stderr.write(json.dumps({'code': code}))
    return 1

if __name__ == '__main__':
    sys.exit(main())
