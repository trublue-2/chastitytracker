package ch.chastitytracker.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebView;

import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;

/**
 * Die Android-Hülle — Gegenstück zum `SceneDelegate` in `ios/App/App/AppDelegate.swift`.
 *
 * Gleiches Verhalten wie auf iOS:
 * - Beim ersten Start und nach jeder Rückkehr aus dem Hintergrund liegt der Sperrbildschirm über
 *   der WebView. Beim ersten Start fragt er sofort nach Biometrie/Geräte-PIN, danach auf Knopfdruck.
 * - „Mit Passwort anmelden" löscht das Session-Cookie der Instanz und öffnet deren `/login`.
 * - Ohne eingerichtete Geräte-Sperre gibt es keinen Sperrbildschirm (wie `canEvaluatePolicy`).
 *
 * Android-eigen (kein iOS-Gegenstück nötig):
 * - Eine Kamera- oder Dateiauswahl startet eine fremde Activity und schickt die App dabei in den
 *   Hintergrund. Das sperrt nicht, sonst stünde nach jedem Foto der Sperrbildschirm da (auf iOS
 *   laufen diese Dialoge im Prozess). Bleibt die App länger als `RESULT_GRACE_MS` weg — jemand
 *   verlässt die Kamera Richtung Startbildschirm —, sperrt sie bei der Rückkehr trotzdem.
 * - Der Zurück-Knopf darf bei gesperrtem Bildschirm nicht die WebView dahinter bedienen.
 * - Die Vorschau in der App-Übersicht wird abgeschaltet; auf iOS deckt der Sperrbildschirm sie ab,
 *   weil er schon beim Wechsel in den Hintergrund liegt.
 * - Passkeys: die WebView spricht WebAuthn nur, wenn man es ihr erlaubt (iOS: Associated Domains).
 *   Die Instanz bestätigt die App über `/.well-known/assetlinks.json`.
 */
public class MainActivity extends BridgeActivity {

    /** NextAuth-Session-Cookies (v4/v5, http und `__Secure-`) — dieselbe Liste wie auf iOS. Ein
     *  grosses JWT teilt NextAuth in Stücke (`<name>.0`, `<name>.1` …); die zählen mit. */
    private static final String[] SESSION_COOKIE_NAMES = {
            "next-auth.session-token",
            "__Secure-next-auth.session-token",
            "authjs.session-token",
            "__Secure-authjs.session-token",
    };

    private static final int AUTHENTICATORS =
            BiometricManager.Authenticators.BIOMETRIC_WEAK
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    /** So lange darf eine Kamera-/Dateiauswahl dauern, ohne dass die Rückkehr sperrt. */
    private static final long RESULT_GRACE_MS = 60_000;

    private LockScreenView lockView;
    private BiometricPrompt biometricPrompt;
    private long stoppedAt;
    private boolean biometryAvailable;
    private boolean initialLockShown;
    private boolean isAuthenticating;
    private boolean launchedForResult;
    /** Gesperrt beim Verlassen der App: bei der Rückkehr EINMAL von selbst abfragen (wie iOS). */
    private boolean promptOnResume;

