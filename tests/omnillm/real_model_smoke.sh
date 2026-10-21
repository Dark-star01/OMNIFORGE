#!/usr/bin/env bash
# اختبار استدلال حقيقي بنموذج Qwen3-0.6B GGUF فعلي على Linux (يكفي لإثبات صحة المحرك/القالب/الـnon-thinking قبل الجهاز).
# الاستخدام: real_model_smoke.sh /path/Qwen3-0.6B-Q8_0.gguf   — يشغّل host_test كاملاً ثم يولّد Prompt عيّنة ويطبع tokens/sec.
set -euo pipefail
[ -f "${1:-}" ] || { echo "مرّر مسار ملف GGUF الحقيقي"; exit 2; }
"$(dirname "$0")/run.sh" "${LLAMA_DIR:-${WORK:-/tmp/omnillm-test}/llama.cpp}" "$1"
