import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('staging_compose', Path(__file__).with_name('staging-campaign-compose.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
TAG = 'hollowgate-staging-campaign-pin:20261121'


def fixture():
    before = {
        'environment': {'PATH': '/usr/bin', 'PGDATABASE': 'hollowgate_auth_test',
                        'AUTH_OAUTH_ENABLED': 'true', 'GOOGLE_OAUTH_CLIENT_ID': 'qa-client'},
        'imageEnvironment': {'PATH': '/usr/bin'}, 'imageId': 'sha256:fixture',
        'user': '1001:1001', 'readOnly': True,
        'networks': ['hollowgate-auth-staging_default', 'hollowgate-db'],
        'secretMounts': {'/run/secrets/staging_google_oauth_secret': '/opt/hollowgate/config/staging_google_oauth_secret'},
    }
    config = {
        'name': 'hollowgate-auth-staging',
        'services': {'aruba-auth-staging': {
            'image': TAG, 'user': '1001:1001', 'read_only': True,
            'environment': {key: value for key, value in before['environment'].items() if key != 'PATH'},
            'networks': {'default': {}, 'hollowgate-db': {}},
            'secrets': [{'source': 'staging_google_oauth_secret', 'target': '/run/secrets/staging_google_oauth_secret'}],
        }},
        'networks': {'default': {'name': 'hollowgate-auth-staging_default'}, 'hollowgate-db': {'name': 'hollowgate-db'}},
        'secrets': {'staging_google_oauth_secret': {'file': '/opt/hollowgate/config/staging_google_oauth_secret'}},
    }
    return before, config


class ComposeSafetyTests(unittest.TestCase):
    def test_only_the_five_flags_can_change(self):
        before, config = fixture()
        config['services']['aruba-auth-staging']['environment'].update(dict.fromkeys(module.FLAGS, 'true'))
        module.validate(before, config, 'on', TAG)

    def test_rollback_restores_unset_not_fake_true_or_false(self):
        before, config = fixture()
        config['services']['aruba-auth-staging']['environment'].update(dict.fromkeys(module.FLAGS, None))
        module.validate(before, config, 'off', TAG)
        config['services']['aruba-auth-staging']['environment'][module.FLAGS[0]] = 'false'
        with self.assertRaises(ValueError):
            module.validate(before, config, 'off', TAG)

    def test_changed_oauth_id_origin_or_database_blocks_before_sql(self):
        for key in ('GOOGLE_OAUTH_CLIENT_ID', 'PGDATABASE', 'AUTH_ORIGIN'):
            before, config = fixture()
            config['services']['aruba-auth-staging']['environment'][key] = 'unexpected'
            with self.subTest(key=key), self.assertRaises(ValueError):
                module.validate(before, config, 'off', TAG)

    def test_network_mount_image_and_user_changes_are_rejected(self):
        mutations = (
            lambda c: c['networks']['default'].update(name='wrong-network'),
            lambda c: c['secrets']['staging_google_oauth_secret'].update(file='/production/secret'),
            lambda c: c['services']['aruba-auth-staging'].update(image='wrong-image'),
            lambda c: c['services']['aruba-auth-staging'].update(user='0:0'),
            lambda c: c['services']['aruba-auth-staging'].update(read_only=False),
            lambda c: c['services']['aruba-auth-staging'].update(privileged=True),
        )
        for mutation in mutations:
            before, config = fixture()
            mutation(config)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                module.validate(before, config, 'off', TAG)

    def test_relative_secret_target_is_normalized(self):
        before, config = fixture()
        config['services']['aruba-auth-staging']['secrets'][0]['target'] = 'staging_google_oauth_secret'
        module.validate(before, config, 'off', TAG)

    def test_no_additional_services_or_foreign_project(self):
        before, config = fixture()
        altered = copy.deepcopy(config)
        altered['services']['caddy'] = {'image': 'not-allowed'}
        with self.assertRaises(ValueError):
            module.validate(before, altered, 'off', TAG)
        altered = copy.deepcopy(config)
        altered['name'] = 'hollowgate-production-private'
        with self.assertRaises(ValueError):
            module.validate(before, altered, 'off', TAG)


if __name__ == '__main__':
    unittest.main()
