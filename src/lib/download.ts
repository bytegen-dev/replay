/** POSTs `body` as JSON and saves the response as a file. Throws with the server's message on failure. Browser only. */
export async function downloadFile(url: string, body: unknown, filename: string): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error ?? `Export failed (${res.status})`);
  }
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
