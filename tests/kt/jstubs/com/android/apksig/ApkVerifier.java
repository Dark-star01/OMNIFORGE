package com.android.apksig; import java.io.File; import java.security.cert.X509Certificate; import java.util.List;
public class ApkVerifier { public Result verify() throws java.io.IOException, com.android.apksig.apk.ApkFormatException, java.security.NoSuchAlgorithmException { return null; }
 public static class IssueWithParams { public String toString(){return "";} }
 public static class Result { public boolean isVerified(){return false;} public boolean isVerifiedUsingV1Scheme(){return false;} public boolean isVerifiedUsingV2Scheme(){return false;} public boolean isVerifiedUsingV3Scheme(){return false;} public List<X509Certificate> getSignerCertificates(){return null;} public List<IssueWithParams> getErrors(){return null;} public List<IssueWithParams> getWarnings(){return null;} }
 public static class Builder { public Builder(File f){} public Builder setMinCheckedPlatformVersion(int v){return this;} public ApkVerifier build(){return null;} } }
