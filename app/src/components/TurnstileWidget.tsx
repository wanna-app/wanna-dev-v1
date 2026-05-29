import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

/**
 * Cloudflare Turnstile, embedded for React Native.
 *
 * Turnstile is web-only, so we host the widget at
 * https://joinwannaapp.com/turnstile (see web/turnstile/index.html) and
 * load it in a WebView. The page bridges the issued token back to us via
 * window.ReactNativeWebView.postMessage as a JSON string:
 *
 *   { type: "turnstile-token",  token }
 *   { type: "turnstile-error",  error }
 *   { type: "turnstile-expired" }
 *
 * Pass the token to Supabase auth calls via options.captchaToken. Supabase
 * verifies it server-side against the Turnstile secret (stored in the
 * project's Auth → Attack Protection config), so we never touch the secret
 * client-side.
 *
 * Usage:
 *   const [captchaToken, setCaptchaToken] = useState<string | null>(null);
 *   <TurnstileWidget onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
 *   // disable submit until captchaToken != null
 */

const WIDGET_URL = "https://joinwannaapp.com/turnstile";

interface Props {
  /** Fired when Turnstile issues a fresh token. */
  onToken: (token: string) => void;
  /** Fired when the token expires (caller should clear stored token). */
  onExpire?: () => void;
  /** Fired on widget/script error with the Turnstile error code. */
  onError?: (code: string) => void;
  style?: ViewStyle;
}

export function TurnstileWidget({ onToken, onExpire, onError, style }: Props) {
  const webviewRef = useRef<WebView>(null);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: { type?: string; token?: string; error?: string; msg?: string };
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      switch (data.type) {
        case "turnstile-token":
          if (data.token) onToken(data.token);
          break;
        case "turnstile-expired":
          onExpire?.();
          break;
        case "turnstile-error":
          if (__DEV__) console.warn("[Turnstile] widget error:", data.error);
          onError?.(data.error ?? "unknown");
          break;
        case "turnstile-debug":
          if (__DEV__) console.warn("[Turnstile] debug:", data.msg);
          break;
      }
    },
    [onToken, onExpire, onError]
  );

  // Capture any in-page JS error and forward it via the bridge so we can
  // see why a blank widget happened (CSP, script-load failure, etc.).
  const injectedJavaScriptBeforeContentLoaded = `
    window.onerror = function (m, src, line) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "turnstile-debug", msg: "JS error: " + m + " @ " + line })
        );
      } catch (e) {}
      return false;
    };
    true;
  `;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        source={{ uri: WIDGET_URL }}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
        onError={(e) => {
          if (__DEV__) console.warn("[Turnstile] WebView error:", e.nativeEvent);
          onError?.("webview-load-failed");
        }}
        onHttpError={(e) => {
          if (__DEV__)
            console.warn("[Turnstile] HTTP error:", e.nativeEvent.statusCode);
          onError?.("http-" + e.nativeEvent.statusCode);
        }}
        style={styles.webview}
        containerStyle={styles.webviewContainer}
        // Turnstile needs JS + the challenges.cloudflare.com iframe.
        javaScriptEnabled
        domStorageEnabled
        // Allow third-party (cloudflare) iframe + storage inside the WebView.
        thirdPartyCookiesEnabled
        // No scrolling/bounce — it's a fixed-size widget.
        scrollEnabled={false}
        bounces={false}
        // Broad whitelist: Turnstile spins up a challenges.cloudflare.com
        // iframe and may redirect; a too-narrow list renders blank.
        originWhitelist={["*"]}
        // iOS: don't let the WebView try to open links in-app.
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 72,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  webview: {
    width: "100%",
    height: 72,
    backgroundColor: "transparent",
  },
  webviewContainer: {
    backgroundColor: "transparent",
  },
  hidden: {
    opacity: 0,
  },
});
