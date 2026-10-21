// جسر JNI رفيع فوق omnillm_core. كل النصوص تعبر كـbyte[] بترميز UTF-8 قياسي (وليس "modified UTF-8" الخاص بـNewStringUTF
// الذي يفسد الإيموجي و\0)، والنتائج JSON. لا استثناء C++ يخرج من هنا.
#include <jni.h>

#include <cstdio>
#include <string>
#include <vector>

#include "omnillm_core.h"

namespace {

std::string from_bytes(JNIEnv* env, jbyteArray a) {
    if (!a) return std::string();
    jsize n = env->GetArrayLength(a);
    std::string s((size_t)n, '\0');
    if (n > 0) env->GetByteArrayRegion(a, 0, n, reinterpret_cast<jbyte*>(&s[0]));
    return s;
}

jbyteArray to_bytes(JNIEnv* env, const std::string& s) {
    jbyteArray a = env->NewByteArray((jsize)s.size());
    if (a && !s.empty()) env->SetByteArrayRegion(a, 0, (jsize)s.size(), reinterpret_cast<const jbyte*>(s.data()));
    return a;
}

// يستبدل أي تسلسل UTF-8 غير صالح بـU+FFFD كي يبقى JSON وUTF-8 سليمين دائماً
std::string sanitize_utf8(const std::string& in) {
    std::string out; out.reserve(in.size());
    size_t i = 0, n = in.size();
    while (i < n) {
        unsigned char c = (unsigned char)in[i];
        size_t len = c < 0x80 ? 1 : (c >= 0xC2 && c <= 0xDF) ? 2 : (c >= 0xE0 && c <= 0xEF) ? 3 : (c >= 0xF0 && c <= 0xF4) ? 4 : 0;
        bool ok = len > 0 && i + len <= n;
        for (size_t k = 1; ok && k < len; k++) if (((unsigned char)in[i + k] & 0xC0) != 0x80) ok = false;
        if (ok && len == 3) { unsigned char c1 = (unsigned char)in[i + 1]; if ((c == 0xE0 && c1 < 0xA0) || (c == 0xED && c1 > 0x9F)) ok = false; }
        if (ok && len == 4) { unsigned char c1 = (unsigned char)in[i + 1]; if ((c == 0xF0 && c1 < 0x90) || (c == 0xF4 && c1 > 0x8F)) ok = false; }
        if (ok) { out.append(in, i, len); i += len; } else { out += "\xEF\xBF\xBD"; i++; }
    }
    return out;
}

std::string esc(const std::string& raw) {
    std::string s = sanitize_utf8(raw), o; o.reserve(s.size() + 8);
    for (unsigned char c : s) {
        switch (c) {
            case '"': o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n"; break;
            case '\r': o += "\\r"; break;
            case '\t': o += "\\t"; break;
            default:
                if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; } else o += (char)c;
        }
    }
    return o;
}

std::string q(const std::string& s) { return "\"" + esc(s) + "\""; }
std::string num(double v) { char b[48]; snprintf(b, sizeof b, "%.3f", v); return b; }
std::string i64(long long v) { return std::to_string(v); }
std::string mem_or_null(long long v) { return v < 0 ? std::string("null") : i64(v); }

std::string fail_json(const omnillm::Result& r) {
    return std::string("{\"ok\":false,\"code\":") + q(r.code) + ",\"message\":" + q(r.message) + "}";
}
std::string fail_json(const char* code, const std::string& m) { omnillm::Result r; r.code = code; r.message = m; return fail_json(r); }

}  // namespace

#define JNI_FN(ret, name) extern "C" JNIEXPORT ret JNICALL Java_com_dark_omnillm_OmniLlmNative_##name

JNI_FN(jbyteArray, nativeInit)(JNIEnv* env, jobject, jbyteArray libDir) {
    try {
        omnillm::init(from_bytes(env, libDir));
        return to_bytes(env, "{\"ok\":true,\"runtime\":" + q("llama.cpp " + omnillm::version()) + ",\"system\":" + q(omnillm::system_info()) + "}");
    } catch (const std::exception& e) { return to_bytes(env, fail_json("UNAVAILABLE", e.what())); }
    catch (...) { return to_bytes(env, fail_json("UNAVAILABLE", "native init failed")); }
}

JNI_FN(jbyteArray, nativeLoad)(JNIEnv* env, jobject, jbyteArray path, jint nCtx, jint nThreads, jlong availMem) {
    try {
        omnillm::LoadOpts o; o.path = from_bytes(env, path); o.n_ctx = nCtx; o.n_threads = nThreads; o.avail_mem = availMem;
        omnillm::LoadInfo li; omnillm::Result r = omnillm::load(o, li);
        if (!r.ok) return to_bytes(env, fail_json(r));
        std::string j = "{\"ok\":true,\"ctx\":" + std::to_string(li.n_ctx) + ",\"ctxRequested\":" + std::to_string(li.n_ctx_requested) + ",\"ctxTrain\":" + std::to_string(li.n_ctx_train) +
            ",\"ctxReduced\":" + (li.ctx_reduced ? "true" : "false") + ",\"threads\":" + std::to_string(li.n_threads) + ",\"modelSize\":" + i64(li.model_size) + ",\"fileSize\":" + i64(li.file_size) +
            ",\"params\":" + i64(li.n_params) + ",\"kvEstimate\":" + i64(li.kv_estimate) + ",\"arch\":" + q(li.arch) + ",\"desc\":" + q(li.desc);
        if (!li.name.empty()) j += ",\"name\":" + q(li.name);
        return to_bytes(env, j + "}");
    } catch (const std::exception& e) { return to_bytes(env, fail_json("LOAD_FAILED", e.what())); }
    catch (...) { return to_bytes(env, fail_json("LOAD_FAILED", "native error")); }
}

