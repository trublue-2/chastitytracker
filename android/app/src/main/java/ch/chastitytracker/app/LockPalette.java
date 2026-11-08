package ch.chastitytracker.app;

import android.content.Context;

/**
 * Die Farbwelt des Sperrbildschirms — dieselben drei wie in der App (`src/lib/theme.ts`) und wie
 * `LockPalette` in `ios/App/App/AppDelegate.swift`.
 *
 * Der Bildschirm liegt VOR der WebView und kann den Zustand nicht erfragen. Er liest ihn als
 * hinterlegten Wert, den die App beim letzten Lauf geschrieben hat (`src/lib/nativeWorld.ts`,
 * Capacitor Preferences → SharedPreferences-Datei `CapacitorStorage`, Schlüssel `world`). Fehlt er,
 * gilt `sub-open`.
 *
 * Die Farbwerte stehen als `0xrrggbb`, Zeichen für Zeichen wie die Tokens in `src/app/globals.css`.
 * `src/lib/nativeParity.test.ts` liest diese Datei, die Swift-Seite und das Blatt und scheitert,
 * sobald eine Welt oder ein Ton auseinanderläuft.
 */
final class LockPalette {

    final int background;
    final int surface;
    final int border;
    final int foreground;
    final int muted;
    final int faint;
    final int accent;     // --btn-primary-bg: der Ton, den die Welt trägt
    final int onAccent;   // --btn-primary-text: was auf einer gefüllten Fläche lesbar ist
    final boolean closed; // verschlossen? entscheidet über das Zeichen, nicht über die Farbe

    private LockPalette(int background, int surface, int border, int foreground, int muted,
                        int faint, int accent, int onAccent, boolean closed) {
        this.background = opaque(background);
        this.surface = opaque(surface);
        this.border = opaque(border);
        this.foreground = opaque(foreground);
        this.muted = opaque(muted);
        this.faint = opaque(faint);
        this.accent = opaque(accent);
        this.onAccent = opaque(onAccent);
        this.closed = closed;
    }

    private static int opaque(int rgb) {
        return 0xff000000 | rgb;
    }

    static LockPalette current(Context context) {
        String world = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                .getString("world", "");
        switch (world != null ? world : "") {
            case "sub-locked": // Träger, verschlossen — Grün
                return new LockPalette(
                        0x060907, 0x0e130f, 0x2a302b, 0xf5fbf7, 0xb7c6bd, 0x88958a,
                        0x34d399, 0x2b0410, true);
            case "keyholder": // Keyholder-Bereich — Indigo
                return new LockPalette(
                        0x070810, 0x0f1119, 0x2c2e3a, 0xf4f5fb, 0xbcbed3, 0x8c8ea6,
                        0x8f88ff, 0x2b0410, true);
            default: // "sub-open" und alles Unbekannte — die Rose
                return new LockPalette(
                        0x0b0609, 0x140d10, 0x332a2e, 0xfdf7f8, 0xc9b7bd, 0x9a868e,
                        0xff3d68, 0x2b0410, false);
        }
    }
}
