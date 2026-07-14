"use client";

import { parseApiError } from "@/lib/apiClient";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import useToast from "@/app/hooks/useToast";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_COLOR_HEX,
  CATEGORY_NAME_MAX_LENGTH,
  DEFAULT_USER_CATEGORY_COLOR,
  DEFAULT_USER_CATEGORY_ICON,
  isValidCategoryColor,
  isValidCategoryIcon,
  type CategoryColor,
  type CategoryIcon,
} from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import Toggle from "@/app/components/Toggle";
import type { CategoryRow } from "./CategoriesClient";

interface Props {
  category: CategoryRow | null;
  onClose: () => void;
  onSaved: () => void;
  /** Admin mode: target userId is included in the POST body (admin creates for this user). */
  userId?: string;
}

export default function CategoryFormSheet({ category, onClose, onSaved, userId }: Props) {
  const t = useTranslations("categories");
  const tCommon = useTranslations("common");
  const toast = useToast();

  const isEdit = !!category;

  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState<CategoryColor>(
    isValidCategoryColor(category?.color) ? category.color : DEFAULT_USER_CATEGORY_COLOR,
  );
  const [icon, setIcon] = useState<CategoryIcon>(
    isValidCategoryIcon(category?.icon) ? category.icon : DEFAULT_USER_CATEGORY_ICON,
  );
  const [trackingEnabled, setTrackingEnabled] = useState<boolean>(
    category?.trackingEnabled ?? true,
  );
  const [requirePhoto, setRequirePhoto] = useState<boolean>(category?.requirePhoto ?? false);
  const [allowVorgaben, setAllowVorgaben] = useState<boolean>(category?.allowVorgaben ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.getElementById("category-name")?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    setSaving(true);
    setError("");

    const payload: Record<string, unknown> = {
      name: name.trim(),
      color,
      icon,
      trackingEnabled,
      requirePhoto,
      allowVorgaben,
    };
    if (userId) payload.userId = userId;
    const url = isEdit ? `/api/categories/${category!.id}` : "/api/categories";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await parseApiError(res, tCommon("savingError")));
        setSaving(false);
        return;
      }
      toast.success(isEdit ? t("savedToast") : t("createdToast"));
      onSaved();
    } catch {
      setError(tCommon("networkError"));
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <h2 className="text-lg font-semibold">{isEdit ? t("editTitle") : t("createTitle")}</h2>

        <Input
          id="category-name"
          label={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          required
          disabled={saving}
        />

        {/* Color picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            {t("color")}
          </label>
          <div className="grid grid-cols-6 gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                disabled={saving}
                aria-label={c}
                aria-pressed={color === c}
                className={`size-10 rounded-lg border-2 transition ${
                  color === c ? "border-foreground" : "border-transparent hover:border-border"
                }`}
                style={{ backgroundColor: CATEGORY_COLOR_HEX[c] }}
              />
            ))}
          </div>
        </div>

        {/* Icon picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            {t("icon")}
          </label>
          <div className="grid grid-cols-5 gap-2">
            {CATEGORY_ICONS.map((iconName) => (
              <button
                key={iconName}
                type="button"
                onClick={() => setIcon(iconName)}
                disabled={saving}
                aria-label={iconName}
                aria-pressed={icon === iconName}
                className={`size-12 rounded-lg flex items-center justify-center border-2 transition ${
                  icon === iconName
                    ? "border-foreground bg-background-subtle"
                    : "border-border hover:border-foreground-muted"
                }`}
              >
                <CategoryIconRender name={iconName} className="size-5 text-foreground" />
              </button>
            ))}
          </div>
        </div>

        {/* Tracking toggle — when off, this category is inventory-only (no wear sessions). */}
        <div className="flex flex-col gap-3 pt-3 border-t border-border-subtle">
          <div className="flex flex-col gap-1.5">
            <Toggle
              label={t("trackingEnabled")}
              checked={trackingEnabled}
              onChange={setTrackingEnabled}
              disabled={saving}
            />
            <p className="text-xs text-foreground-faint">{t("trackingEnabledHint")}</p>
          </div>

          {/* Photo-required toggle — only meaningful when tracking is enabled. */}
          <div className="flex flex-col gap-1.5">
            <Toggle
              label={t("requirePhoto")}
              checked={requirePhoto}
              onChange={setRequirePhoto}
              disabled={saving || !trackingEnabled}
            />
            <p className="text-xs text-foreground-faint">{t("requirePhotoHint")}</p>
          </div>

          {/* Allow training-goals on this category */}
          <div className="flex flex-col gap-1.5">
            <Toggle
              label={t("allowVorgaben")}
              checked={allowVorgaben}
              onChange={setAllowVorgaben}
              disabled={saving || !trackingEnabled}
            />
            <p className="text-xs text-foreground-faint">{t("allowVorgabenHint")}</p>
          </div>
        </div>

        {error && <FormError message={error} />}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" fullWidth onClick={onClose} disabled={saving}>
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
