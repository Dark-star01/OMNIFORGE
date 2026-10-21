# omni-llm

بلاجن Capacitor لـOMNIFORGE: يشغّل نماذج **GGUF** محلياً عبر llama.cpp (مثبّت على `v0.7.0`) لأداة Prompt Forge. لا إنترنت وقت التشغيل ولا نموذج داخل APK.
التفاصيل الكاملة (العقد، المعمارية، ABI، الاختبار، إضافة نموذج، الحدود): `docs/PROMPT_FORGE.md`.

- `android/src/main/cpp/` — `omnillm_core.cpp` (المحرك)، `omnillm_jni.cpp`، `CMakeLists.txt`، `host_test.cpp`
- `android/src/main/java/com/dark/omnillm/` — `OmniLlmPlugin.kt`، `OmniLlmNative.kt`
- ABI: `arm64-v8a` (افتراضي). لإضافة المحاكي: `-PomniLlmAbis=arm64-v8a,x86_64`
- اختبار: `tests/omnillm/run.sh`
