"use client";

import dynamic from "next/dynamic";

// dynamic(ssr:false) must live in a Client Component — not allowed in Server Components (layout.tsx)
const AppLock = dynamic(() => import("./AppLock"), { ssr: false });

export default function AppLockLoader() {
  return <AppLock />;
}
