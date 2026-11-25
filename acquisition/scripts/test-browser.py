"""Run actual DOM checks in a disposable Firefox profile, without package installs."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

root = Path(__file__).resolve().parents[1]
firefox = shutil.which('firefox')
if not firefox:
    sys.exit('Firefox is required for the browser tests.')

with tempfile.TemporaryDirectory(prefix='poker-tracker-tests-') as temporary:
    work = Path(temporary)
    profile = work / 'profile'
    profile.mkdir()
    preferences = {
        'browser.dom.window.dump.enabled': True,
        'browser.shell.checkDefaultBrowser': False,
        'browser.startup.homepage_override.mstone': 'ignore',
        'browser.sessionstore.resume_from_crash': False,
        'datareporting.policy.dataSubmissionEnabled': False,
        'toolkit.telemetry.reportingpolicy.firstRun': False,
        'security.fileuri.strict_origin_policy': False,
    }
    (profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(key)}, {json.dumps(value)});' for key, value in preferences.items()))
    popup_path = root / 'extension/popup.html'
    popup_html = popup_path.read_text() if popup_path.exists() else '<p>Popup not implemented</p>'
    html = (root / 'tests/browser.html').read_text().replace('__HAND_SAMPLE__', (root / 'html_samples/hand-sample.html').read_text()).replace('__RUN_IT_TWICE_SAMPLE__', (root / 'html_samples/run-it-twice-sample.html').read_text()).replace('__POPUP_HTML__', popup_html).replace('__ROOT__', root.as_uri())
    page = work / 'browser.html'
    page.write_text(html)
    environment = os.environ.copy()
    environment.update({
        'MOZ_HEADLESS': '1', 'MOZ_DISABLE_CONTENT_SANDBOX': '1',
        'MOZ_DISABLE_RDD_SANDBOX': '1', 'MOZ_DISABLE_GPU_SANDBOX': '1',
        'MOZ_CRASHREPORTER_DISABLE': '1', 'GSETTINGS_BACKEND': 'memory',
    })
    logfile = work / 'firefox.log'
    with logfile.open('w') as log:
        process = subprocess.Popen([firefox, '--headless', '--no-remote', '--profile', str(profile), page.as_uri()], stdout=log, stderr=log, env=environment, start_new_session=True)
        results = None
        deadline = time.monotonic() + 45
        try:
            while time.monotonic() < deadline:
                output = logfile.read_text(errors='replace')
                for line in output.splitlines():
                    if 'POKER_TEST_RESULT:' in line:
                        results = json.loads(line.split('POKER_TEST_RESULT:', 1)[1])
                        break
                if results is not None or process.poll() is not None:
                    break
                time.sleep(0.05)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
    if results is None:
        print(logfile.read_text(errors='replace')[-6000:])
        sys.exit('Firefox did not produce browser test results within 45 seconds.')
    for result in results:
        print(('PASS ' if result['ok'] else 'FAIL ') + result['name'])
        if not result['ok']:
            print(result.get('error', ''))
    failed = sum(not result['ok'] for result in results)
    print(f'Firefox: {len(results) - failed}/{len(results)} passed')
    sys.exit(1 if failed else 0)
