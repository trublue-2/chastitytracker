// Native (Capacitor) Push-Logik — getrennt von der UI (PushManager). Alle Capacitor-Module werden
// dynamisch importiert, damit nichts auf dem Server oder im reinen Browser ohne Bridge läuft.

// ---------------------------------------------------------------------------
// Capacitor Preferences — ein get/set für alle Keys (set(null) = remove).
// ---------------------------------------------------------------------------
async function prefGet(key: string): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key })).value ?? null;
  } catch {
    return null;
  }
}
async function prefSet(key: string, value: string | null): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    if (value === null) await Preferences.remove({ key });
    else await Preferences.set({ key, value });
  } catch {
    /* ignore — Push funktioniert weiter, nur ohne Persistenz */
  }
}

// Der gespeicherte Token IST der Registrierungs-Zustand — kein separates Flag (sonst zwei Quellen
// für eine Wahrheit, die auseinanderlaufen können). Vorhanden = Push für dieses Gerät aktiv.
const NATIVE_PUSH_TOKEN = "pushToken";

export async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Ist auf diesem Gerät ein Push-Token registriert? (Aus dem gespeicherten Token abgeleitet.) */
export async function isNativePushRegistered(): Promise<boolean> {
  return (await prefGet(NATIVE_PUSH_TOKEN)) !== null;
}

type RegisterResult = { ok: boolean; reason?: "denied" | "timeout" | "error" | "subscribe-failed" | "not-native"; detail?: string };

export async function registerNativePush(): Promise<RegisterResult> {
  try {
    return await doRegisterNativePush();
  } catch (err) {
    // Plugin-Import / checkPermissions / register() können werfen (z.B. fehlendes aps-environment-
    // Entitlement) → sauber als Fehler mit Klartext zurückgeben statt die Exception durchzureichen.
    console.error("[nativePush] register threw", err);
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}

async function doRegisterNativePush(): Promise<RegisterResult> {
  const [{ PushNotifications }, { Capacitor }] = await Promise.all([
    import("@capacitor/push-notifications"),
    import("@capacitor/core"),
  ]);
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: "not-native" };

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, reason: "denied" };

  // Genau EINE Auflösung garantieren: der Gesamt-Timeout deckt Registrierung UND Subscribe ab, der
  // fetch hat ein eigenes Limit, Listener werden gezielt entfernt (nicht removeAllListeners → würde
  // den Tap-Handler aus NativePushRouter killen). Sonst bliebe der Toggle bei hängendem fetch disabled.
  let settled = false;
  let resolveFn: (r: RegisterResult) => void;
  const done = new Promise<RegisterResult>((res) => { resolveFn = res; });

  const regHandle = await PushNotifications.addListener("registration", async (tok) => {
    try {
      const res = await fetch("/api/push/native-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok.value, platform: Capacitor.getPlatform() }),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        await prefSet(NATIVE_PUSH_TOKEN, tok.value);
        finish({ ok: true });
      } else {
        console.error("[nativePush] native-subscribe failed", res.status);
        finish({ ok: false, reason: "subscribe-failed" });
      }
    } catch (err) {
      console.error("[nativePush] native-subscribe error", err);
      finish({ ok: false, reason: "subscribe-failed" });
    }
  });
  const errHandle = await PushNotifications.addListener("registrationError", (err) => {
    console.error("[nativePush] APNs registration error", err);
    finish({ ok: false, reason: "error" });
  });
  const timeout = setTimeout(() => finish({ ok: false, reason: "timeout" }), 15_000);

  function finish(r: RegisterResult) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    regHandle.remove();
    errHandle.remove();
    resolveFn(r);
  }

  await PushNotifications.register();
  return done;
}

export async function unregisterNativePush(): Promise<void> {
  // Import, Token-Lesen sind unabhängig → parallel. Token serverseitig abmelden (gezielt; fehlt der
  // lokale Token, entfernt der Server alle des Nutzers).
  const [{ PushNotifications }, token] = await Promise.all([
    import("@capacitor/push-notifications"),
    prefGet(NATIVE_PUSH_TOKEN),
  ]);
  await PushNotifications.removeAllDeliveredNotifications();
  await fetch("/api/push/native-subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token ? { token } : {}),
  }).catch((err) => console.error("[nativePush] native-unsubscribe failed", err));
  await prefSet(NATIVE_PUSH_TOKEN, null);
}
