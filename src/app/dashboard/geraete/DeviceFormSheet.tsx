"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import PhotoCapture from "@/app/components/PhotoCapture";
import useToast from "@/app/hooks/useToast";
import { compressImage } from "@/lib/compressImage";
import { VALID_CURRENCIES } from "@/lib/constants";
import type { DeviceRow } from "./DevicesClient";

const CURRENCY_OPTIONS = VALID_CURRENCIES.map((c) => ({ value: c, label: c }));

interface Props {
  onClose: () => void;
  onSaved: () => void;
  device: DeviceRow | null;
  /** Set when admin creates device for another user */
  userId?: string;
}

export default function DeviceForm({ onClose, onSaved, device, userId }: Props) {
  const t = useTranslations("devices");
  const tCommon = useTranslations("common");
  const toast = useToast();

  const [name, setName] = useState(device?.name ?? "");
  const [description, setDescription] = useState(device?.description ?? "");
  const [imageUrl, setImageUrl] = useState(device?.imageUrl ?? "");
  const [imagePreview, setImagePreview] = useState(device?.imageUrl ?? "");
  const [price, setPrice] = useState(device?.purchasePrice != null ? String(device.purchasePrice) : "");
  const [currency, setCurrency] = useState(device?.currency ?? "CHF");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Focus name field on mount
  useEffect(() => {
    const el = document.getElementById("device-name");
    el?.focus();
  }, []);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      setImageUrl(data.url);
      setImagePreview(URL.createObjectURL(file));
    } catch {
      setError(tCommon("networkError"));
    }
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");

    const parsedPrice = price.trim() ? parseFloat(price) : null;
    if (parsedPrice !== null && (isNaN(parsedPrice) || parsedPrice < 0)) {
      setError(t("purchasePrice") + ": " + tCommon("error"));
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      imageUrl: imageUrl || null,
      purchasePrice: parsedPrice,
      currency: parsedPrice !== null ? currency : null,
    };
    if (userId) payload.userId = userId;

    try {
      const url = device ? `/api/devices/${device.id}` : "/api/devices";
      const res = await fetch(url, {
        method: device ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || tCommon("savingError"));
        setSaving(false);
        return;
      }

      toast.success(device ? t("updated") : t("saved"));
      setSaving(false);
      onSaved();
    } catch {
      setSaving(false);
      setError(tCommon("networkError"));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">
        {device ? t("editDevice") : t("addDevice")}
      </h2>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            id="device-name"
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={60}
            required
          />

          <Textarea
            label={t("description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            rows={2}
          />

          {/* Photo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">{t("photo")}</label>
            {imagePreview ? (
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt={name} className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" compact />
                  <button
                    type="button"
                    onClick={() => { setImageUrl(""); setImagePreview(""); }}
                    className="text-xs text-warn hover:opacity-80 w-fit transition"
                  >
                    {tCommon("removePhoto")}
                  </button>
                </div>
              </div>
            ) : (
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" />
            )}
          </div>

          {/* Price + Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label={t("purchasePrice")}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t("pricePlaceholder")}
              />
            </div>
            <div className="w-24">
              <Select
                label={t("currency")}
                options={CURRENCY_OPTIONS}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
          </div>

          <FormError message={error} />

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" variant="primary" fullWidth loading={saving || uploading}>
              {device ? tCommon("update") : tCommon("save")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
