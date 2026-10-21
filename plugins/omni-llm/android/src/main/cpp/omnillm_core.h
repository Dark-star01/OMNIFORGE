// OmniLlm core: محرك llama.cpp بلا أي اعتماد على JNI/Android (يُجمَّع على Linux للاختبار وعلى Android للتطبيق).
// كل الدوال تعيد نتيجة (ok/code/message) ولا ترمي استثناءات إلى الخارج.
#pragma once
#include <cstdint>
#include <string>

namespace omnillm {

struct Result {
    bool ok = false;
    std::string code;     // UNAVAILABLE | FILE_NOT_FOUND | INVALID_MODEL | INSUFFICIENT_MEMORY | LOAD_FAILED | NOT_LOADED | CONTEXT_OVERFLOW | CANCELLED | GENERATE_FAILED | INVALID
    std::string message;
};

struct LoadOpts {
    std::string path;          // مسار ملف GGUF (أو /proc/self/fd/N)
    int32_t n_ctx = 2048;      // نافذة السياق المطلوبة (قد تُخفَّض تلقائياً عند ضيق الذاكرة)
    int32_t n_threads = 0;     // 0 = تلقائي
    int64_t avail_mem = 0;     // الذاكرة المتاحة كما يعرفها نظام التشغيل (بايت). 0 = اقرأ /proc/meminfo
};

struct LoadInfo {
    int32_t n_ctx = 0, n_ctx_requested = 0, n_ctx_train = 0, n_threads = 0;
    int64_t model_size = 0;        // حجم الأوزان (llama_model_size)
    int64_t file_size = 0;
    int64_t n_params = 0;
    int64_t kv_estimate = 0;       // تقدير ذاكرة KV (بايت)
    std::string name, desc, arch;
    bool ctx_reduced = false;
};

struct GenOpts {
    std::string system, user, tmpl = "chatml";   // tmpl: chatml | model
    std::string assistant_prefix;                 // نص يُلحق بعد بداية دور المساعد (مثلاً كتلة <think></think> فارغة لتعطيل التفكير)
    int32_t max_tokens = 512;
    float temperature = 0.7f;
    int32_t top_k = 20;
    float top_p = 0.8f, min_p = 0.0f, repeat_penalty = 1.05f;
    int64_t seed = -1;                            // < 0 = عشوائي
};

struct GenOut {
    std::string text;
    int32_t prompt_tokens = 0, generated_tokens = 0, cached_tokens = 0;
    bool truncated = false;
    double prompt_ms = 0, gen_ms = 0, total_ms = 0;
};

struct Snapshot {          // لقطة سريعة بلا قفل العمليات الطويلة
    bool loaded = false, busy = false;
    int32_t n_ctx = 0, n_threads = 0;
    int64_t model_size = 0, file_size = 0;
    std::string name, desc;
};

struct MemInfo { int64_t avail = -1, total = -1, rss = -1; };   // -1 = غير متاح

// عام
void init(const std::string& backend_dir);   // مرة واحدة: سجل الـlog + تحميل backends الديناميكية + llama_backend_init
std::string system_info();
std::string version();
MemInfo mem_info();
Snapshot snapshot();
std::string last_native_error();

// عمليات (تُسلسَل داخلياً؛ استدعِها من خيط واحد أو دعها تنتظر)
Result load(const LoadOpts&, LoadInfo& out);
Result unload();
Result tokenize(const std::string& text, bool special, int32_t& count);
Result generate(const GenOpts&, GenOut& out);
void cancel();                                // آمنة من أي خيط، لا تنتظر العمليات الجارية

// أدوات قابلة للاختبار
std::string build_chatml(const std::string& system, const std::string& user, const std::string& assistant_prefix);
std::string utf8_trim_incomplete(std::string s);
bool is_gguf_file(const std::string& path, std::string& why);

}  // namespace omnillm
