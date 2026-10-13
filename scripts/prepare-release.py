"""Prepare a release from the exact main commit that passed CI."""
import json
import os
from pathlib import Path
import re
import subprocess


def command(*args, check=True):
    return subprocess.run(args, text=True, capture_output=True, check=check)


def github_json(path):
    result = command('gh', 'api', path, check=False)
    if result.returncode:
        if 'HTTP 404' in result.stderr:
            return None
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)


def next_patch(version):
    parts = version.split('.')
    if not 3 <= len(parts) <= 4 or any(not part.isdigit() for part in parts):
        raise ValueError(f'Unsupported automatic version: {version}')
    parts[-1] = str(int(parts[-1]) + 1)
    if int(parts[-1]) > 65535:
        raise ValueError('Version component exceeds Chrome limit; choose the next version manually')
    return '.'.join(parts)


def remote_main():
    return command('git', 'ls-remote', 'origin', 'refs/heads/main').stdout.split()[0]


def prepare_release(repository, source_sha, output_path):
    def output(**values):
        with Path(output_path).open('a') as file:
            for key, value in values.items():
                file.write(f'{key}={value}\n')

    # A newer main commit gets its own checks and release. Never publish stale
    # source, or push a version commit over somebody else's new work.
    if remote_main() != source_sha:
        print('A newer main commit is awaiting checks; skipping this older run.')
        output(publish='false')
        return

    manifest_path = Path('manifest.json')
    manifest = json.loads(manifest_path.read_text())
    version = manifest.get('version_name', manifest['version'])
    if not re.fullmatch(r'\d+(?:\.\d+){2,3}(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?', version):
        raise ValueError(f'Invalid release version: {version}')
    tag = f'v{version}'
    existing = github_json(f'repos/{repository}/releases/tags/{tag}')
    if existing:
        if existing.get('draft'):
            raise RuntimeError(f'{tag} is a draft release; publish or remove it before automatic releases')
        changed = command('git', 'diff', '--quiet', tag, source_sha, '--', 'manifest.json', 'src', check=False)
        if changed.returncode == 0:
            print('Extension package is unchanged; no new release needed.')
            output(publish='false')
            return
        if changed.returncode != 1:
            raise RuntimeError(changed.stderr.strip())
        version = next_patch(manifest['version'])
        manifest['version'] = manifest['version_name'] = version
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
        tag = f'v{version}'
        if github_json(f'repos/{repository}/releases/tags/{tag}'):
            raise RuntimeError(f'Next version {tag} is already released; choose a newer version manually')

    notes_path = Path('RELEASE_NOTES.md')
    notes = notes_path.read_text() if notes_path.exists() else ''
    header = f'## Arc Side of the Chrome {version}'
    if not notes.startswith(header + '\n'):
        previous = github_json(f'repos/{repository}/releases/latest')
        previous_tag = previous['tag_name'] if previous else None
        compared = github_json(f'repos/{repository}/compare/{previous_tag}...{source_sha}') if previous_tag else None
        messages = list(dict.fromkeys(commit['commit']['message'].splitlines()[0]
                                      for commit in (compared or {}).get('commits', [])))
        changes = '\n'.join(f'- {message}' for message in messages) or '- Updated extension.'
        notes = (f'{header}\n\n*Spaces, tabs & a little harmony.*\n\n{changes}\n\n'
                 f'Download `arc-side-of-the-chrome-{tag}.zip`, replace the files in your existing extension folder '
                 'and click **Reload** at `chrome://extensions`. Your saved organization and preferences are retained.\n')
        if previous_tag:
            notes += f'\n[Full changelog](https://github.com/{repository}/compare/{previous_tag}...{tag})\n'
        notes_path.write_text(notes)

    dirty = command('git', 'status', '--porcelain', '--', 'manifest.json', 'RELEASE_NOTES.md').stdout
    if dirty:
        command('git', 'add', 'manifest.json', 'RELEASE_NOTES.md')
        command('git', '-c', 'user.name=github-actions[bot]',
                '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
                'commit', '-m', f'Release {version}')
        pushed = command('git', 'push', 'origin', 'HEAD:main', check=False)
        if pushed.returncode:
            if remote_main() != source_sha:
                print('Main changed during release preparation; its new checks will publish the next release.')
                output(publish='false')
                return
            raise RuntimeError(pushed.stderr.strip())

    release_sha = command('git', 'rev-parse', 'HEAD').stdout.strip()
    output(publish='true', tag=tag, sha=release_sha)
    print(f'Prepared {tag} from {release_sha}; extension source matches the checked commit.')


if __name__ == '__main__':
    prepare_release(os.environ['GITHUB_REPOSITORY'], os.environ['ARC_SOURCE_SHA'], os.environ['GITHUB_OUTPUT'])
