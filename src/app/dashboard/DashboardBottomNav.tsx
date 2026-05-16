"use client";

import { useState } from "react";
import BottomNav from "@/app/components/BottomNav";
import NewEntrySheet, { type NewEntryCategoryRow } from "@/app/components/NewEntrySheet";

interface Props {
  isAdmin?: boolean;
  isLocked: boolean;
  version?: string;
  categoryRows?: NewEntryCategoryRow[];
}

export default function DashboardBottomNav({ isAdmin, isLocked, version, categoryRows }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <BottomNav
        isAdmin={isAdmin}
        isLocked={isLocked}
        onNewEntry={() => setSheetOpen(true)}
        version={version}
      />
      <NewEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        isLocked={isLocked}
        categoryRows={categoryRows}
      />
    </>
  );
}
