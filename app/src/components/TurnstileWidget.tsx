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
  const [loaded, setLoaded] = useState(false);

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
          onError?.(data.error ?? "unknown");
          break;
      }
    },
    [onToken, onExpire, onError]
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        source={{ uri: WIDGET_URL }}
        onMessage={handleMessage}
        onLoadEnd={() => setLoaded(true)}
        // Transparent so the widget blends into the form background.
        style={[styles.webview, !loaded && styles.hidden]}
        containerStyle={styles.webviewContainer}
        // Turnstile needs JS + the challenges.cloudflare.com iframe.
        javaScriptEnabled
        domStorageEnabled
        // No scrolling/bounce — it's a fixed-size widget.
        scrollEnabled={false}
        bounces={false}
        // Keep it lightweight; we don't need back/forward nav etc.
        originWhitelist={[
          "https://joinwannaapp.com",
          "https://challenges.cloudflare.com",
        ]}
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
