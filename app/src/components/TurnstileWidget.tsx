import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
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

// Trailing slash matters — without it, Netlify returns a 301 redirect to
// /turnstile/, and react-native-webview renders the (empty) 301 response
// as a blank page rather than following the redirect cleanly.
// Cache-bust query param forces WKWebView to re-fetch on each remount
// rather than serving a stale cached version of the widget HTML.
const WIDGET_URL = `https://joinwannaapp.com/turnstile/?v=${Date.now()}`;

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
  // TEMPORARY visible debug overlay (revert before launch). Shows what the
  // widget is doing in real time directly on screen — no Metro logs needed.
  const [debugLines, setDebugLines] = useState<string[]>(["mounted, url=" + WIDGET_URL]);
  const pushDebug = useCallback((line: string) => {
    setDebugLines((prev) => [...prev.slice(-6), line]);
  }, []);

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
          pushDebug("token issued ✓");
          break;
        case "turnstile-expired":
          onExpire?.();
          pushDebug("token expired");
          break;
        case "turnstile-error":
          if (__DEV__) console.warn("[Turnstile] widget error:", data.error);
          onError?.(data.error ?? "unknown");
          pushDebug("widget error: " + data.error);
          break;
        case "turnstile-debug":
          if (__DEV__) console.warn("[Turnstile] debug:", data.msg);
          pushDebug("debug: " + data.msg);
          break;
      }
    },
    [onToken, onExpire, onError, pushDebug]
  );

  // Capture any in-page JS error AND emit periodic state pings so we can
  // see whether the page is even running our script (vs blank load).
  const injectedJavaScriptBeforeContentLoaded = `
    window.onerror = function (m, src, line) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "turnstile-debug", msg: "JS error: " + m + " @ " + line })
        );
      } catch (e) {}
      return false;
    };
    // Heartbeat: confirm the page reached this point.
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "turnstile-debug", msg: "page-script-start" }));
    } catch (e) {}
    // After 1.5s, report what we see.
    setTimeout(function () {
      try {
        var has = typeof window.turnstile;
        var children = document.getElementById("turnstile-container");
        var inner = children ? children.children.length : -1;
        var bg = getComputedStyle(document.body).backgroundColor;
        var widget = children && children.children[0];
        var widgetRect = widget && widget.getBoundingClientRect ? widget.getBoundingClientRect() : null;
        var widgetSize = widgetRect ? widgetRect.width + "x" + widgetRect.height : "no-rect";
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "turnstile-debug",
          msg: "1.5s: ts=" + has + " ch=" + inner + " bg=" + bg + " size=" + widgetSize + " path=" + window.location.pathname
        }));
      } catch (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "turnstile-debug", msg: "1.5s probe threw: " + e }));
      }
    }, 1500);
    true;
  `;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        source={{ uri: WIDGET_URL }}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
        onLoadStart={() => pushDebug("loadStart")}
        onLoadEnd={() => pushDebug("loadEnd")}
        onError={(e) => {
          if (__DEV__) console.warn("[Turnstile] WebView error:", e.nativeEvent);
          onError?.("webview-load-failed");
          pushDebug("WV error: " + (e.nativeEvent.description || "unknown"));
        }}
        onHttpError={(e) => {
          if (__DEV__)
            console.warn("[Turnstile] HTTP error:", e.nativeEvent.statusCode);
          onError?.("http-" + e.nativeEvent.statusCode);
          pushDebug("HTTP " + e.nativeEvent.statusCode);
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
        // Bypass cache while we debug visibility.
        cacheEnabled={false}
        incognito
        // NOTE: opaque={false} removed — on this RN-WebView version it
        // appears to render the WebView fully invisible instead of just
        // alpha-blended. We rely on the page itself having an opaque
        // background (set in web/turnstile/index.html) for contrast.
      />
      {/* TEMPORARY visible debug — pink box = WebView area; text = events. */}
      <View style={styles.debugOverlay} pointerEvents="none">
        {debugLines.map((line, i) => (
          <Text key={i} style={styles.debugText}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Tall enough for the widget (~78px) + the debug overlay below
    // (kept temporarily so visibility can be confirmed).
    height: 190,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  webview: {
    width: "100%",
    height: 78,
    backgroundColor: "transparent",
  },
  webviewContainer: {
    backgroundColor: "transparent",
  },
  hidden: {
    opacity: 0,
  },
  debugOverlay: {
    width: "100%",
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  debugText: {
    fontSize: 10,
    color: "#444",
    fontFamily: "Menlo",
  },
});
