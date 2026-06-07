"use client";

import { useState } from "react";
import BottomNav from "@/app/components/BottomNav";
import NewEntrySheet, { type NewEntryCategoryRow } from "@/app/components/NewEntrySheet";

interface Props {
  isAdmin?: boolean;
  isKeyholder?: boolean;
  isLocked: boolean;
  version?: string;
  categoryRows?: NewEntryCategoryRow[];
}

export default function DashboardBottomNav({ isAdmin, isKeyholder, isLocked, version, categoryRows }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <BottomNav
        isAdmin={isAdmin}
        isKeyholder={isKeyholder}
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
