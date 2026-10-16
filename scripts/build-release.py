"""Build separate unpacked-install and Chrome Web Store packages."""
import argparse
import json
from pathlib import Path
import zipfile


def build_packages(root, output):
    root, output = Path(root), Path(output)
    manifest = json.loads((root / 'manifest.json').read_text())
    version = manifest.get('version_name', manifest['version'])
    output.mkdir(parents=True, exist_ok=True)
    files = sorted(path for path in (root / 'src').rglob('*') if path.is_file())
    packages = []
    for webstore in (False, True):
        packaged_manifest = dict(manifest)
        if webstore:
            packaged_manifest.pop('key', None)
        suffix = '-webstore' if webstore else ''
        archive_path = output / f'arc-side-of-the-chrome-v{version}{suffix}.zip'
        with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('manifest.json', json.dumps(packaged_manifest, indent=2, ensure_ascii=False) + '\n')
            for path in files:
                archive.write(path, path.relative_to(root).as_posix())
        with zipfile.ZipFile(archive_path) as archive:
            if archive.testzip() is not None:
                raise ValueError(f'Corrupt package: {archive_path}')
            for icon in packaged_manifest.get('icons', {}).values():
                archive.getinfo(icon)
        packages.append(archive_path)
    return packages


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='.')
    parser.add_argument('--output', default='dist')
    args = parser.parse_args()
    for package in build_packages(args.root, args.output):
        print(f'Built and verified {package}')
