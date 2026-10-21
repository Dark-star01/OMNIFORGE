// OmniLlm core — انظر omnillm_core.h
#include "omnillm_core.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <new>
#include <random>
#include <thread>
#include <vector>
#include <sys/stat.h>
#include <unistd.h>

#include "ggml-backend.h"
#include "llama.h"

#ifdef __ANDROID__
#include <android/log.h>
#endif

#ifndef OMNILLM_LLAMA_REF
#define OMNILLM_LLAMA_REF "unknown"
#endif

namespace omnillm {
namespace {

using clk = std::chrono::steady_clock;
double ms_since(clk::time_point t) { return std::chrono::duration<double, std::milli>(clk::now() - t).count(); }

// ───────── الحالة العامة ─────────
std::mutex g_op;          // يُسلسل load/unload/tokenize/generate
std::mutex g_state;       // يحمي اللقطة السريعة والنص الأخير للخطأ
std::atomic<bool> g_cancel{false};
std::atomic<bool> g_busy{false};
std::once_flag g_init_once;
std::vector<std::string> g_errors;   // أسطر ERROR من llama.cpp منذ آخر تصفير (الأول عادةً هو السبب الجذري)
bool g_verbose = false;

llama_model* g_model = nullptr;
llama_context* g_ctx = nullptr;
const llama_vocab* g_vocab = nullptr;
std::vector<llama_token> g_cache;   // محتوى KV الحالي (رموز الـprompt السابق) لإعادة استخدام البادئة
Snapshot g_snap;
std::string g_arch;

Result err(const char* code, const std::string& msg) { Result r; r.ok = false; r.code = code; r.message = msg; return r; }
Result good() { Result r; r.ok = true; return r; }

void log_cb(ggml_log_level level, const char* text, void*) {
    if (!text) return;
    if (level == GGML_LOG_LEVEL_ERROR) {
        std::string t = text;
        while (!t.empty() && (t.back() == '\n' || t.back() == '\r')) t.pop_back();
        std::lock_guard<std::mutex> lk(g_state);
        if (g_errors.size() < 16 && !t.empty()) g_errors.push_back(t);
    }
#ifdef __ANDROID__
    int pr = level == GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR : level == GGML_LOG_LEVEL_WARN ? ANDROID_LOG_WARN : level == GGML_LOG_LEVEL_INFO ? ANDROID_LOG_INFO : ANDROID_LOG_DEBUG;
    if (level <= GGML_LOG_LEVEL_WARN || g_verbose) __android_log_write(pr, "OmniLlm", text);
#else
    if (g_verbose || level == GGML_LOG_LEVEL_ERROR) fputs(text, stderr);
#endif
}

// يرجع كل الأسطر مفصولة بـ"; " (للتصنيف) — والرسالة للمستخدم تأخذ السطر الأول فقط
std::string take_all_errors() { std::lock_guard<std::mutex> lk(g_state); std::string r; for (auto& e : g_errors) { if (!r.empty()) r += "; "; r += e; } return r; }
std::string take_first_error() { std::lock_guard<std::mutex> lk(g_state); return g_errors.empty() ? std::string() : g_errors.front(); }
void clear_last_error() { std::lock_guard<std::mutex> lk(g_state); g_errors.clear(); }

bool contains_ci(const std::string& hay, const char* needle) {
    std::string h = hay, n = needle;
    std::transform(h.begin(), h.end(), h.begin(), [](unsigned char c) { return std::tolower(c); });
    std::transform(n.begin(), n.end(), n.begin(), [](unsigned char c) { return std::tolower(c); });
    return h.find(n) != std::string::npos;
}

bool looks_like_oom(const std::string& e) {
    return contains_ci(e, "failed to allocate") || contains_ci(e, "out of memory") || contains_ci(e, "cannot allocate") || contains_ci(e, "bad_alloc") || contains_ci(e, "unable to allocate") || contains_ci(e, "mmap failed");
}

bool abort_cb(void*) { return g_cancel.load(std::memory_order_relaxed); }
bool progress_cb(float, void*) { return !g_cancel.load(std::memory_order_relaxed); }

int64_t file_size_of(const std::string& p) { struct stat st; if (stat(p.c_str(), &st) != 0) return -1; return (int64_t)st.st_size; }

void free_all_locked() {
    if (g_ctx) { llama_free(g_ctx); g_ctx = nullptr; }
    if (g_model) { llama_model_free(g_model); g_model = nullptr; }
    g_vocab = nullptr; g_cache.clear(); g_arch.clear();
    std::lock_guard<std::mutex> lk(g_state);
    bool busy = g_snap.busy; g_snap = Snapshot(); g_snap.busy = busy;
}

struct Sampler {
    llama_sampler* s = nullptr;
    ~Sampler() { if (s) llama_sampler_free(s); }
};

struct BusyGuard {
    BusyGuard() { g_busy = true; std::lock_guard<std::mutex> lk(g_state); g_snap.busy = true; }
    ~BusyGuard() { g_busy = false; std::lock_guard<std::mutex> lk(g_state); g_snap.busy = false; }
};

std::string meta_str(const llama_model* m, const char* key) {
    char buf[512]; int n = llama_model_meta_val_str(m, key, buf, sizeof buf);
    if (n < 0) return std::string();
    return std::string(buf, std::min<size_t>((size_t)n, sizeof buf - 1));
}

int64_t kv_bytes_estimate(const llama_model* m, int32_t n_ctx) {
    int64_t n_layer = llama_model_n_layer(m), n_head_kv = std::max<int64_t>(1, llama_model_n_head_kv(m));
    int64_t head_dim = 0;
    std::string arch = meta_str(m, "general.architecture");
    if (!arch.empty()) { std::string v = meta_str(m, (arch + ".attention.key_length").c_str()); if (!v.empty()) head_dim = atoll(v.c_str()); }
    if (head_dim <= 0) { int64_t nh = std::max<int64_t>(1, llama_model_n_head(m)); head_dim = llama_model_n_embd(m) / nh; }
    return n_layer * (int64_t)n_ctx * 2 /*K+V*/ * n_head_kv * head_dim * 2 /*f16*/;
}

}  // namespace

// ───────── أدوات ─────────
std::string build_chatml(const std::string& system, const std::string& user, const std::string& assistant_prefix) {
    std::string s;
    if (!system.empty()) s += "<|im_start|>system\n" + system + "<|im_end|>\n";
    s += "<|im_start|>user\n" + user + "<|im_end|>\n<|im_start|>assistant\n" + assistant_prefix;
    return s;
}

std::string utf8_trim_incomplete(std::string s) {
    size_t n = s.size(); if (!n) return s;
    // ابحث للخلف (حتى 3 بايت) عن بايت بداية تسلسل ناقص
    for (size_t back = 1; back <= 3 && back <= n; back++) {
        unsigned char c = (unsigned char)s[n - back];
        if ((c & 0xC0) == 0x80) continue;                    // بايت متابعة
        size_t need = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 1;
        if (need > back) s.resize(n - back);                 // تسلسل غير مكتمل
        break;
    }
    return s;
}

bool is_gguf_file(const std::string& path, std::string& why) {
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) { why = "cannot open file"; return false; }
    unsigned char h[8]; size_t n = fread(h, 1, 8, f); fclose(f);
    if (n < 8 || memcmp(h, "GGUF", 4) != 0) { why = "missing GGUF magic header"; return false; }
    uint32_t ver = h[4] | (h[5] << 8) | (h[6] << 16) | ((uint32_t)h[7] << 24);
    if (ver < 1 || ver > 3) { why = "unsupported GGUF version " + std::to_string(ver); return false; }
    return true;
}

