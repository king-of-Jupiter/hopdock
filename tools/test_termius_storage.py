import unittest
from types import SimpleNamespace
from termius_storage import record_row
from termius_normalizer import _index, _effective_auth, apply_identity_links


class StorageTests(unittest.TestCase):
    def row(self, key, value):
        return record_row(SimpleNamespace(key=SimpleNamespace(value=key), value=value))

    def test_out_of_line_ids_restore_credentials(self):
        config = self.row(31.0, {'identity': {'local_id': 367}})
        identity = self.row(367.0, {'username': 'tester', 'password': ' password with spaces '})
        auth = _effective_auth({'ssh_config': {'local_id': 31}}, [], _index([config]), _index([identity]), {})
        self.assertEqual(auth['username'], 'tester')
        self.assertEqual(auth['password'], ' password with spaces ')

    def test_inline_id_is_preserved_and_bad_keys_are_ignored(self):
        self.assertEqual(self.row(31, {'local_id': 9})['local_id'], 9)
        for key in [True, -1, 0, 1.5, float('nan'), 'secret', None]:
            self.assertNotIn('local_id', self.row(key, {}))
        self.assertIsNone(self.row(31, 'not a row'))

    def test_join_table_restores_auth_and_preserves_inline_identity(self):
        data = {'ssh_configs': [{'local_id': 31, 'identity': None}],
                'ssh_identities': [{'local_id': 364, 'username': 'tester', 'password': ' intact '}],
                'ssh_config_identities': [{'ssh_config': {'local_id': 31}, 'identity': {'local_id': 364}}]}
        apply_identity_links(data)
        auth = _effective_auth({'ssh_config': {'local_id': 31}}, [], _index(data['ssh_configs']), _index(data['ssh_identities']), {})
        self.assertEqual(auth['password'], ' intact ')
        data['ssh_identities'].append({'local_id': 999, 'username': 'other'})
        data['ssh_configs'][0]['identity'] = {'local_id': 999}
        apply_identity_links(data)
        self.assertEqual(data['ssh_configs'][0]['identity'], {'local_id': 999})


if __name__ == '__main__':
    unittest.main()
