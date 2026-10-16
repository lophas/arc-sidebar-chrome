import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release_prepare', Path(__file__).resolve().parents[1] / 'scripts/prepare-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


package_spec = importlib.util.spec_from_file_location('release_build', Path(__file__).resolve().parents[1] / 'scripts/build-release.py')
package = importlib.util.module_from_spec(package_spec)
package_spec.loader.exec_module(package)


class ReleasePackageTests(unittest.TestCase):
    def test_store_package_removes_only_development_key_and_keeps_all_extension_files(self):
        root = Path(__file__).resolve().parents[1]
        original = (root / 'manifest.json').read_bytes()
        with tempfile.TemporaryDirectory() as output:
            regular, store = package.build_packages(root, output)
            with zipfile.ZipFile(regular) as a, zipfile.ZipFile(store) as b:
                expected = {'manifest.json'} | {p.relative_to(root).as_posix() for p in (root / 'src').rglob('*') if p.is_file()}
                self.assertEqual(set(a.namelist()), expected)
                self.assertEqual(set(b.namelist()), expected)
                local_manifest = json.loads(a.read('manifest.json'))
                store_manifest = json.loads(b.read('manifest.json'))
                self.assertTrue(local_manifest['key'])
                self.assertNotIn('key', store_manifest)
                del local_manifest['key']
                self.assertEqual(local_manifest, store_manifest)
                for path in expected - {'manifest.json'}:
                    self.assertEqual(a.read(path), b.read(path))
        self.assertEqual((root / 'manifest.json').read_bytes(), original)


class AutomaticReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.previous_directory = Path.cwd()
        self.git('init', '--bare', str(self.root / 'origin'))
        self.git('clone', str(self.root / 'origin'), str(self.root / 'work'))
        os.chdir(self.root / 'work')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.test')
        self.git('checkout', '-b', 'main')
        Path('src').mkdir()
        Path('src/extension.js').write_text('original source\n')
        self.write_version('3.1.3')
        self.commit('Initial release')
        self.git('tag', 'v3.1.3')
        self.git('push', 'origin', 'main', '--tags')
        self.output = self.root / 'outputs'

    def tearDown(self):
        os.chdir(self.previous_directory)
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.run(['git', *args], text=True, capture_output=True, check=True).stdout.strip()

    def write_version(self, version):
        Path('manifest.json').write_text(json.dumps({'version': version, 'version_name': version}))
        Path('RELEASE_NOTES.md').write_text(f'## Arc Side of the Chrome {version}\n\nHand-written release notes.\n')

    def commit(self, message):
        self.git('add', '.')
        self.git('commit', '-m', message)
        return self.git('rev-parse', 'HEAD')

    def github(self, path):
        if path.endswith('/releases/tags/v3.1.3') or path.endswith('/releases/latest'):
            return {'tag_name': 'v3.1.3', 'draft': False}
        if '/releases/tags/' in path:
            return None
        if '/compare/' in path:
            return {'commits': [{'commit': {'message': 'Improve sidebar behavior\n\nDetails'}}]}
        self.fail(f'Unexpected API path: {path}')

    def prepare(self, source):
        with patch.object(release, 'github_json', side_effect=self.github):
            release.prepare_release('owner/repo', source, self.output)
        return dict(line.split('=', 1) for line in self.output.read_text().splitlines())

    def test_existing_release_code_change_bumps_patch_pushes_notes_and_keeps_checked_source(self):
        Path('src/extension.js').write_text('updated, tested source\n')
        source = self.commit('Improve sidebar behavior')
        self.git('push', 'origin', 'main')
        result = self.prepare(source)
        self.assertEqual(result['publish'], 'true')
        self.assertEqual(result['tag'], 'v3.1.4')
        self.assertEqual(json.loads(Path('manifest.json').read_text())['version'], '3.1.4')
        self.assertEqual(self.git('rev-parse', 'HEAD^'), source)
        self.assertEqual(self.git('diff', source, 'HEAD', '--', 'src'), '')
        self.assertEqual(release.remote_main(), result['sha'])
        self.assertIn('- Improve sidebar behavior', Path('RELEASE_NOTES.md').read_text())

    def test_explicit_new_version_keeps_hand_written_notes_and_tested_sha(self):
        self.write_version('3.1.4')
        source = self.commit('Release 3.1.4')
        self.git('push', 'origin', 'main')
        result = self.prepare(source)
        self.assertEqual(result, {'publish': 'true', 'tag': 'v3.1.4', 'sha': source})
        self.assertIn('Hand-written release notes.', Path('RELEASE_NOTES.md').read_text())

    def test_documentation_only_changes_do_not_republish_unchanged_extension(self):
        Path('README.md').write_text('Documentation change\n')
        source = self.commit('Update documentation')
        self.git('push', 'origin', 'main')
        self.assertEqual(self.prepare(source), {'publish': 'false'})
        self.assertEqual(self.git('rev-parse', 'HEAD'), source)

    def test_completed_checks_for_old_main_cannot_publish_or_overwrite_new_main(self):
        old = self.git('rev-parse', 'HEAD')
        Path('src/extension.js').write_text('new source awaiting checks\n')
        new = self.commit('New main commit')
        self.git('push', 'origin', 'main')
        self.assertEqual(self.prepare(old), {'publish': 'false'})
        self.assertEqual(release.remote_main(), new)

    def test_version_increment_and_chrome_component_limit(self):
        self.assertEqual(release.next_patch('3.1.3'), '3.1.4')
        self.assertEqual(release.next_patch('3.1.3.1'), '3.1.3.2')
        with self.assertRaises(ValueError):
            release.next_patch('3.1.65535')
        with self.assertRaises(ValueError):
            release.next_patch('3.1.3-beta')

    def test_api_errors_fail_instead_of_being_mistaken_for_missing_releases(self):
        with patch.object(release, 'command', return_value=subprocess.CompletedProcess([], 1, '', 'Forbidden (HTTP 403)')):
            with self.assertRaises(RuntimeError):
                release.github_json('repos/owner/repo/releases/latest')
        with patch.object(release, 'command', return_value=subprocess.CompletedProcess([], 1, '', 'Not Found (HTTP 404)')):
            self.assertIsNone(release.github_json('repos/owner/repo/releases/tags/v3.1.4'))


if __name__ == '__main__':
    unittest.main()
