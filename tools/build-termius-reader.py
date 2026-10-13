"""Build a native self-contained reader. Python is required only at build time."""
import os
import pathlib
import shutil
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
venv = root / '.termius-reader-venv'
python = venv / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
if not python.exists():
    subprocess.run([sys.executable, '-m', 'venv', str(venv)], check=True)
subprocess.run([str(python), '-m', 'pip', 'install', '--no-deps', '-r', str(root / 'tools/termius-reader-requirements.txt')], check=True)
subprocess.run([str(python), '-m', 'pip', 'check'], check=True)
output = root / 'apps/desktop/resources/termius-reader'
work = root / '.termius-reader-build'
subprocess.run([str(python), '-m', 'PyInstaller', '--noconfirm', '--onedir', '--console', '--noupx', '--name', 'hopdock-termius-reader', '--distpath', str(output.parent), '--workpath', str(work / 'work'), '--specpath', str(work), '--collect-all', 'ccl_chromium_reader', '--collect-all', 'nacl', '--hidden-import', '_cffi_backend', '--paths', str(root / 'tools'), str(root / 'tools/termius-reader.py')], check=True)
# PyInstaller's named folder is renamed to the stable packaged resource path.
generated = output.parent / 'hopdock-termius-reader'
if output.exists():
    resolved = output.resolve()
    if resolved.parent != (root / 'apps/desktop/resources').resolve():
        raise RuntimeError('Unexpected build target')
    shutil.rmtree(resolved)
generated.rename(output)
for notice in ('termius-export-LICENSE.txt', 'ccl-chromium-reader-LICENSE.txt', 'ccl-simplesnappy-LICENSE.txt'):
    shutil.copyfile(root / 'tools' / notice, output / notice)
