"use client";

import { ResultsProvider } from "@/lib/store";
import Shell from "./shell";

export default function AppLayout({ children }) {
  return (
    <ResultsProvider>
      <Shell>{children}</Shell>
    </ResultsProvider>
  );
}