MemInfo mem_info() {
    MemInfo m;
    if (FILE* f = fopen("/proc/meminfo", "r")) {
        char line[256];
        while (fgets(line, sizeof line, f)) {
            long long kb;
            if (sscanf(line, "MemAvailable: %lld kB", &kb) == 1) m.avail = kb * 1024;
            else if (sscanf(line, "MemTotal: %lld kB", &kb) == 1) m.total = kb * 1024;
        }
        fclose(f);
    }
    if (FILE* f = fopen("/proc/self/statm", "r")) {
        long long size, res;
        if (fscanf(f, "%lld %lld", &size, &res) == 2) m.rss = res * (long long)sysconf(_SC_PAGESIZE);
        fclose(f);
    }
    return m;
}

void init(const std::string& backend_dir) {
    std::call_once(g_init_once, [&]() {
        const char* v = getenv("OMNILLM_LOG"); g_verbose = v && *v && *v != '0';
        llama_log_set(log_cb, nullptr);
        if (!backend_dir.empty()) ggml_backend_load_all_from_path(backend_dir.c_str());
        llama_backend_init();
    });
}

std::string system_info() { const char* s = llama_print_system_info(); return s ? s : ""; }
std::string version() { return OMNILLM_LLAMA_REF; }
Snapshot snapshot() { std::lock_guard<std::mutex> lk(g_state); return g_snap; }
std::string last_native_error() { return take_first_error(); }
void cancel() { g_cancel.store(true); }

