#!/usr/bin/env bash
# post-build: يسجّل حجم APK وحجم الملفات الأصلية لكل معمارية (لتقرير أثر محرك الفيديو على الحجم).
set -uo pipefail
APK="${APK_PATH:-android/app/build/outputs/apk/debug/app-debug.apk}"
[ -f "$APK" ] || { echo "⚠️ APK غير موجود: $APK"; exit 0; }
{
  echo "## 📏 حجم APK"
  echo
  echo "- الإجمالي: $(du -h "$APK" | cut -f1) ($(stat -c %s "$APK") بايت)"
  echo
  echo "| المسار داخل APK | الحجم غير المضغوط |"
  echo "|---|---|"
  unzip -l "$APK" 2>/dev/null | awk '$4 ~ /^lib\// { split($4,a,"/"); abi=a[2]; sz[abi]+=$1 } END { for (k in sz) printf "| lib/%s | %.1f MB |\n", k, sz[k]/1048576 }'
  echo
  echo "أكبر 12 ملفاً أصلياً:"
  echo '```'
  unzip -l "$APK" 2>/dev/null | awk '$4 ~ /^lib\// { printf "%10.1f MB  %s\n", $1/1048576, $4 }' | sort -rn | head -12
  echo '```'
} > build_logs/apk_size.md
cat build_logs/apk_size.md
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat build_logs/apk_size.md >> "$GITHUB_STEP_SUMMARY"; fi
