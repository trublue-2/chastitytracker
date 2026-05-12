"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { formatHours, toDateLocale } from "@/lib/utils";
import { Plus, Pencil, Trash2, Tag, ChevronUp, ChevronDown } from "lucide-react";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import Badge from "@/app/components/Badge";
import ActionModal from "@/app/components/ActionModal";
import useToast from "@/app/hooks/useToast";
import { categoryStyle } from "@/lib/categoryConstants";
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
  /** Wear hours since the start of the current ISO week. */
  weeklyHours: number;
  requirePhoto: boolean;
  allowVorgaben: boolean;
}

interface Props {
  categories: CategoryRow[];
  /** Admin mode — managing another user's categories. Form payloads include this userId. */
  userId?: string;
  username?: string;
}

export default function CategoriesClient({ categories: initial, userId, username }: Props) {
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

  /** Swap sortOrder of two adjacent custom categories. Sends two PATCH calls and refreshes. */
  async function handleSwap(a: CategoryRow, b: CategoryRow) {
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/categories/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: b.sortOrder }),
        }),
        fetch(`/api/categories/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: a.sortOrder }),
        }),
      ]);
      if (!resA.ok || !resB.ok) {
        toast.error(tCommon("error"));
        return;
      }
      router.refresh();
    } catch {
      toast.error(tCommon("networkError"));
    }
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

  const title = username ? `${t("title")} – ${username}` : t("title");

  // ── Inline form view (add/edit) ──
  if (formMode !== "closed") {
    return (
      <>
        <button
          type="button"
          onClick={closeForm}
          className="text-sm text-foreground-faint hover:text-foreground-muted transition"
        >
          ← {title}
        </button>
        <div className="mt-4">
          <CategoryFormSheet category={editCategory} onClose={closeForm} onSaved={handleSaved} userId={userId} />
        </div>
      </>
    );
  }

  // ── List view ──
  const devicesHref = userId ? `/admin/users/${userId}/geraete` : "/dashboard/geraete";
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={devicesHref}
        className="text-sm text-foreground-faint hover:text-foreground-muted transition w-fit"
      >
        ← {t("backToDevices")}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
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
        <CategoryList
          categories={initial}
          onEdit={openEdit}
          onDelete={(c) => setDeleteModal(c)}
          onSwap={handleSwap}
        />
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

/** Renders the categories list — Built-in (System) on top, user-defined below.
 *  Each row shows a feature-summary line per Mockup #6. */
function CategoryList({
  categories,
  onEdit,
  onDelete,
  onSwap,
}: {
  categories: CategoryRow[];
  onEdit: (c: CategoryRow) => void;
  onDelete: (c: CategoryRow) => void;
  onSwap: (a: CategoryRow, b: CategoryRow) => void;
}) {
  const t = useTranslations("categories");
  const builtIn = categories.filter((c) => c.isBuiltIn);
  const custom = categories.filter((c) => !c.isBuiltIn);
  return (
    <div className="flex flex-col gap-5">
      {builtIn.length > 0 && (
        <Section title={t("sectionSystem")}>
          <ul className="flex flex-col gap-3">
            {builtIn.map((c) => (
              <CategoryRowItem key={c.id} category={c} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </ul>
        </Section>
      )}
      {custom.length > 0 && (
        <Section title={t("sectionCustom")}>
          <ul className="flex flex-col gap-3">
            {custom.map((c, i) => (
              <CategoryRowItem
                key={c.id}
                category={c}
                onEdit={onEdit}
                onDelete={onDelete}
                onMoveUp={i > 0 ? () => onSwap(c, custom[i - 1]) : undefined}
                onMoveDown={i < custom.length - 1 ? () => onSwap(c, custom[i + 1]) : undefined}
              />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-faint px-1">{title}</h2>
      {children}
    </div>
  );
}

function CategoryRowItem({
  category: c,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  category: CategoryRow;
  onEdit: (c: CategoryRow) => void;
  onDelete: (c: CategoryRow) => void;
  /** Set when this row can move up — disabled (undefined) for the first custom row. */
  onMoveUp?: () => void;
  /** Set when this row can move down — disabled for the last custom row. */
  onMoveDown?: () => void;
}) {
  const t = useTranslations("categories");
  const dl = toDateLocale(useLocale());
  const style = categoryStyle(c.color);
  // Per mockup #6: KG shows built-in features ("Foto-Pflicht · Siegel · Kontrollen"),
  // others show "ohne Foto-Pflicht" or "Inventar-only" if tracking disabled.
  const featureLine = !c.trackingEnabled
    ? t("featuresInventoryOnly")
    : c.isBuiltIn
      ? t("featuresKg")
      : t("featuresWear");
  return (
    <li>
      <Card>
        <div className="flex items-start gap-3 p-4">
          <div
            className="shrink-0 size-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: style.backgroundColor, color: style.color }}
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
              {c.trackingEnabled && c.weeklyHours > 0 && ` · ${t("weekly", { hours: formatHours(c.weeklyHours, dl) })}`}
            </p>
            <p className="text-xs text-foreground-faint mt-0.5">{featureLine}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(onMoveUp || onMoveDown) && (
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={onMoveUp}
                  disabled={!onMoveUp}
                  aria-label={t("moveUp")}
                  className="size-5 flex items-center justify-center text-foreground-muted hover:bg-background-subtle rounded disabled:opacity-30 disabled:hover:bg-transparent transition"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={onMoveDown}
                  disabled={!onMoveDown}
                  aria-label={t("moveDown")}
                  className="size-5 flex items-center justify-center text-foreground-muted hover:bg-background-subtle rounded disabled:opacity-30 disabled:hover:bg-transparent transition"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => onEdit(c)}
              className="size-9 rounded-lg flex items-center justify-center text-foreground-muted hover:bg-background-subtle transition"
              aria-label={t("edit")}
            >
              <Pencil size={16} />
            </button>
            {!c.isBuiltIn && (
              <button
                type="button"
                onClick={() => onDelete(c)}
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
}
