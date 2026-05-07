"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import Badge from "@/app/components/Badge";
import ActionModal from "@/app/components/ActionModal";
import useToast from "@/app/hooks/useToast";
import { CATEGORY_COLOR_HEX, type CategoryColor } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import CategoryFormSheet from "./CategoryFormSheet";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  isBuiltIn: boolean;
  trackingEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  deviceCount: number;
  vorgabeCount: number;
}

interface Props {
  categories: CategoryRow[];
}

export default function CategoriesClient({ categories: initial }: Props) {
  const t = useTranslations("categories");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const toast = useToast();

  const [formMode, setFormMode] = useState<"closed" | "add" | "edit">("closed");
  const [editCategory, setEditCategory] = useState<CategoryRow | null>(null);
  const [deleteModal, setDeleteModal] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openAdd() {
    setEditCategory(null);
    setFormMode("add");
  }

  function openEdit(c: CategoryRow) {
    setEditCategory(c);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode("closed");
    setEditCategory(null);
  }

  function handleSaved() {
    closeForm();
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/categories/${deleteModal.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || tCommon("error"));
        setDeleting(false);
        return;
      }
      toast.success(t("deletedToast"));
      setDeleteModal(null);
      setDeleting(false);
      router.refresh();
    } catch {
      toast.error(tCommon("networkError"));
      setDeleting(false);
    }
  }

  // ── Inline form view (add/edit) ──
  if (formMode !== "closed") {
    return (
      <>
        <button
          type="button"
          onClick={closeForm}
          className="text-sm text-foreground-faint hover:text-foreground-muted transition"
        >
          ← {t("title")}
        </button>
        <div className="mt-4">
          <CategoryFormSheet category={editCategory} onClose={closeForm} onSaved={handleSaved} />
        </div>
      </>
    );
  }

  // ── List view ──
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
        <Button variant="primary" size="sm" onClick={openAdd} icon={<Plus size={16} />}>
          {t("addCategory")}
        </Button>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          icon={<Tag size={40} />}
          title={t("empty")}
          description={t("emptyDescription")}
          action={{ label: t("addCategory"), onClick: openAdd }}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {initial.map((c) => {
            const hex = CATEGORY_COLOR_HEX[c.color as CategoryColor] ?? "#64748b";
            return (
              <li key={c.id}>
                <Card>
                  <div className="flex items-start gap-3 p-4">
                    <div
                      className="shrink-0 size-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: hex + "22", color: hex }}
                      aria-hidden
                    >
                      <CategoryIconRender name={c.icon} className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-medium truncate">{c.name}</span>
                        {c.isBuiltIn && <Badge variant="lock" size="sm" label={t("builtInBadge")} />}
                      </div>
                      <p className="text-xs text-foreground-muted mt-0.5">
                        {t("usageStats", { devices: c.deviceCount, vorgaben: c.vorgabeCount })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="size-9 rounded-lg flex items-center justify-center text-foreground-muted hover:bg-background-subtle transition"
                        aria-label={t("edit")}
                      >
                        <Pencil size={16} />
                      </button>
                      {!c.isBuiltIn && (
                        <button
                          type="button"
                          onClick={() => setDeleteModal(c)}
                          className="size-9 rounded-lg flex items-center justify-center text-foreground-muted hover:bg-background-subtle transition"
                          aria-label={t("delete")}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ActionModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title={tCommon("delete")}
        icon={<Trash2 size={20} className="text-warn" />}
        iconBg="var(--color-warn-bg)"
        theme="user"
      >
        <p className="text-sm text-foreground-muted">
          {t("deleteConfirm", { name: deleteModal?.name ?? "" })}
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" fullWidth onClick={() => setDeleteModal(null)}>
            {tCommon("cancel")}
          </Button>
          <Button variant="danger" fullWidth loading={deleting} onClick={handleDelete}>
            {tCommon("delete")}
          </Button>
        </div>
      </ActionModal>
    </div>
  );
}
