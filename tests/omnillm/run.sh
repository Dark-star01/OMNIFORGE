#!/usr/bin/env bash
# يبني نواة OmniLlm + llama.cpp (v0.7.0) على Linux ويشغّل: اختبارات C++ (host_test) واختبار JNI عبر JVM.
# الاستخدام: tests/omnillm/run.sh [LLAMA_DIR] [MODEL.gguf]
#   LLAMA_DIR: نسخة محلية من llama.cpp عند الوسم v0.7.0 (الافتراضي: تُجلب بـgit إلى $WORK/llama.cpp)
#   MODEL.gguf: نموذج حقيقي (مثل Qwen3-0.6B-Q8_0.gguf) إن وُجد؛ وإلا يُولَّد نموذج qwen3 صغير بأوزان عشوائية (يختبر الآلية لا الجودة).
# المتغيرات: WORK (الافتراضي /tmp/omnillm-test)، ASAN=1 لتشغيل AddressSanitizer.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd); WORK=${WORK:-/tmp/omnillm-test}; mkdir -p "$WORK"
CPP="$ROOT/plugins/omni-llm/android/src/main/cpp"; REF=$(sed -n 's/^set(OMNILLM_LLAMA_REF "\(.*\)" CACHE.*/\1/p' "$CPP/CMakeLists.txt")
LLAMA=${1:-$WORK/llama.cpp}
if [ ! -d "$LLAMA/include" ]; then git clone --depth 1 --branch "$REF" https://github.com/ggml-org/llama.cpp.git "$LLAMA"; fi
MODEL=${2:-}
if [ -z "$MODEL" ]; then MODEL="$WORK/tiny-random-qwen3.gguf"; [ -f "$MODEL" ] || python3 "$HERE/make_tiny_gguf.py" "$LLAMA" "$MODEL"; echo "⚠️ نموذج عشوائي صغير: يختبر الآلية فقط، ليس Qwen3-0.6B"; fi
B="$WORK/build${ASAN:+-asan}"
cmake -S "$CPP" -B "$B" -DCMAKE_BUILD_TYPE=Release -DOMNILLM_LLAMA_DIR="$LLAMA" -DOMNILLM_HOST_TEST=ON ${ASAN:+-DOMNILLM_ASAN=ON}
cmake --build "$B" -j"$(nproc)" --target omnillm_host_test omnillm
mkdir -p "$WORK/t"; echo "── C++ core ──"; LD_LIBRARY_PATH="$B/bin" "$B/omnillm_host_test" "$MODEL" "$WORK/t"
echo "── JNI عبر JVM ──"; mkdir -p /tmp/claude-0/kt; bash "$ROOT/tests/kt/compile.sh" >/dev/null 2>&1 || true
L=${GRADLE_LIB:-/opt/gradle-8.14.3/lib}; export LC_ALL=C.UTF-8
LD_LIBRARY_PATH="$B/bin" java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8 --add-opens java.base/java.io=ALL-UNNAMED -Djava.library.path="$B" -cp "/tmp/claude-0/kt/out:/tmp/claude-0/kt/jclasses:$L/kotlin-stdlib-2.0.21.jar" com.dark.omnillm.test.OmniLlmJniTestKt "$MODEL" "$WORK/jt" 2>&1 | grep -v "JAVA_TOOL\|graph_compute\|process_ubatch\|llama_decode"
