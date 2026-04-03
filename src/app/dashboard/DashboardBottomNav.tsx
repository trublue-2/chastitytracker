"use client";

import { useState } from "react";
import BottomNav from "@/app/components/BottomNav";
import NewEntrySheet from "@/app/components/NewEntrySheet";

interface Props {
  isAdmin?: boolean;
  isLocked: boolean;
  version?: string;
  buildDate?: string;
}

export default function DashboardBottomNav({ isAdmin, isLocked, version, buildDate }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <BottomNav
        isAdmin={isAdmin}
        isLocked={isLocked}
        onNewEntry={() => setSheetOpen(true)}
        version={version}
        buildDate={buildDate}
      />
      <NewEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        isLocked={isLocked}
      />
    </>
  );
}