    private final OnBackPressedCallback lockedBack = new OnBackPressedCallback(false) {
        @Override
        public void handleOnBackPressed() {
            moveTaskToBack(true);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Wie auf iOS zeichnet die Seite unter den Systemleisten (capacitor.config.ts → SystemBars).
        // NACH super.onCreate: dort tauscht Capacitor das Splash-Theme aus; davor gerufen, baute
        // EdgeToEdge das Fenster mit dem Splash-Theme samt Titelleiste.
        EdgeToEdge.enable(this);
        biometryAvailable = BiometricManager.from(this).canAuthenticate(AUTHENTICATORS)
                == BiometricManager.BIOMETRIC_SUCCESS;
        // EINMAL in onCreate: androidx hängt den Rückruf an den Lebenszyklus der Activity und stellt
        // ihn nach einer Neuerstellung nur für so gebaute Instanzen wieder her.
        biometricPrompt = new BiometricPrompt(this, ContextCompat.getMainExecutor(this),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        finishAuthentication();
                        hideLockScreen();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        // Abbruch/Fehler: gesperrt bleiben — Entsperren erneut oder Passwort-Weg.
                        finishAuthentication();
                    }
                });
        // Nach super.onCreate registriert → hat Vorrang vor dem Zurück-Handler des App-Plugins.
        getOnBackPressedDispatcher().addCallback(this, lockedBack);
        if (biometryAvailable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(false);
        }
        WebView webView = webView();
        if (webView != null && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(webView.getSettings(),
                    WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP);
        }
        injectBridgeIntoInstances(webView);
    }

    /**
     * Gibt den Instanz-Seiten `window.Capacitor` — ohne halten sie die App für einen Browser (kein
     * Push, keine App-Version, keine Plugins). Capacitor spritzt seine Brücke auf Android nur in den
     * App-Ursprung `https://localhost` ein, nimmt ihre Nachrichten aber auch von den
     * `allowNavigation`-Ursprüngen an; dort fehlt nur das Skript. Dasselbe Skript holen wir über das
     * private `Bridge.getJSInjector` (Reflection). Ohne DOCUMENT_START_SCRIPT spritzt Capacitor
     * selbst über seinen lokalen Server ein.
     */
    private void injectBridgeIntoInstances(@Nullable WebView webView) {
        if (webView == null || bridge == null
                || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        // Auf Ursprünge kürzen: eine Dev-URL mit Pfad wäre als Regel ungültig und kippte die ganze Menge.
        Set<String> origins = new HashSet<>();
        for (String rule : bridge.getAllowedOriginRules()) origins.add(originOf(rule));
        origins.remove(originOf(bridge.getAppUrl())); // hat das Skript schon
        if (origins.isEmpty()) return;
        try {
            Method getInjector = Bridge.class.getDeclaredMethod("getJSInjector");
            getInjector.setAccessible(true);
            Object injector = getInjector.invoke(bridge);
            Method getScript = injector.getClass().getDeclaredMethod("getScriptString");
            getScript.setAccessible(true);
            String script = (String) getScript.invoke(injector);
            WebViewCompat.addDocumentStartJavaScript(webView, script, origins);
        } catch (Exception e) {
            // Laut statt still: ohne Brücke fehlen Push und Plugins auf der Instanz.
            Logger.error("Capacitor-Brücke für die Instanz nicht eingerichtet", e);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        boolean longAway = launchedForResult && SystemClock.elapsedRealtime() - stoppedAt > RESULT_GRACE_MS;
        launchedForResult = false;
        if (!biometryAvailable) return;
        boolean prompt = promptOnResume;
        promptOnResume = false;
        if (!initialLockShown || longAway) {
            initialLockShown = true;
            showLockScreen();
            authenticate();
        } else if (prompt && lockView != null) {
            // Nicht nach der Rückkehr aus der Geräte-PIN (dort sperrt onStop nicht) — sonst Endlosschleife.
            authenticate();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        stoppedAt = SystemClock.elapsedRealtime();
        if (!biometryAvailable || isAuthenticating || launchedForResult || isChangingConfigurations()) return;
        showLockScreen();
        promptOnResume = true;
    }

    /** Jede Activity-for-Result (Kamera, Dateiauswahl, Geräte-PIN) läuft hier durch. */
    @Override
    public void startActivityForResult(@NonNull Intent intent, int requestCode, @Nullable Bundle options) {
        launchedForResult = true;
        super.startActivityForResult(intent, requestCode, options);
    }

    // MARK: - Sperrbildschirm

    private void showLockScreen() {
        if (lockView != null) return;
        LockScreenView view = new LockScreenView(this);
        view.unlockButton.setOnClickListener(v -> authenticate());
        view.passwordButton.setOnClickListener(v -> loginWithPassword());
        addContentView(view, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Fokus und Tastatur weg von der WebView dahinter — sonst bliebe ein fokussiertes Feld
        // (Instanz-Formular, Login) samt Tastatur über dem Sperrbildschirm offen.
        view.requestFocus();
        InputMethodManager imm = getSystemService(InputMethodManager.class);
        if (imm != null) imm.hideSoftInputFromWindow(getWindow().getDecorView().getWindowToken(), 0);
        lockView = view;
        lockedBack.setEnabled(true);
    }

    private void hideLockScreen() {
        LockScreenView view = lockView;
        if (view == null) return;
        lockView = null;
        lockedBack.setEnabled(false);
        view.animate().alpha(0f).setDuration(200).withEndAction(() -> {
            if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        }).start();
    }

    private void authenticate() {
        if (isAuthenticating) return;
        isAuthenticating = true;
        if (lockView != null) lockView.setLoading(true);

        biometricPrompt.authenticate(new BiometricPrompt.PromptInfo.Builder()
                .setTitle(getString(R.string.lock_prompt_title))
                .setAllowedAuthenticators(AUTHENTICATORS)
                // Gesicht entsperrt direkt, ohne zusätzlichen Tipp auf „Bestätigen“.
                .setConfirmationRequired(false)
                .build());
    }

    private void finishAuthentication() {
        isAuthenticating = false;
        if (lockView != null) lockView.setLoading(false);
    }

    // MARK: - Ausweichweg: mit Passwort anmelden

    /**
     * Session-Cookie der Instanz löschen und deren `/login` öffnen. Die Instanz kommt aus der
     * aktuellen WebView-Adresse; steht die WebView noch auf der Hülle (`https://localhost`), aus
     * `ct_instance_url` im localStorage der Hülle — so geht die gewählte Instanz nicht verloren.
     */
    private void loginWithPassword() {
        WebView webView = webView();
        if (webView == null) {
            hideLockScreen();
            return;
        }
        String origin = remoteOrigin(webView.getUrl());
        if (origin != null) {
            openLogin(webView, origin);
            return;
        }
        webView.evaluateJavascript("localStorage.getItem('ct_instance_url')", value -> {
            openLogin(webView, remoteOrigin(decodeJsString(value)));
        });
    }

    private void openLogin(WebView webView, @Nullable String origin) {
        if (origin == null) {
            // Keine Instanz gespeichert — zurück aufs Einrichtungsformular der Hülle.
            webView.evaluateJavascript("window.location.href = '/';", null);
            hideLockScreen();
            return;
        }
        CookieManager cookies = CookieManager.getInstance();
        for (String name : sessionCookiesOf(cookies.getCookie(origin))) {
            cookies.setCookie(origin, name + "=; Max-Age=0; Path=/" + (name.startsWith("__Secure-") ? "; Secure" : ""));
        }
        cookies.flush();
        // Sperrbildschirm erst NACH dem Start der Navigation weg — kein kurzes Aufblitzen des Dashboards.
        webView.evaluateJavascript("window.location.href = " + JSONObject.quote(origin + "/login") + ";", null);
        hideLockScreen();
    }

    /** Die Session-Cookies unter den gesetzten (`getCookie` liefert `a=1; b=2`), samt Stücken. */
    private static java.util.List<String> sessionCookiesOf(@Nullable String header) {
        java.util.List<String> names = new java.util.ArrayList<>();
        if (header == null) return names;
        for (String pair : header.split(";")) {
            String name = pair.split("=", 2)[0].trim();
            for (String base : SESSION_COOKIE_NAMES) {
                if (name.equals(base) || name.startsWith(base + ".")) {
                    names.add(name);
                    break;
                }
            }
        }
        return names;
    }

    /** `scheme://authority` — auch für Capacitors Platzhalter-Regeln wie `https://*.trublue.ch`. */
    private static String originOf(String url) {
        Uri u = Uri.parse(url);
        return u.getScheme() + "://" + u.getAuthority();
    }

    @Nullable
    private WebView webView() {
        return getBridge() != null ? getBridge().getWebView() : null;
    }

    /** `scheme://host[:port]` einer entfernten Instanz, `null` für die Hülle oder Unlesbares. */
    @Nullable
    private static String remoteOrigin(@Nullable String url) {
        if (url == null || url.isEmpty()) return null;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || "localhost".equals(host)) return null;
        if (!"https".equals(scheme) && !"http".equals(scheme)) return null;
        return scheme + "://" + host + (uri.getPort() != -1 ? ":" + uri.getPort() : "");
    }

    /** `evaluateJavascript` liefert das Ergebnis JSON-kodiert (`"…"` oder `null`). */
    @Nullable
    private static String decodeJsString(@Nullable String json) {
        if (json == null || "null".equals(json)) return null;
        try {
            return new JSONArray("[" + json + "]").optString(0, null);
        } catch (JSONException e) {
            return null;
        }
    }
}
