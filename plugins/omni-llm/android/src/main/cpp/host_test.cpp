// اختبارات نواة OmniLlm على Linux ضد llama.cpp الحقيقي.
// الاستخدام: omnillm_host_test <model.gguf> <tmpdir> [--load-only]
// يعمل مع أي GGUF؛ في CI/هذه البيئة يُستخدم نموذج qwen3 صغير بأوزان عشوائية (tests/omnillm/make_tiny_gguf.py)
// فيختبر الآلية (load/tokenize/generate/cancel/unload/cache) وليس جودة نموذج حقيقي.
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <thread>
#include <vector>

#include "omnillm_core.h"

using namespace omnillm;
static int g_pass = 0, g_fail = 0;
#define CHECK(name, cond) do { if (cond) { g_pass++; printf("  ✓ %s\n", name); } else { g_fail++; printf("  ✗ %s   (%s:%d)\n", name, __FILE__, __LINE__); } fflush(stdout); } while (0)
static std::string show(const Result& r) { return r.code + ": " + r.message; }
static void write_file(const std::string& p, const std::string& d) { std::ofstream f(p, std::ios::binary); f << d; }
using clk = std::chrono::steady_clock;
static double ms_since(clk::time_point t) { return std::chrono::duration<double, std::milli>(clk::now() - t).count(); }

static GenOpts opts(const std::string& user, int max = 24) {
    GenOpts g; g.system = "You are Prompt Forge, a prompt engineer. Reply with PROMPT: and NEGATIVE: lines only."; g.user = user; g.max_tokens = max; g.temperature = 0.0f;
    g.assistant_prefix = "<think>\n\n</think>\n\n"; return g;
}

