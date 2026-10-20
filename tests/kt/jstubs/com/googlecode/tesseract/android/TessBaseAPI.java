package com.googlecode.tesseract.android;
/* مجسّم لواجهة Tesseract4Android المستخدمة فقط (للتحقق من الأنواع، لا للتشغيل). */
public class TessBaseAPI {
    public static final class PageSegMode { public static final int PSM_AUTO = 3, PSM_SINGLE_BLOCK = 6, PSM_SINGLE_LINE = 7; }
    public boolean init(String dataPath, String language) { return true; }
    public void setPageSegMode(int mode) {}
    public void setImage(android.graphics.Bitmap bmp) {}
    public String getUTF8Text() { return ""; }
    public int meanConfidence() { return 0; }
    public void recycle() {}
}
