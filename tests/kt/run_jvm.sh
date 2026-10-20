#!/usr/bin/env bash
# يجمّع ويشغّل اختبارات JVM للمنطق الأصلي النقي (تنزيل مستأنَف، TCP/DNS، محاذاة ZIP…)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); L=${GRADLE_LIB:-/opt/gradle-8.14.3/lib}
"$HERE/compile.sh" >/tmp/claude-0/kt/compile.log 2>&1 || true
if grep -q "error:" /tmp/claude-0/kt/compile.log; then grep "error" /tmp/claude-0/kt/compile.log | head -20; exit 1; fi
java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -cp "/tmp/claude-0/kt/out:/tmp/claude-0/kt/jclasses:$L/kotlin-stdlib-2.0.21.jar" com.dark.omninative.test.JvmTestsKt 2>&1 | grep -v JAVA_TOOL
