"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock, Plus, Pencil, Trash2, ArchiveRestore, Tags } from "lucide-react";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import Toggle from "@/app/components/Toggle";
import Badge from "@/app/components/Badge";
import ActionModal from "@/app/components/ActionModal";
import useToast from "@/app/hooks/useToast";
import DeviceForm from "./DeviceFormSheet";

export interface DeviceRow {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  purchasePrice: number | null;
  currency: string | null;
  categoryId: string | null;
  createdAt: string;
  archivedAt: string | null;
  entryCount: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  isBuiltIn: boolean;
}

interface Props {
  devices: DeviceRow[];
  categories?: CategoryOption[];
  /** Admin mode: managing another user's devices */
  userId?: string;
  username?: string;
  /** When true, render a link to category management. Set by server based on feature flag. */
  showCategoriesLink?: boolean;
}

export default function DevicesClient({ devices: initialDevices, categories, userId, username, showCategoriesLink = false }: Props) {
  const t = useTranslations("devices");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const toast = useToast();

  const [showArchived, setShowArchived] = useState(false);
  const [formMode, setFormMode] = useState<"closed" | "add" | "edit">("closed");
  const [editDevice, setEditDevice] = useState<DeviceRow | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeviceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const visibleDevices = showArchived
    ? initialDevices
    : initialDevices.filter((d) => !d.archivedAt);
  const hasArchived = initialDevices.some((d) => d.archivedAt);

  function openAdd() {
    setEditDevice(null);
    setFormMode("add");
  }

  function openEdit(device: DeviceRow) {
    setEditDevice(device);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode("closed");
    setEditDevice(null);
  }

  function handleSaved() {
    closeForm();
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/devices/${deleteModal.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || tCommon("error"));
        setDeleting(false);
        return;
      }
      const result = await res.json();
      toast.success(result.deleted ? t("deleted") : t("archived"));
      setDeleteModal(null);
      setDeleting(false);
      router.refresh();
    } catch {
      toast.error(tCommon("networkError"));
      setDeleting(false);
    }
  }

  async function handleRestore(device: DeviceRow) {
    try {
      const res = await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || tCommon("error"));
        return;
      }
      toast.success(t("restored"));
      router.refresh();
    } catch {
      toast.error(tCommon("networkError"));
    }
  }

  const title = username ? t("titleAdmin", { username }) : t("title");

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
          <DeviceForm
            onClose={closeForm}
            onSaved={handleSaved}
            device={editDevice}
            categories={categories}
            userId={userId}
          />
        </div>
      </>
    );
  }

  // ── Device list view ──
  const categoriesHref = userId
    ? `/admin/users/${userId}/categories`
    : "/dashboard/categories";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <Button variant="primary" size="sm" onClick={openAdd}>
          <Plus size={16} className="mr-1.5" />
          {t("addDevice")}
        </Button>
      </div>

      {showCategoriesLink && (
        <Link
          href={categoriesHref}
          className="flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition px-1"
        >
          <Tags size={14} className="text-foreground-faint" />
          <span>{t("manageCategories")}</span>
        </Link>
      )}

      {/* Archived toggle */}
      {hasArchived && (
        <Toggle
          label={t("showArchived")}
          checked={showArchived}
          onChange={setShowArchived}
        />
      )}

      {/* Device list */}
      {visibleDevices.length === 0 ? (
        <EmptyState
          icon={<Lock size={40} />}
          title={t("empty")}
          description={t("emptyDescription")}
          action={{ label: t("addDevice"), onClick: openAdd }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visibleDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onEdit={() => openEdit(device)}
              onDelete={() => setDeleteModal(device)}
              onRestore={() => handleRestore(device)}
            />
          ))}
        </div>
      )}

      {/* Delete/Archive confirmation */}
      <ActionModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title={deleteModal?.entryCount ? t("archive") : tCommon("delete")}
        icon={<Trash2 size={20} className="text-warn" />}
        iconBg="var(--color-warn-bg)"
        theme="user"
      >
        <p className="text-sm text-foreground-muted">
          {deleteModal?.entryCount
            ? t("archiveConfirm")
            : t("deleteConfirm")}
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" fullWidth onClick={() => setDeleteModal(null)}>
            {tCommon("cancel")}
          </Button>
          <Button variant="danger" fullWidth loading={deleting} onClick={handleDelete}>
            {deleteModal?.entryCount ? t("archive") : tCommon("delete")}
          </Button>
        </div>
      </ActionModal>
    </div>
  );
}

/* ── Device Card ─────────────────────────────────────────────────────────── */

function DeviceCard({
  device,
  onEdit,
  onDelete,
  onRestore,
}: {
  device: DeviceRow;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const t = useTranslations("devices");
  const isArchived = !!device.archivedAt;

  return (
    <Card padding="none" variant={isArchived ? "outlined" : "default"}>
      <div className={`flex gap-4 p-4 ${isArchived ? "opacity-60" : ""}`}>
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-xl bg-surface-raised flex items-center justify-center flex-shrink-0 overflow-hidden">
          {device.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={device.imageUrl} alt={device.name} className="w-full h-full object-cover" />
          ) : (
            <Lock size={24} className="text-foreground-faint" />
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground truncate">{device.name}</span>
            {isArchived && <Badge variant="neutral" label={t("archivedBadge")} size="sm" />}
          </div>
          {device.description && (
            <p className="text-xs text-foreground-muted line-clamp-2 mt-0.5">{device.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-foreground-faint">
            {device.purchasePrice != null && device.currency && (
              <span>{device.purchasePrice} {device.currency}</span>
            )}
            <span>{t("sessions", { count: device.entryCount })}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          {isArchived ? (
            <button
              type="button"
              onClick={onRestore}
              className="p-2 rounded-lg text-foreground-muted hover:text-foreground transition-colors"
              aria-label={t("restore")}
            >
              <ArchiveRestore size={16} />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="p-2 rounded-lg text-foreground-muted hover:text-foreground transition-colors"
                aria-label={t("editDevice")}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="p-2 rounded-lg text-foreground-muted hover:text-warn transition-colors"
                aria-label={device.entryCount ? t("archive") : t("deleted")}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
