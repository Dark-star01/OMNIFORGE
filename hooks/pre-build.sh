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

# 2) نماذج OCR (Tesseract tessdata_fast: العربية + الإنجليزية ≈ 6MB) → assets_inject/tessdata (تُنسخ إلى assets لاحقاً بخطوة assets_inject).
#    غير حرجة: عند فشل التنزيل أو حجم غير معقول يُكمل البناء بدونها وتعرض أداة OCR رسالة «النماذج غير مضمّنة».
ocr_dir="assets_inject/tessdata"; mkdir -p "$ocr_dir"
fetch_model() { # الاسم، الحد الأدنى للحجم بالبايت
  local n="$1" min="$2" f="$ocr_dir/$1.traineddata"
  if [ -s "$f" ] && [ "$(stat -c %s "$f")" -ge "$min" ]; then echo "✅ نموذج OCR $n موجود"; return 0; fi
  rm -f "$f"
  if curl -fL --retry 3 --retry-delay 2 --max-time 120 -sS -o "$f.part" "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$n.traineddata" \
     && [ "$(stat -c %s "$f.part")" -ge "$min" ]; then mv "$f.part" "$f"; echo "✅ نُزِّل نموذج OCR $n ($(stat -c %s "$f") بايت)"
  else rm -f "$f.part" "$f"; echo "⚠️ تعذّر تنزيل نموذج OCR $n — سيُبنى التطبيق بدونه (أداة OCR ستبلّغ بذلك)"; fi
}
fetch_model eng 3000000 || true
fetch_model ara 1000000 || true