// ───────── load ─────────
Result load(const LoadOpts& o, LoadInfo& out) {
    std::lock_guard<std::mutex> op(g_op);
    BusyGuard bg;
    g_cancel = false; clear_last_error();
    try {
        init("");   // إن لم يُستدعَ init صراحة (اختبارات)
        if (g_model) free_all_locked();
        if (o.path.empty()) return err("INVALID", "model path is empty");
        int64_t fsz = file_size_of(o.path);
        if (fsz < 0) return err("FILE_NOT_FOUND", "Model file not found: " + o.path);
        std::string why;
        if (!is_gguf_file(o.path, why)) return err("INVALID_MODEL", "Not a valid GGUF model file (" + why + ").");

        int64_t avail = o.avail_mem > 0 ? o.avail_mem : mem_info().avail;
        if (avail > 0 && fsz > avail)
            return err("INSUFFICIENT_MEMORY", "Insufficient memory to load this model. File size " + std::to_string(fsz >> 20) + " MB, available " + std::to_string(avail >> 20) + " MB.");

        llama_model_params mp = llama_model_default_params();
        mp.n_gpu_layers = 0; mp.load_mode = LLAMA_LOAD_MODE_MMAP;
        mp.progress_callback = progress_cb; mp.progress_callback_user_data = nullptr;
        llama_model* model = llama_model_load_from_file(o.path.c_str(), mp);
        if (!model) {
            if (g_cancel) return err("CANCELLED", "Model loading cancelled.");
            std::string all = take_all_errors(), first = take_first_error();
            if (looks_like_oom(all)) return err("INSUFFICIENT_MEMORY", "Insufficient memory to load this model.");
            if (contains_ci(all, "unknown model architecture")) return err("INVALID_MODEL", "Unsupported model architecture: " + first);
            return err("LOAD_FAILED", "Model load failed" + (first.empty() ? std::string() : ": " + first));
        }
        if (g_cancel) { llama_model_free(model); return err("CANCELLED", "Model loading cancelled."); }

        int32_t req = std::max<int32_t>(256, o.n_ctx > 0 ? o.n_ctx : 2048);
        int32_t train = llama_model_n_ctx_train(model);
        int32_t n_ctx = train > 0 ? std::min(req, train) : req;
        int64_t msize = (int64_t)llama_model_size(model);
        int64_t kv = kv_bytes_estimate(model, n_ctx);
        const int64_t HEADROOM = 192LL << 20;       // مخازن الحساب وغيرها (تقدير تقريبي)
        bool reduced = false;
        if (avail > 0) {
            while (msize + kv + HEADROOM > (int64_t)(avail * 0.92) && n_ctx > 512) { n_ctx = std::max<int32_t>(512, n_ctx / 2); kv = kv_bytes_estimate(model, n_ctx); reduced = true; }
            if (msize + kv + HEADROOM > (int64_t)(avail * 0.92)) {
                llama_model_free(model);
                return err("INSUFFICIENT_MEMORY", "Insufficient memory to load this model. Needs about " + std::to_string((msize + kv + HEADROOM) >> 20) + " MB, available " + std::to_string(avail >> 20) + " MB.");
            }
        }
        int32_t hw = (int32_t)std::thread::hardware_concurrency();
        int32_t nt = o.n_threads > 0 ? o.n_threads : std::max(2, std::min(4, hw - 2));

        llama_context_params cp = llama_context_default_params();
        cp.n_ctx = (uint32_t)n_ctx; cp.n_batch = (uint32_t)std::min(512, n_ctx); cp.n_ubatch = cp.n_batch;
        cp.n_threads = nt; cp.n_threads_batch = nt; cp.no_perf = true;
        cp.abort_callback = abort_cb; cp.abort_callback_data = nullptr;
        llama_context* ctx = llama_init_from_model(model, cp);
        if (!ctx) {
            std::string all = take_all_errors(), first = take_first_error(); llama_model_free(model);
            if (looks_like_oom(all)) return err("INSUFFICIENT_MEMORY", "Insufficient memory to load this model.");
            return err("LOAD_FAILED", "Model load failed: could not create context" + (first.empty() ? std::string() : " (" + first + ")"));
        }

        g_model = model; g_ctx = ctx; g_vocab = llama_model_get_vocab(model); g_cache.clear();
        g_arch = meta_str(model, "general.architecture");
        out = LoadInfo();
        out.n_ctx = (int32_t)llama_n_ctx(ctx); out.n_ctx_requested = req; out.n_ctx_train = train; out.n_threads = nt;
        out.model_size = msize; out.file_size = fsz; out.n_params = (int64_t)llama_model_n_params(model); out.kv_estimate = kv; out.ctx_reduced = reduced;
        out.arch = g_arch;
        out.name = meta_str(model, "general.name");
        if (out.name.empty()) out.name = meta_str(model, "general.basename");
        char d[256]; if (llama_model_desc(model, d, sizeof d) > 0) out.desc = d;
        { std::lock_guard<std::mutex> lk(g_state); bool busy = g_snap.busy; g_snap = Snapshot(); g_snap.busy = busy; g_snap.loaded = true; g_snap.n_ctx = out.n_ctx; g_snap.n_threads = nt; g_snap.model_size = msize; g_snap.file_size = fsz; g_snap.name = out.name; g_snap.desc = out.desc; }
        return good();
    } catch (const std::bad_alloc&) {
        free_all_locked(); return err("INSUFFICIENT_MEMORY", "Insufficient memory to load this model.");
    } catch (const std::exception& e) {
        free_all_locked(); return err("LOAD_FAILED", std::string("Model load failed: ") + e.what());
    } catch (...) {
        free_all_locked(); return err("LOAD_FAILED", "Model load failed: unknown native error");
    }
}

