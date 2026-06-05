import React, { useCallback, useRef } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

/**
 * Cloudflare Turnstile, embedded for React Native.
 *
 * Turnstile is web-only, so we host the widget at
 * https://joinwannaapp.com/turnstile/ (see web/turnstile/index.html) and
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

// Trailing slash matters — without it, Netlify returns a 301 redirect to
// /turnstile/, and react-native-webview renders the (empty) 301 response
// as a blank page rather than following the redirect cleanly.
const WIDGET_URL = "https://joinwannaapp.com/turnstile/";

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
      let data: { type?: string; token?: string; error?: string };
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
      }
    },
    [onToken, onExpire, onError]
  );

  // Forward any in-page JS error to the bridge so we don't miss silent
  // failures (CSP, script-load issues, etc.) in production.
  const injectedJavaScriptBeforeContentLoaded = `
    window.onerror = function (m, src, line) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "turnstile-error", error: "js: " + m + " @ " + line })
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
        // Turnstile needs JS + the challenges.cloudflare.com iframe.
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        // No scrolling/bounce — it's a fixed-size widget.
        scrollEnabled={false}
        bounces={false}
        // Broad whitelist so Turnstile's challenges.cloudflare.com iframe
        // can load + redirect cleanly.
        originWhitelist={["*"]}
        // iOS: don't let the WebView try to open links in-app.
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // ~90pt tall: enough for the 65px Turnstile widget plus a bit of breathing
  // room. Centered horizontally inside whatever parent it's placed in.
  container: {
    height: 90,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  // Explicit width matters: width: "100%" inside the centered flex parent
  // was collapsing the WebView's iOS frame so its content never reached
  // the screen, even though the page rendered correctly internally.
  // 320pt comfortably contains the 300pt Turnstile widget on every iPhone.
  webview: {
    width: 320,
    height: 78,
    backgroundColor: "transparent",
  },
});
