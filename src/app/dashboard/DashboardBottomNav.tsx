"use client";

import { useState } from "react";
import BottomNav from "@/app/components/BottomNav";
import NewEntrySheet from "@/app/components/NewEntrySheet";

interface Props {
  isAdmin?: boolean;
  isLocked: boolean;
}

export default function DashboardBottomNav({ isAdmin, isLocked }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <BottomNav
        isAdmin={isAdmin}
        isLocked={isLocked}
        onNewEntry={() => setSheetOpen(true)}
      />
      <NewEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        isLocked={isLocked}
      />
    </>
  );
}
