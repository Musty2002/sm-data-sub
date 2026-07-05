# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Capacitor specific rules
# See https://capacitorjs.com/docs/android/deployment#proguard-rules

-dontwarn com.google.android.material.**
-keep class androidx.appcompat.app.AppCompatDelegateImpl { *; }

# Capacitor/Cordova plugins
-keep public class * extends org.apache.cordova.CordovaPlugin {
    public *;
}
-keep public class * extends com.getcapacitor.Plugin {
    public *;
}

# Keep plugin specific annotations and classes
-keep class com.getcapacitor.annotation.** { *; }
-keepclassmembers,allowobfuscation class * {
    @com.getcapacitor.annotation.CapacitorPlugin <methods>;
}
-keepclassmembers,allowobfuscation class * {
    @com.getcapacitor.annotation.PluginMethod <methods>;
}
-keepnames class * implements com.getcapacitor.JSExportable

# Keep annotations
-keepattributes *Annotation*