JNI_FN(jbyteArray, nativeUnload)(JNIEnv* env, jobject) {
    try { omnillm::Result r = omnillm::unload(); return to_bytes(env, r.ok ? std::string("{\"ok\":true}") : fail_json(r)); }
    catch (...) { return to_bytes(env, fail_json("GENERATE_FAILED", "unload failed")); }
}

JNI_FN(void, nativeCancel)(JNIEnv*, jobject) { omnillm::cancel(); }

JNI_FN(jbyteArray, nativeTokenize)(JNIEnv* env, jobject, jbyteArray text, jboolean special) {
    try {
        int32_t n = 0; omnillm::Result r = omnillm::tokenize(from_bytes(env, text), special == JNI_TRUE, n);
        return to_bytes(env, r.ok ? "{\"ok\":true,\"count\":" + std::to_string(n) + "}" : fail_json(r));
    } catch (...) { return to_bytes(env, fail_json("GENERATE_FAILED", "tokenize failed")); }
}

JNI_FN(jbyteArray, nativeGenerate)(JNIEnv* env, jobject, jbyteArray system, jbyteArray user, jbyteArray tmpl, jbyteArray prefix, jint maxTokens, jfloat temperature, jint topK, jfloat topP, jfloat minP, jfloat repeatPenalty, jlong seed) {
    try {
        omnillm::GenOpts o; o.system = from_bytes(env, system); o.user = from_bytes(env, user); o.tmpl = from_bytes(env, tmpl); if (o.tmpl.empty()) o.tmpl = "chatml";
        o.assistant_prefix = from_bytes(env, prefix); o.max_tokens = maxTokens; o.temperature = temperature; o.top_k = topK; o.top_p = topP; o.min_p = minP; o.repeat_penalty = repeatPenalty; o.seed = seed;
        omnillm::GenOut g; omnillm::Result r = omnillm::generate(o, g);
        if (!r.ok) return to_bytes(env, fail_json(r));
        double tps = g.gen_ms > 0 && g.generated_tokens > 0 ? g.generated_tokens * 1000.0 / g.gen_ms : 0;   // رموز مُولَّدة ÷ زمن حلقة التوليد (يشمل العيّنة)
        std::string j = "{\"ok\":true,\"text\":" + q(g.text) + ",\"promptTokens\":" + std::to_string(g.prompt_tokens) + ",\"generatedTokens\":" + std::to_string(g.generated_tokens) +
            ",\"cachedTokens\":" + std::to_string(g.cached_tokens) + ",\"truncated\":" + (g.truncated ? "true" : "false") + ",\"ms\":" + num(g.total_ms) + ",\"promptMs\":" + num(g.prompt_ms) +
            ",\"genMs\":" + num(g.gen_ms) + ",\"tokensPerSec\":" + (tps > 0 ? num(tps) : std::string("null")) + "}";
        return to_bytes(env, j);
    } catch (const std::exception& e) { return to_bytes(env, fail_json("GENERATE_FAILED", e.what())); }
    catch (...) { return to_bytes(env, fail_json("GENERATE_FAILED", "native error")); }
}

JNI_FN(jbyteArray, nativeInfo)(JNIEnv* env, jobject) {
    try {
        omnillm::Snapshot s = omnillm::snapshot(); omnillm::MemInfo m = omnillm::mem_info();
        std::string j = std::string("{\"ok\":true,\"loaded\":") + (s.loaded ? "true" : "false") + ",\"busy\":" + (s.busy ? "true" : "false") + ",\"ctx\":" + (s.loaded ? std::to_string(s.n_ctx) : "null") +
            ",\"threads\":" + (s.loaded ? std::to_string(s.n_threads) : "null") + ",\"modelSize\":" + (s.loaded ? i64(s.model_size) : "null") + ",\"fileSize\":" + (s.loaded ? i64(s.file_size) : "null") +
            ",\"memAvailable\":" + mem_or_null(m.avail) + ",\"memTotal\":" + mem_or_null(m.total) + ",\"processRss\":" + mem_or_null(m.rss) + ",\"runtime\":" + q("llama.cpp " + omnillm::version());
        if (s.loaded && !s.name.empty()) j += ",\"name\":" + q(s.name);
        return to_bytes(env, j + "}");
    } catch (...) { return to_bytes(env, fail_json("GENERATE_FAILED", "info failed")); }
}
