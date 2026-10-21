#!/usr/bin/env python3
"""يولّد نموذج GGUF صغيراً بأوزان **عشوائية** (معمارية qwen3 الحقيقية + مفردات/قالب Qwen2 من llama.cpp) لاختبار آلية المحرك فقط:
تحميل/tokenize/توليد/إلغاء/تحرير. مخرجاته نص عشوائي بلا معنى. ليس Qwen3-0.6B ولا يقيس جودة أو سرعة النموذج الحقيقي.
الاستخدام: make_tiny_gguf.py <llama.cpp dir> <out.gguf> [n_layer] [n_embd]"""
import sys, numpy as np
llama, out = sys.argv[1], sys.argv[2]
n_layer = int(sys.argv[3]) if len(sys.argv) > 3 else 2
n_embd = int(sys.argv[4]) if len(sys.argv) > 4 else 64
sys.path.insert(0, llama + '/gguf-py')
import gguf
r = gguf.GGUFReader(llama + '/models/ggml-vocab-qwen2.gguf')
def sval(k): f = r.fields[k]; return bytes(f.parts[f.data[0]]).decode()
def uval(k): f = r.fields[k]; return int(f.parts[f.data[0]][0])
def strs(k): f = r.fields[k]; return [bytes(f.parts[i]).decode('utf-8', 'surrogateescape') for i in f.data]
tokens = strs('tokenizer.ggml.tokens'); ttype = [int(r.fields['tokenizer.ggml.token_type'].parts[i][0]) for i in r.fields['tokenizer.ggml.token_type'].data]
merges = strs('tokenizer.ggml.merges'); V = len(tokens)
n_head, n_kv, hd, ff = 4, 2, 32, n_embd * 2
w = gguf.GGUFWriter(out, 'qwen3')
w.add_name('omnillm-tiny-random-qwen3')
w.add_block_count(n_layer); w.add_context_length(4096); w.add_embedding_length(n_embd); w.add_feed_forward_length(ff)
w.add_head_count(n_head); w.add_head_count_kv(n_kv); w.add_key_length(hd); w.add_value_length(hd)
w.add_layer_norm_rms_eps(1e-6); w.add_rope_freq_base(1000000.0); w.add_file_type(gguf.LlamaFileType.ALL_F32)
w.add_tokenizer_model('gpt2'); w.add_tokenizer_pre(sval('tokenizer.ggml.pre'))
w.add_token_list([t.encode('utf-8', 'surrogateescape') if False else t for t in tokens]); w.add_token_types(ttype); w.add_token_merges(merges)
w.add_eos_token_id(uval('tokenizer.ggml.eos_token_id')); w.add_pad_token_id(uval('tokenizer.ggml.padding_token_id'))
w.add_chat_template(sval('tokenizer.chat_template'))
rng = np.random.default_rng(1234)
def t(name, *shape, scale=0.02): w.add_tensor(name, (rng.standard_normal(shape) * scale).astype(np.float32))
def ones(name, n): w.add_tensor(name, np.ones(n, dtype=np.float32))
t('token_embd.weight', V, n_embd); ones('output_norm.weight', n_embd)
for i in range(n_layer):
    p = f'blk.{i}.'
    ones(p + 'attn_norm.weight', n_embd)
    t(p + 'attn_q.weight', n_head * hd, n_embd); t(p + 'attn_k.weight', n_kv * hd, n_embd); t(p + 'attn_v.weight', n_kv * hd, n_embd); t(p + 'attn_output.weight', n_embd, n_head * hd)
    ones(p + 'attn_q_norm.weight', hd); ones(p + 'attn_k_norm.weight', hd)
    ones(p + 'ffn_norm.weight', n_embd)
    t(p + 'ffn_gate.weight', ff, n_embd); t(p + 'ffn_up.weight', ff, n_embd); t(p + 'ffn_down.weight', n_embd, ff)
w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
print('wrote', out)
