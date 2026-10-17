#!/usr/bin/env bash
# pre-build: يعمل بعد `cap add android` وتثبيت البلاجنات وقبل `cap sync`/Gradle.
# 1) يرفع minSdkVersion إلى 24 إن كان أقل (متطلب مكتبة youtubedl-android/محرك Python).
set -euo pipefail
python3 - <<'PY'
import re, sys
from pathlib import Path
p = Path('android/variables.gradle')
if not p.is_file():
    print('⚠️ android/variables.gradle غير موجود — تخطي رفع minSdk')
    sys.exit(0)
s = p.read_text(encoding='utf-8')
m = re.search(r'(minSdkVersion\s*=\s*)(\d+)', s)
if not m:
    print('⚠️ لم يُعثر على minSdkVersion في variables.gradle')
    sys.exit(0)
cur = int(m.group(2))
if cur >= 24:
    print('✅ minSdkVersion=%d (كافٍ)' % cur)
else:
    p.write_text(s[:m.start(2)] + '24' + s[m.end(2):], encoding='utf-8')
    print('🔧 تم رفع minSdkVersion من %d إلى 24 (متطلب محرك الفيديو)' % cur)
PY
