"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Card from "@/app/components/Card";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import { toDatetimeLocal, toDateLocale, formatDuration, APP_TZ } from "@/lib/utils";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import type { WearBeginPayload, WearEndPayload, SubmitResult } from "@/app/entries/types";

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface DeviceOption {
  id: string;
  name: string;
}

interface ActiveSession {
  deviceId: string;
  deviceName: string;
  since: string; // ISO
}

interface EditInitial {
  id: string;
  startTime: string; // ISO
  note: string | null;
  deviceId: string | null;
}

interface Props {
  kind: "begin" | "end";
  category: Category;
  /** WEAR_BEGIN only — devices the user can pick from (filtered to the category). */
  devices?: DeviceOption[];
  /** WEAR_END only — the active session being closed. */
  activeSession?: ActiveSession;
  /** Admin mode: target userId. Switches POST to /api/admin/entries with userId in body. */
  adminUserId?: string;
  /** Where to navigate on success (defaults to /dashboard, admin-mode should pass /admin/users/[id]/aktionen). */
  redirectTo?: string;
  /** Edit-mode: existing entry to update (PATCH instead of POST). When set, deviceId is locked. */
  initial?: EditInitial;
  /** Earliest allowed startTime (anti-cheat for non-admin edits). Maps to <input min="...">. */
  minTime?: string;
  /** Latest allowed startTime (anti-cheat for non-admin edits). Maps to <input max="...">. */
  maxTime?: string;
}

export default function WearForm({ kind, category, devices, activeSession, adminUserId, redirectTo, initial, minTime, maxTime }: Props) {
  const t = useTranslations("wearForm");
  const tCommon = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const dl = toDateLocale(useLocale());
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const isEdit = !!initial;

  const [startTime, setStartTime] = useState(
    initial ? toDatetimeLocal(initial.startTime) : toDatetimeLocal(new Date()),
  );
  const [deviceId, setDeviceId] = useState<string>(
    initial?.deviceId
      ?? (kind === "end" ? activeSession?.deviceId ?? "" : devices?.[0]?.id ?? ""),
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && !deviceId) {
      setError(t("deviceRequired"));
      return;
    }
    setSaving(true);
    setError("");

    const target = redirectTo ?? "/dashboard";

    // Edit-mode: PATCH with the editable subset (startTime + note, plus deviceId for WEAR_BEGIN).
    if (isEdit && initial) {
      const patchBody: Record<string, unknown> = {
        startTime: new Date(startTime).toISOString(),
        note: note.trim() || null,
      };
      if (kind === "begin") patchBody.deviceId = deviceId;
      const res = await fetch(`/api/entries/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data?.error || tCommon("savingError"));
        setSaving(false);
        return;
      }
      toast.success(tDash("entryUpdated"));
      router.push(target);
      return;
    }

    // Create-mode: POST a full payload (with offline-queue support for user-mode).
    const payload: WearBeginPayload | WearEndPayload = {
      type: kind === "begin" ? "WEAR_BEGIN" : "WEAR_END",
      startTime: new Date(startTime).toISOString(),
      deviceId,
      imageUrl: null,
      imageExifTime: null,
      note: note.trim() || null,
    };

    const targetUrl = adminUserId ? "/api/admin/entries" : "/api/entries";
    const body = adminUserId ? { userId: adminUserId, ...payload } : payload;
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    // Admin uses direct fetch (no offline queue — action is admin-driven, not field-use)
    const res = adminUserId
      ? await fetch(targetUrl, init)
      : await offlineFetch(targetUrl, init);
    if (res === null) {
      // queued offline (user-mode only)
      toast.success(tDash("entrySaved"));
      window.location.href = target;
      return;
    }
    if (!res.ok) {
      const data: SubmitResult | { error?: string } = await res.json().catch(() => ({}));
      setError(("error" in data && data.error) || tCommon("savingError"));
      setSaving(false);
      return;
    }
    toast.success(tDash("entrySaved"));
    window.location.href = target;
  }

  const style = categoryStyle(category.color);

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        {/* Category header */}
        <div className="flex items-center gap-3">
          <div
            className="size-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: style.backgroundColor, color: style.color }}
            aria-hidden
          >
            <CategoryIconRender name={category.icon} className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-foreground-muted">{category.name}</p>
            <h2 className="text-base font-semibold">{kind === "begin" ? t("titleBegin") : t("titleEnd")}</h2>
          </div>
        </div>

        {/* Active session info (WEAR_END) */}
        {kind === "end" && activeSession && (
          <div className="text-sm text-foreground-muted bg-background-subtle rounded-lg px-3 py-2">
            {t("endingSession", {
              device: activeSession.deviceName,
              duration: formatDuration(new Date(activeSession.since), new Date(startTime), dl.startsWith("en") ? "en" : "de"),
            })}
          </div>
        )}

        {/* Device picker (WEAR_BEGIN, only when devices are passed — edit-mode without a list locks deviceId). */}
        {kind === "begin" && devices && devices.length > 0 && (
          <Select
            label={t("device")}
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            required
            disabled={saving}
            options={devices.map((d) => ({ value: d.id, label: d.name }))}
          />
        )}

        <DateTimePicker
          label={t("time")}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          min={minTime}
          max={maxTime ?? toDatetimeLocal(new Date())}
          required
          disabled={saving}
          hint={`${t("timezone")}: ${APP_TZ}`}
        />

        <Textarea
          label={t("note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          disabled={saving}
        />

        <RequiredHint />

        {error && <FormError message={error} />}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" fullWidth onClick={() => router.push("/dashboard")} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" variant="primary" fullWidth loading={saving}>
            {tCommon("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
