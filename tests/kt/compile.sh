#!/usr/bin/env bash
# يجمّع ملفات Kotlin للبلاجنات مقابل المجسّمات للتأكد من الصياغة والأنواع. الاستخدام: tests/kt/compile.sh [مجلدات/ملفات إضافية]
set -euo pipefail
L=${GRADLE_LIB:-/opt/gradle-8.14.3/lib}; V=2.0.21; HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
CP=$L/kotlin-compiler-embeddable-$V.jar:$L/kotlin-stdlib-$V.jar:$L/kotlin-script-runtime-$V.jar:$L/kotlin-reflect-$V.jar:$L/kotlin-daemon-embeddable-$V.jar:$(ls $L/kotlinx-coroutines-core-jvm*.jar $L/trove4j*.jar $L/annotations-*.jar 2>/dev/null | tr "\n" ":")
JC=/tmp/claude-0/kt/jclasses; if [ ! -d "$JC" ] || [ -n "$(find "$HERE/jstubs" -newer "$JC" -name '*.java' 2>/dev/null | head -1)" ]; then rm -rf "$JC"; mkdir -p "$JC"; javac -nowarn -d "$JC" $(find "$HERE/jstubs" -name '*.java') 2>&1 | grep -v JAVA_TOOL || true; fi
OUT=${KT_OUT:-/tmp/claude-0/kt/out}; rm -rf "$OUT"; mkdir -p "$OUT"
SRCS=("$HERE/stubs" "$HERE/stubs_extra"); for d in "$ROOT"/plugins/*/android/src/main/java; do SRCS+=("$d"); done
[ -d "$HERE/jvmtest" ] && SRCS+=("$HERE/jvmtest")
java -cp "$CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -language-version 1.9 -api-version 1.9 -cp "$L/kotlin-stdlib-$V.jar:$JC" -d "$OUT" "${SRCS[@]}" "$@" 2>&1 | grep -v "JAVA_TOOL_OPTIONS" || true
