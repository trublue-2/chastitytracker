package ch.chastitytracker.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.graphics.ColorUtils;

/**
 * Der native Sperrbildschirm — Aufbau wie `LockScreenView` in `ios/App/App/AppDelegate.swift`:
 * Schein in der Weltfarbe, Zeichen-Platte mit offenem/geschlossenem Schloss, Titel, Untertitel,
 * gefüllter „Entsperren"-Knopf und der Ausweichweg „Mit Passwort anmelden".
 *
 * Er fängt jede Berührung ab, damit die WebView dahinter unerreichbar bleibt.
 */
final class LockScreenView extends FrameLayout {

    final Button unlockButton;
    final TextView passwordButton;

    LockScreenView(Context context) {
        super(context);
        LockPalette p = LockPalette.current(context);

        setBackgroundColor(p.background);
        setClickable(true);
        setFocusable(true);
        setFocusableInTouchMode(true);

        // Schein hinter dem Zeichen — `--hero-glow`: der Ton der Welt auf 20 %, weich auslaufend.
        View glow = new View(context);
        GradientDrawable glowShape = new GradientDrawable();
        glowShape.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        glowShape.setGradientRadius(dp(230));
        glowShape.setColors(new int[]{ColorUtils.setAlphaComponent(p.accent, 51), Color.TRANSPARENT});
        glow.setBackground(glowShape);

        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);

        // Zeichen-Platte
        FrameLayout plate = new FrameLayout(context);
        GradientDrawable plateShape = new GradientDrawable();
        plateShape.setColor(p.surface);
        plateShape.setCornerRadius(dp(28));
        plateShape.setStroke(dp(1), p.border);
        plate.setBackground(plateShape);
        ImageView icon = new ImageView(context);
        icon.setImageResource(p.closed ? R.drawable.ic_lock_closed : R.drawable.ic_lock_open);
        icon.setColorFilter(p.accent);
        plate.addView(icon, new LayoutParams(dp(32), dp(32), Gravity.CENTER));
        column.addView(plate, new LinearLayout.LayoutParams(dp(80), dp(80)));

        TextView title = new TextView(context);
        title.setText(R.string.lock_title);
        title.setTextColor(p.foreground);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        column.addView(title, margins(20));

        TextView subtitle = new TextView(context);
        subtitle.setText(R.string.lock_subtitle);
        subtitle.setTextColor(p.muted);
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        column.addView(subtitle, margins(6));

        // Hauptknopf (Biometrie / Geräte-PIN) — gefüllte Bedeutungsfläche, Schrift aus `--btn-primary-text`.
        unlockButton = new Button(context);
        unlockButton.setText(R.string.lock_unlock);
        unlockButton.setAllCaps(false);
        unlockButton.setTextColor(p.onAccent);
        unlockButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        unlockButton.setTypeface(unlockButton.getTypeface(), Typeface.BOLD);
        unlockButton.setStateListAnimator(null);
        GradientDrawable buttonShape = new GradientDrawable();
        buttonShape.setColor(p.accent);
        buttonShape.setCornerRadius(dp(14));
        unlockButton.setBackground(buttonShape);
        unlockButton.setPadding(dp(32), dp(14), dp(32), dp(14));
        column.addView(unlockButton, margins(28));

        // Ausweichweg (Anmeldung mit Benutzername/Passwort)
        passwordButton = new TextView(context);
        passwordButton.setText(R.string.lock_password);
        passwordButton.setTextColor(p.faint);
        passwordButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        passwordButton.setPadding(dp(12), dp(8), dp(12), dp(8));
        passwordButton.setClickable(true);
        column.addView(passwordButton, margins(12));

        // Die Spalte steht mittig; die Platte landet damit wie auf iOS rund 100 dp über der Mitte.
        // Der Schein folgt der Platte, nicht der Bildschirmmitte.
        addView(glow, new LayoutParams(dp(460), dp(460), Gravity.CENTER));
        addView(column, new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        column.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            // Mitte der Zeichen-Platte relativ zur Bildschirmmitte → Schein dorthin schieben.
            float plateCenter = t + plate.getTop() + plate.getHeight() / 2f;
            glow.setTranslationY(plateCenter - getHeight() / 2f);
        });
    }

    void setLoading(boolean loading) {
        unlockButton.setEnabled(!loading);
        unlockButton.setAlpha(loading ? 0.4f : 1f);
    }

    private LinearLayout.LayoutParams margins(int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        return lp;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                getResources().getDisplayMetrics()));
    }
}