Result unload() {
    g_cancel = true;                              // أوقف أي عملية جارية ليتحرر g_op
    std::lock_guard<std::mutex> op(g_op);
    free_all_locked();
    g_cancel = false;
    return good();
}

// ───────── tokenize ─────────
static int tokenize_raw(const std::string& text, bool add_special, bool parse_special, std::vector<llama_token>& out) {
    int n = -llama_tokenize(g_vocab, text.data(), (int32_t)text.size(), nullptr, 0, add_special, parse_special);
    if (n < 0) return -1;   // نتيجة موجبة غير متوقعة (نص فارغ ...)
    out.resize((size_t)n);
    if (n == 0) return 0;
    int r = llama_tokenize(g_vocab, text.data(), (int32_t)text.size(), out.data(), n, add_special, parse_special);
    if (r < 0) return -1;
    out.resize((size_t)r);
    return r;
}

Result tokenize(const std::string& text, bool special, int32_t& count) {
    std::lock_guard<std::mutex> op(g_op);
    try {
        if (!g_model) return err("NOT_LOADED", "No model is loaded.");
        if (text.empty()) { count = 0; return good(); }
        std::vector<llama_token> t;
        if (tokenize_raw(text, true, special, t) < 0) return err("GENERATE_FAILED", "Tokenization failed.");
        count = (int32_t)t.size(); return good();
    } catch (const std::bad_alloc&) { return err("INSUFFICIENT_MEMORY", "Insufficient memory."); }
    catch (const std::exception& e) { return err("GENERATE_FAILED", e.what()); }
    catch (...) { return err("GENERATE_FAILED", "unknown native error"); }
}

