"use client";

import { MarkLoader } from "@/components/MarkLoader";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/lib/download.ts";
import { xlsxFileName } from "@/lib/exportData.ts";
import type { SharePayload } from "@/lib/share.ts";

/** Export buttons for a shared result. The same data the page shows is posted to the export route, as on the main page. */
export function SharedExport({ data }: { data: SharePayload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportXlsx() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile("/api/export/xlsx", data, xlsxFileName(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Download this result for accounting or offline review.</p>
        <Button type="button" variant="outline" className="form-control-h rounded-none sm:w-auto" onClick={exportXlsx} disabled={busy}>
          {busy ? <MarkLoader /> : <FileSpreadsheet />}
          {busy ? "Building XLSX" : "Export spreadsheet"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-bold">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