int main(int argc, char** argv) {
    if (argc < 3) { fprintf(stderr, "usage: %s model.gguf tmpdir [--load-only]\n", argv[0]); return 2; }
    std::string model = argv[1], tmp = argv[2]; bool load_only = argc > 3 && !strcmp(argv[3], "--load-only");
    init("");
    printf("runtime: llama.cpp %s\n", version().c_str());

    if (load_only) {   // وضع اختبار OOM الحقيقي (ulimit -v): المطلوب فقط ألا ينهار ويعيد رمزاً واضحاً
        LoadInfo li; Result r = load({model, 2048, 0, 0}, li);
        printf("load-only: ok=%d code=%s msg=%s\n", r.ok, r.code.c_str(), r.message.c_str());
        if (r.ok) unload();
        return 0;
    }

    printf("[أدوات]\n");
    CHECK("build_chatml: system+user+prefix", build_chatml("S", "U", "<think>\n\n</think>\n\n") == "<|im_start|>system\nS<|im_end|>\n<|im_start|>user\nU<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n");
    CHECK("build_chatml: بلا system", build_chatml("", "U", "") == "<|im_start|>user\nU<|im_end|>\n<|im_start|>assistant\n");
    CHECK("utf8_trim_incomplete: يقطع تسلسلاً ناقصاً", utf8_trim_incomplete(std::string("ab\xE2\x82")) == "ab" && utf8_trim_incomplete(std::string("ab\xE2\x82\xAC")) == std::string("ab\xE2\x82\xAC") && utf8_trim_incomplete("abc") == "abc" && utf8_trim_incomplete(std::string("a\xF0\x9F\x98")) == "a" && utf8_trim_incomplete("") == "");

    printf("[ملفات النموذج]\n");
    LoadInfo li; Result r;
    r = load({tmp + "/does-not-exist.gguf", 2048, 0, 0}, li); CHECK("ملف مفقود → FILE_NOT_FOUND", !r.ok && r.code == "FILE_NOT_FOUND");
    write_file(tmp + "/not-gguf.gguf", "this is definitely not a gguf model file, just text\n");
    r = load({tmp + "/not-gguf.gguf", 2048, 0, 0}, li); CHECK("ملف نصي بامتداد gguf → INVALID_MODEL", !r.ok && r.code == "INVALID_MODEL");
    write_file(tmp + "/empty.gguf", ""); r = load({tmp + "/empty.gguf", 2048, 0, 0}, li); CHECK("ملف فارغ → INVALID_MODEL", !r.ok && r.code == "INVALID_MODEL");
    write_file(tmp + "/badver.gguf", std::string("GGUF\x63\x00\x00\x00", 8) + std::string(64, '\0')); r = load({tmp + "/badver.gguf", 2048, 0, 0}, li); CHECK("إصدار GGUF غير مدعوم → INVALID_MODEL", !r.ok && r.code == "INVALID_MODEL");
    {   // GGUF حقيقي مبتور (رأس صحيح، بقية الملف مقطوعة): لا انهيار، خطأ واضح
        std::ifstream in(model, std::ios::binary); std::string head(4096, '\0'); in.read(&head[0], 4096); head.resize((size_t)in.gcount());
        write_file(tmp + "/truncated.gguf", head); r = load({tmp + "/truncated.gguf", 2048, 0, 0}, li);
        CHECK("GGUF مبتور → خطأ (INVALID_MODEL/LOAD_FAILED) بلا انهيار", !r.ok && (r.code == "INVALID_MODEL" || r.code == "LOAD_FAILED")); printf("      %s\n", show(r).c_str());
    }
    CHECK("لا نموذج محمّل بعد الفشل", !snapshot().loaded);
    r = load({"", 2048, 0, 0}, li); CHECK("مسار فارغ → INVALID", !r.ok && r.code == "INVALID");
    r = load({model, 2048, 0, 1 << 20}, li); CHECK("ذاكرة متاحة 1MB → INSUFFICIENT_MEMORY بالرسالة المطلوبة", !r.ok && r.code == "INSUFFICIENT_MEMORY" && r.message.find("Insufficient memory to load this model.") == 0); printf("      %s\n", show(r).c_str());
    CHECK("لا نموذج محمّل بعد INSUFFICIENT_MEMORY", !snapshot().loaded);
    { int32_t n; r = tokenize("hello", false, n); CHECK("tokenize بلا نموذج → NOT_LOADED", !r.ok && r.code == "NOT_LOADED"); GenOut g; r = generate(opts("hi"), g); CHECK("generate بلا نموذج → NOT_LOADED", !r.ok && r.code == "NOT_LOADED"); }

    printf("[تحميل صالح]\n");
    r = load({model, 2048, 0, 0}, li); CHECK("تحميل GGUF صالح", r.ok); if (!r.ok) { printf("      %s\n", show(r).c_str()); return 1; }
    printf("      arch=%s name=%s ctx=%d (train %d) threads=%d model=%lld B params=%lld kv_est=%lld B reduced=%d\n", li.arch.c_str(), li.name.c_str(), li.n_ctx, li.n_ctx_train, li.n_threads, (long long)li.model_size, (long long)li.n_params, (long long)li.kv_estimate, li.ctx_reduced);
    CHECK("ctx = 2048 كما طُلب", li.n_ctx == 2048); CHECK("اللقطة تعكس التحميل", snapshot().loaded && snapshot().n_ctx == 2048 && snapshot().model_size == li.model_size);
    { LoadInfo l2; Result r2 = load({model, 1024, 0, 0}, l2); CHECK("إعادة load لنفس الملف تحرر القديم وتنجح (ctx جديد 1024)", r2.ok && l2.n_ctx == 1024); r2 = load({model, 2048, 0, 0}, li); CHECK("إعادة تحميل 2048", r2.ok && li.n_ctx == 2048); }

    printf("[tokenize]\n");
    { int32_t a = 0, b = 0, c = 0; CHECK("tokenize نص إنجليزي", tokenize("A lone knight faces a dragon in a storm", false, a).ok && a >= 6 && a <= 14); CHECK("tokenize عربي", tokenize("فارس وحيد أمام تنين في عاصفة", false, b).ok && b > 3);
      CHECK("tokenize فارغ = 0", tokenize("", false, c).ok && c == 0); int32_t sp = 0; tokenize("<|im_start|>user", true, sp); int32_t ns = 0; tokenize("<|im_start|>user", false, ns); CHECK("special=true يدمج الرموز الخاصة (أقل عدداً)", sp < ns); }

    printf("[توليد]\n");
    GenOut g1, g2, g3; r = generate(opts("A lone knight faces a dragon"), g1); CHECK("generate ينجح", r.ok); if (!r.ok) { printf("      %s\n", show(r).c_str()); return 1; }
    printf("      prompt=%d gen=%d cached=%d trunc=%d prompt_ms=%.1f gen_ms=%.1f text=%.60s\n", g1.prompt_tokens, g1.generated_tokens, g1.cached_tokens, g1.truncated, g1.prompt_ms, g1.gen_ms, g1.text.c_str());
    CHECK("عدّاد الرموز: prompt>30 و generated في (0..max]", g1.prompt_tokens > 30 && g1.generated_tokens > 0 && g1.generated_tokens <= 24);
    CHECK("النص غير فارغ وUTF-8 كامل", !g1.text.empty() && utf8_trim_incomplete(g1.text) == g1.text);
    CHECK("الأول بلا cache", g1.cached_tokens == 0);
    r = generate(opts("A lone knight faces a dragon"), g2); CHECK("الطلب الثاني (نفس الـprompt) ينجح", r.ok);
    CHECK("إعادة استخدام KV: cached = prompt-1 والنتيجة مطابقة (greedy)", g2.cached_tokens == g2.prompt_tokens - 1 && g2.text == g1.text && g2.generated_tokens == g1.generated_tokens); printf("      cached=%d/%d prompt_ms %.1f → %.1f\n", g2.cached_tokens, g2.prompt_tokens, g1.prompt_ms, g2.prompt_ms);
    r = generate(opts("A castle on a hill at sunset"), g3); CHECK("فكرة مختلفة: يعاد استخدام البادئة المشتركة (system) فقط", r.ok && g3.cached_tokens > 20 && g3.cached_tokens < g3.prompt_tokens - 1);
    { LoadInfo l; load({model, 2048, 0, 0}, l); GenOut cold; generate(opts("A castle on a hill at sunset"), cold); CHECK("نتيجة cache دافئ == cold (لا تلوّث KV)", cold.text == g3.text && cold.cached_tokens == 0); }
    { GenOpts o = opts("A lone knight", 5); GenOut g; r = generate(o, g); CHECK("max_tokens=5 → truncated=true وgenerated<=5", r.ok && g.truncated && g.generated_tokens <= 5); }
    { GenOpts o = opts("x"); o.tmpl = "model"; GenOut g; r = generate(o, g); CHECK("template=model (قالب النموذج المضمّن) يعمل أو يعيد INVALID واضحاً", r.ok || r.code == "INVALID"); }
    { GenOpts o = opts("x"); o.tmpl = "bogus"; GenOut g; r = generate(o, g); CHECK("template مجهول → INVALID", !r.ok && r.code == "INVALID"); }
    { GenOpts o = opts("x"); o.temperature = 0.8f; o.seed = 7; GenOut a, b; generate(o, a); generate(o, b); CHECK("بذرة ثابتة → نتيجة ثابتة (temperature>0)", a.text == b.text); o.seed = 8; GenOut c; generate(o, c); o.seed = -1; GenOut d, e; generate(o, d); generate(o, e); CHECK("sampling يعمل بكل المعاملات", !a.text.empty()); }
    { GenOpts o = opts(std::string("word ") + std::string(6000, 'a')); o.user = std::string(40000, 'a'); GenOut g; r = generate(o, g); CHECK("prompt أكبر من السياق → CONTEXT_OVERFLOW بلا انهيار", !r.ok && r.code == "CONTEXT_OVERFLOW"); printf("      %s\n", show(r).c_str()); }
    { GenOut g; r = generate(opts("ok again"), g); CHECK("يعمل بعد CONTEXT_OVERFLOW", r.ok); }

    printf("[إلغاء]\n");
    {   // إلغاء أثناء التوليد (max_tokens كبير)
        GenOpts o = opts("tell me a very long story", 2000); o.temperature = 0.9f; GenOut g; Result rr; std::atomic<bool> done{false};
        auto t0 = clk::now(); std::thread th([&]() { rr = generate(o, g); done = true; });
        std::this_thread::sleep_for(std::chrono::milliseconds(150)); cancel(); th.join(); double ms = ms_since(t0);
        CHECK("cancel أثناء التوليد → CANCELLED", !rr.ok && rr.code == "CANCELLED"); CHECK("الإلغاء سريع (<2s من بدء الطلب)", ms < 2000); printf("      انتهى بعد %.0f ms\n", ms);
        GenOut g2b; Result r3 = generate(opts("after cancel"), g2b); CHECK("توليد جديد ينجح بعد الإلغاء (لا حالة عالقة)", r3.ok && !g2b.text.empty());
    }
    {   // إلغاء أثناء معالجة prompt طويل (~1700 رمز < السياق): يجب أن ينتج CANCELLED فعلاً في إحدى المحاولات
        LoadInfo l; load({model, 2048, 0, 0}, l); int cancelled = 0, tried = 0; int toks = 0;
        for (int attempt = 0; attempt < 8 && !cancelled; attempt++) {
            GenOpts o = opts("x", 8); o.system = std::string(); for (int i = 0; i < 105 + attempt; i++) o.system += "The ancient castle stands upon a windswept hill " + std::to_string(i) + ". ";
            GenOut g; Result rr; tried++; std::thread th([&]() { rr = generate(o, g); }); std::this_thread::sleep_for(std::chrono::microseconds(attempt * 300)); cancel(); th.join();
            if (!rr.ok && rr.code == "CANCELLED") cancelled++; else if (rr.ok) toks = g.prompt_tokens; else if (rr.code != "CONTEXT_OVERFLOW") { printf("      غير متوقع: %s\n", show(rr).c_str()); }
            if (!rr.ok && rr.code == "CONTEXT_OVERFLOW") { printf("      prompt أكبر من السياق: %s\n", show(rr).c_str()); break; }
        }
        printf("      محاولات=%d، CANCELLED=%d، آخر prompt_tokens=%d\n", tried, cancelled, toks);
        CHECK("cancel أثناء معالجة الـprompt → CANCELLED فعلياً", cancelled == 1);
        GenOut g2b; CHECK("وما بعده سليم (KV نُظّف)", generate(opts("fine"), g2b).ok && !g2b.text.empty());
    }
    {   // cancel بلا عملية جارية لا يفسد الطلب اللاحق
        cancel(); GenOut g; Result rr = generate(opts("after idle cancel"), g); CHECK("cancel وقت الخمول لا يُلغي الطلب التالي", rr.ok);
    }
    {   // unload أثناء التوليد
        GenOpts o = opts("long story", 3000); o.temperature = 0.9f; GenOut g; Result rr; std::thread th([&]() { rr = generate(o, g); });
        std::this_thread::sleep_for(std::chrono::milliseconds(120)); Result ru = unload(); th.join();
        CHECK("unload أثناء التوليد: التوليد يُلغى (CANCELLED) والتحرير ينجح", ru.ok && !rr.ok && rr.code == "CANCELLED"); CHECK("اللقطة: غير محمّل", !snapshot().loaded);
        GenOut g2b; Result r2 = generate(opts("x"), g2b); CHECK("generate بعد unload → NOT_LOADED", !r2.ok && r2.code == "NOT_LOADED");
    }
    {   // تحميل ثم cancel أثناء التحميل (قد يكون سريعاً جداً للنموذج الصغير: المهم عدم الانهيار وعدم ترك حالة)
        cancel(); std::atomic<bool> go{false}; Result rr; LoadInfo l; std::thread th([&]() { while (!go) {} rr = load({model, 2048, 0, 0}, l); }); go = true; cancel(); th.join();
        CHECK("cancel حول التحميل: نجح أو CANCELLED (لا انهيار)", rr.ok || rr.code == "CANCELLED"); unload();
    }

    printf("[دورة الحياة والذاكرة]\n");
    {
        MemInfo m0 = mem_info(); long long rss0 = m0.rss; CHECK("mem_info متاح على Linux", m0.avail > 0 && m0.total > 0 && m0.rss > 0);
        int ok = 0; long long peak = 0;
        for (int i = 0; i < 25; i++) { LoadInfo l; Result a = load({model, 2048, 0, 0}, l); if (!a.ok) break; GenOut g; if (generate(opts("cycle " + std::to_string(i), 8), g).ok) ok++; peak = std::max<long long>(peak, mem_info().rss); unload(); }
        MemInfo m1 = mem_info(); CHECK("25 دورة load→generate→unload كلها ناجحة", ok == 25);
        printf("      RSS قبل %lld MB، ذروة %lld MB، بعد %lld MB\n", rss0 >> 20, peak >> 20, (long long)(m1.rss >> 20));
        CHECK("لا تسريب ظاهر: RSS بعد 25 دورة قريب من البداية (+64MB كحد أقصى)", m1.rss - rss0 < (64LL << 20));
        CHECK("بعد unload: غير محمّل", !snapshot().loaded && !snapshot().busy);
    }
    unload(); CHECK("unload مزدوج آمن", unload().ok);

    printf("\n%d نجح، %d فشل\n", g_pass, g_fail);
    return g_fail ? 1 : 0;
}