// ───────── generate ─────────
static std::string piece_of(llama_token tok) {
    char buf[256];
    int n = llama_token_to_piece(g_vocab, tok, buf, sizeof buf, 0, false);
    if (n >= 0) return std::string(buf, (size_t)n);
    std::string big((size_t)(-n), '\0');
    n = llama_token_to_piece(g_vocab, tok, &big[0], (int32_t)big.size(), 0, false);
    if (n < 0) return std::string();
    big.resize((size_t)n); return big;
}

static void reset_kv_locked() {
    if (g_ctx) llama_memory_clear(llama_get_memory(g_ctx), true);
    g_cache.clear();
}

Result generate(const GenOpts& o, GenOut& out) {
    std::lock_guard<std::mutex> op(g_op);
    BusyGuard bg;
    g_cancel = false;
    auto t_start = clk::now();
    try {
        if (!g_model || !g_ctx) return err("NOT_LOADED", "No model is loaded.");
        if (o.user.empty() && o.system.empty()) return err("INVALID", "Empty prompt.");

        // 1) نص الـprompt
        std::string prompt;
        if (o.tmpl == "chatml") prompt = build_chatml(o.system, o.user, o.assistant_prefix);
        else if (o.tmpl == "model") {
            const char* tpl = llama_model_chat_template(g_model, nullptr);
            if (!tpl) return err("INVALID", "This model has no embedded chat template; use template 'chatml'.");
            std::vector<llama_chat_message> msgs;
            if (!o.system.empty()) msgs.push_back({"system", o.system.c_str()});
            msgs.push_back({"user", o.user.c_str()});
            std::vector<char> buf(o.system.size() + o.user.size() + 1024);
            int n = llama_chat_apply_template(tpl, msgs.data(), msgs.size(), true, buf.data(), (int32_t)buf.size());
            if (n > (int)buf.size()) { buf.resize((size_t)n); n = llama_chat_apply_template(tpl, msgs.data(), msgs.size(), true, buf.data(), (int32_t)buf.size()); }
            if (n < 0) return err("INVALID", "The model's chat template is not supported by llama.cpp; use template 'chatml'.");
            prompt.assign(buf.data(), (size_t)n); prompt += o.assistant_prefix;
        } else return err("INVALID", "Unknown template: " + o.tmpl);

        // 2) tokenization (BOS يُضاف فقط إن كان النموذج يطلبه)
        std::vector<llama_token> toks;
        if (tokenize_raw(prompt, true, true, toks) < 0 || toks.empty()) return err("GENERATE_FAILED", "Tokenization failed.");
        const int32_t n_ctx = (int32_t)llama_n_ctx(g_ctx), n_batch = (int32_t)llama_n_batch(g_ctx);
        const int32_t n_prompt = (int32_t)toks.size();
        if (n_prompt + 1 > n_ctx) return err("CONTEXT_OVERFLOW", "Prompt needs " + std::to_string(n_prompt) + " tokens but the context is " + std::to_string(n_ctx) + ".");
        int32_t max_new = std::max<int32_t>(1, std::min<int32_t>(o.max_tokens > 0 ? o.max_tokens : 512, n_ctx - n_prompt));

        // 3) إعادة استخدام بادئة KV المشتركة مع الطلب السابق
        llama_memory_t mem = llama_get_memory(g_ctx);
        int32_t common = 0;
        while (common < (int32_t)g_cache.size() && common < n_prompt && g_cache[(size_t)common] == toks[(size_t)common]) common++;
        if (common >= n_prompt) common = n_prompt - 1;      // لازم نفك آخر رمز على الأقل للحصول على logits
        if (common <= 0) { reset_kv_locked(); common = 0; }
        else if (!llama_memory_seq_rm(mem, 0, common, -1)) { reset_kv_locked(); common = 0; }
        else g_cache.resize((size_t)common);

        // 4) معالجة الـprompt
        auto t_prompt = clk::now();
        for (int32_t i = common; i < n_prompt;) {
            if (g_cancel) { reset_kv_locked(); return err("CANCELLED", "Generation cancelled."); }
            int32_t n = std::min(n_batch, n_prompt - i);
            int r = llama_decode(g_ctx, llama_batch_get_one(&toks[(size_t)i], n));
            if (r != 0) {
                reset_kv_locked();
                if (g_cancel || r == 2) return err("CANCELLED", "Generation cancelled.");
                if (r == 1) return err("CONTEXT_OVERFLOW", "Could not find a KV slot for the prompt (context too small).");
                return err("GENERATE_FAILED", "llama_decode failed (" + std::to_string(r) + ")");
            }
            g_cache.insert(g_cache.end(), toks.begin() + i, toks.begin() + i + n);
            i += n;
        }
        double prompt_ms = ms_since(t_prompt);

        // 5) المُعيِّنات (sampling)
        Sampler smp;
        { llama_sampler_chain_params sp = llama_sampler_chain_default_params(); sp.no_perf = true; smp.s = llama_sampler_chain_init(sp); }
        if (o.temperature <= 0.0f) llama_sampler_chain_add(smp.s, llama_sampler_init_greedy());
        else {
            if (o.repeat_penalty > 1.0f) llama_sampler_chain_add(smp.s, llama_sampler_init_penalties(llama_vocab_n_tokens(g_vocab), 64, o.repeat_penalty, 0.0f, 0.0f));
            if (o.top_k > 0) llama_sampler_chain_add(smp.s, llama_sampler_init_top_k(o.top_k));
            if (o.top_p > 0.0f && o.top_p < 1.0f) llama_sampler_chain_add(smp.s, llama_sampler_init_top_p(o.top_p, 1));
            if (o.min_p > 0.0f) llama_sampler_chain_add(smp.s, llama_sampler_init_min_p(o.min_p, 1));
            llama_sampler_chain_add(smp.s, llama_sampler_init_temp(o.temperature));
            uint32_t seed = o.seed >= 0 ? (uint32_t)o.seed : (uint32_t)std::random_device{}();
            llama_sampler_chain_add(smp.s, llama_sampler_init_dist(seed));
        }

        // 6) حلقة التوليد
        std::string text; int32_t gen = 0; bool eog = false; auto t_gen = clk::now();
        for (; gen < max_new;) {
            if (g_cancel) { reset_kv_locked(); return err("CANCELLED", "Generation cancelled."); }
            llama_token tok = llama_sampler_sample(smp.s, g_ctx, -1);
            if (llama_vocab_is_eog(g_vocab, tok)) { eog = true; break; }
            text += piece_of(tok); gen++;
            if (gen >= max_new) break;
            int r = llama_decode(g_ctx, llama_batch_get_one(&tok, 1));
            if (r != 0) {
                reset_kv_locked();
                if (g_cancel || r == 2) return err("CANCELLED", "Generation cancelled.");
                if (r == 1) { break; }   // امتلأ السياق: نُرجع ما تولّد (truncated)
                return err("GENERATE_FAILED", "llama_decode failed (" + std::to_string(r) + ")");
            }
        }
        double gen_ms = ms_since(t_gen);

        // 7) أبقِ الـprompt فقط في KV (يُعاد استخدامه) واحذف المُولَّد
        if (!llama_memory_seq_rm(mem, 0, n_prompt, -1)) reset_kv_locked();
        else if ((int32_t)g_cache.size() != n_prompt) { reset_kv_locked(); }

        out = GenOut();
        out.text = utf8_trim_incomplete(text);
        out.prompt_tokens = n_prompt; out.generated_tokens = gen; out.cached_tokens = common;
        out.truncated = !eog; out.prompt_ms = prompt_ms; out.gen_ms = gen_ms; out.total_ms = ms_since(t_start);
        return good();
    } catch (const std::bad_alloc&) {
        reset_kv_locked(); return err("INSUFFICIENT_MEMORY", "Insufficient memory to generate.");
    } catch (const std::exception& e) {
        reset_kv_locked(); return err("GENERATE_FAILED", std::string("Generation failed: ") + e.what());
    } catch (...) {
        reset_kv_locked(); return err("GENERATE_FAILED", "Generation failed: unknown native error");
    }
}

}  // namespace omnillm
