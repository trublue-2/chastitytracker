"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Section from "@/app/components/Section";
import Select from "@/app/components/Select";
import Input from "@/app/components/Input";
import Checkbox from "@/app/components/Checkbox";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import FormSuccess from "@/app/components/FormSuccess";
import { useSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { useApiError } from "@/app/hooks/useApiError";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { VISION_PROVIDERS, VISION_PROVIDER_IDS, adminSetsBaseUrl, type VisionProviderId } from "@/lib/vision/providers";
import type { PhotoAnalysisView } from "@/lib/vision/config";
import type { SelfTestResult } from "@/lib/vision/selfTest";

/** Ein Test kann mehrere Modell-Aufrufe dauern — länger als der übliche Client-Timeout. */
const TEST_TIMEOUT_MS = 180_000;

/**
 * Die Foto-Prüfung der Instanz: welcher Anbieter, mit welchem Schlüssel, welchen Modellen.
 *
 * **Nur für Admins sichtbar** (`admin/settings/page.tsx`). Die Route prüft es noch einmal.
 *
 * **Der Schlüssel kommt nie zurück.** Das Feld ist leer; ein hinterlegter Schlüssel zeigt sich nur
 * als seine letzten vier Zeichen. Leer lassen heisst behalten — ein leeres Feld zu speichern darf
 * keinen Schlüssel löschen, den der Admin gar nicht angefasst hat. Löschen ist ein eigenes Häkchen.
 *
 * **Testen vor Speichern.** Der Test läuft mit dem ENTWURF im Formular, nicht mit der gespeicherten
 * Einstellung — wer einen neuen Anbieter ausprobiert, soll die laufende Prüfung dafür nicht erst
 * umstellen müssen.
 */
export default function PhotoAnalysisSettings({ view }: { view: PhotoAnalysisView }) {
  const t = useTranslations("photoAnalysis");
  const locale = useLocale();
  const apiError = useApiError();
  const { saving, save } = useSettingsSave("/api/admin/photo-analysis");

  const [provider, setProvider] = useState<VisionProviderId>(view.provider);
  const [baseUrl, setBaseUrl] = useState(view.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [modelStrong, setModelStrong] = useState(view.modelStrong ?? "");
  const [modelLight, setModelLight] = useState(view.modelLight ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const spec = VISION_PROVIDERS[provider];
  const needsBaseUrl = adminSetsBaseUrl(spec);
  // Beim eigenen Server ist ein Schlüssel möglich (Proxy davor), aber nicht nötig.
  const showKey = spec.needsKey || provider === "ownServer";
  const storedKeyApplies = view.keyLast4 !== null && view.provider === provider;

  function draft() {
    return {
      provider,
      baseUrl: needsBaseUrl ? baseUrl : null,
      // `undefined` = den hinterlegten behalten; nur ein getippter Schlüssel oder das Häkchen ändert ihn.
      apiKey: clearKey ? null : apiKey.trim() ? apiKey : undefined,
      modelStrong: modelStrong || null,
      modelLight: modelLight || null,
    };
  }

  function changeProvider(next: VisionProviderId) {
    setProvider(next);
    setTestResult(null);
    // Modelle gehören zum Anbieter — die von OpenAI taugen bei Mistral nicht. Zurück beim gespeicherten
    // Anbieter kommen dessen Modelle wieder, statt beim Hin- und Herwechseln verloren zu gehen.
    const back = next === view.provider;
    setModelStrong(back ? view.modelStrong ?? "" : "");
    setModelLight(back ? view.modelLight ?? "" : "");
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchWithTimeout("/api/admin/photo-analysis/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft()),
      }, TEST_TIMEOUT_MS);
      if (!res.ok) {
        setTestResult({ ok: false, message: apiError(await parseApiErrorCode(res)) });
        return;
      }
      const r = (await res.json()) as SelfTestResult;
      setTestResult(r.outcome === "ok"
        ? { ok: true, message: t("test.ok", { code: r.detected ?? "" }) }
        : { ok: false, message: t(`test.${r.outcome}`, { detected: r.detected ?? "–", status: r.status ?? "–" }) });
    } catch {
      setTestResult({ ok: false, message: apiError(null) });
    } finally {
      setTesting(false);
    }
  }

  async function submit() {
    if (await save(draft())) {
      setApiKey("");
      setClearKey(false);
    }
  }

  return (
    <Section title={t("settingsTitle")} id="photo-analysis">
      <div className="flex flex-col gap-4">
        <p className="text-fliess text-foreground-muted">{t("settingsIntro")}</p>

        {view.sharedKeyUntil && (
          <p className="text-neben text-warn">
            {t("settingsShared", { date: formatDateTime(new Date(view.sharedKeyUntil), toDateLocale(locale)) })}
          </p>
        )}
        {view.source === "env" && <p className="text-neben text-foreground-faint">{t("settingsFromEnv")}</p>}

        <Select
          label={t("providerLabel")}
          value={provider}
          disabled={saving}
          onChange={(e) => changeProvider(e.target.value as VisionProviderId)}
          options={VISION_PROVIDER_IDS.map((id) => ({ value: id, label: t(`provider.${id}`) }))}
        />

        {provider !== "off" && (
          <>
            <p className="text-neben text-foreground-faint">
              {spec.external ? t("providerExternal") : t("providerOwnServer")}
            </p>

            {needsBaseUrl && (
              <Input
                label={t("baseUrlLabel")}
                hint={t(provider === "ownServer" ? "baseUrlHintOwn" : "baseUrlHintCustom")}
                value={baseUrl}
                disabled={saving}
                inputMode="url"
                autoComplete="off"
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            )}

            {showKey && (
              <>
                <Input
                  label={t("keyLabel")}
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  disabled={saving || clearKey}
                  hint={storedKeyApplies ? t("keyStored", { last4: view.keyLast4! }) : t(spec.needsKey ? "keyNone" : "keyOptional")}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                {storedKeyApplies && (
                  <Checkbox label={t("keyClear")} checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
                )}
              </>
            )}

            <Input
              label={t("modelStrongLabel")}
              hint={spec.models ? t("modelDefault", { model: spec.models.strong }) : t("modelRequired")}
              placeholder={spec.models?.strong}
              value={modelStrong}
              disabled={saving}
              autoComplete="off"
              onChange={(e) => setModelStrong(e.target.value)}
            />
            <Input
              label={t("modelLightLabel")}
              hint={spec.models ? t("modelDefault", { model: spec.models.light }) : t("modelRequired")}
              placeholder={spec.models?.light}
              value={modelLight}
              disabled={saving}
              autoComplete="off"
              onChange={(e) => setModelLight(e.target.value)}
            />

            {/* Auch beim eigenen Server: lokale Modelle haben beliebige Zahlen bestätigt — gerade dort gilt es. */}
            {provider !== "anthropic" && <p className="text-neben text-warn">{t("notClaudeWarning")}</p>}
          </>
        )}

        {testResult && (testResult.ok
          ? <FormSuccess message={testResult.message} variant="inline" />
          : <FormError message={testResult.message} variant="inline" />)}

        <div className="flex flex-wrap gap-3">
          {provider !== "off" && (
            <Button variant="secondary" loading={testing} onClick={runTest}>{t("testButton")}</Button>
          )}
          <Button loading={saving} onClick={submit}>{t("saveButton")}</Button>
        </div>
      </div>
    </Section>
  );
}
