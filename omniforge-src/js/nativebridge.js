/* جسر OmniNative: مساعدات الواجهة للتعامل مع البلاجن الأصلي (يعمل داخل APK فقط). */
(function (root) {
  'use strict';
  const NAT = {};
  NAT.plugin = () => { try { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.OmniNative || null; } catch (e) { return null; } };
  NAT.available = () => !!NAT.plugin();
  NAT.save = () => { try { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.OmniSave || null; } catch (e) { return null; } };
  NAT.media = () => { try { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.OmniMedia || null; } catch (e) { return null; } };
  NAT.listen = async (plugin, event, cb) => { if (!plugin || !plugin.addListener) return () => {}; try { const h = await plugin.addListener(event, cb); return () => { try { h && h.remove && h.remove(); } catch (e) {} }; } catch (e) { return () => {}; } };
  NAT.on = async (event, cb) => { const p = NAT.plugin(); if (!p || !p.addListener) return () => {}; try { const h = await p.addListener(event, cb); return () => { try { h && h.remove && h.remove(); } catch (e) {} }; } catch (e) { return () => {}; } };
  const MSG = { CANCELLED: 'أُلغيت العملية', INVALID: 'مدخلات غير صالحة', NXDOMAIN: 'الاسم غير موجود', PERMISSION: 'لا صلاحية للوصول إلى هذا المجلد', INCOMPLETE: 'انقطع التنزيل — الجزء المنزّل محفوظ، اضغط «نزّل» مجدداً للاستئناف', NETWORK: 'تعذّر الاتصال بالخادم', SIGN_FAILED: 'فشل التوقيع', VERIFY_FAILED: 'فشل التحقق', BAD_URL: 'يُسمح فقط بروابط http/https', RANGE_RESET: 'تغيّر الملف على الخادم؛ أعد المحاولة للبدء من جديد', EXISTS: 'الملف موجود مسبقاً', FFMPEG_MISSING: 'محرك FFmpeg غير متاح في هذا التطبيق', FFMPEG_FAILED: 'فشل FFmpeg' };
  NAT.errorText = e => { const code = e && (e.code || e.errorCode); const m = (e && e.message) || String(e); return (code && MSG[code]) ? MSG[code] + (m && m !== code && !/^HTTP /.test(code) ? ' (' + m + ')' : '') : (/^HTTP_\d+$/.test(code || '') ? 'الخادم أعاد ' + code.replace('HTTP_', 'HTTP ') : m); };
  NAT.isCancel = e => !!e && (e.code === 'CANCELLED' || /^CANCELLED$/.test(e.message || ''));
  NAT.job = async () => (await NAT.plugin().job()).dir;
  NAT.cleanup = async dir => { try { await NAT.plugin().cleanup({ dir }); } catch (e) { /* أفضل جهد */ } };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  // ينقل Blob إلى مجلد العمل على دفعات (3MB). يرجع المسار.
  NAT.stage = async (blob, dir, name, onProgress, shouldCancel) => {
    const p = NAT.plugin(); const { id, path } = await p.stageBegin({ dir, name }); const CH = 3 * 1048576;
    try { for (let off = 0; off < blob.size; off += CH) { if (shouldCancel && shouldCancel()) throw Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' }); const u8 = new Uint8Array(await blob.slice(off, off + CH).arrayBuffer()); await p.stageChunk({ id, data: b64(u8) }); onProgress && onProgress(Math.min(blob.size, off + CH), blob.size); }
      await p.stageEnd({ id }); return path; } catch (e) { try { await p.stageEnd({ id }); } catch (x) {} throw e; }
  };
  NAT.saveFromPath = async (path, name, mime, deleteSource) => { const s = NAT.save(); if (!s || !s.saveFromPath) throw new Error('OmniSave.saveFromPath غير متاح'); return s.saveFromPath({ path, name, mime: mime || 'application/octet-stream', deleteSource: deleteSource !== false }); };
  if (typeof module !== 'undefined' && module.exports) module.exports = NAT; else { root.OF = root.OF || {}; root.OF.nat = NAT; }
})(typeof window !== 'undefined' ? window : globalThis);
