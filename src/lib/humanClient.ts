/**
 * The browser side of the bot check. Loads Cloudflare's script only when a check is actually needed, shows nothing unless
 * Cloudflare asks for a click, and resolves once the server has accepted the pass.
 */

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let script: Promise<void> | null = null;
function loadScript(): Promise<void> {
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      script = null;
      reject(new Error("The check couldn't load."));
    };
    document.head.appendChild(s);
  });
  return script;
}

/** Runs the check and asks the server to set the pass cookie. Throws with a short message if it doesn't work out. */
export async function passHumanCheck(siteKey: string): Promise<void> {
  await loadScript();
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:100";
  document.body.appendChild(box);
  let widget: string | null = null;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      widget = window.turnstile!.render(box, {
        sitekey: siteKey,
        appearance: "interaction-only",
        callback: (t: string) => resolve(t),
        "error-callback": () => reject(new Error("The check couldn't run. Reload and try again.")),
        "timeout-callback": () => reject(new Error("The check timed out. Try again.")),
      });
    });
    const res = await fetch("/api/human", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "The check didn't pass.");
  } finally {
    if (widget) window.turnstile?.remove(widget);
    box.remove();
  }
}

/** Fetches the site key from the server (null when no check is set up), so no key needs to be baked into the page. */
export async function humanSiteKey(): Promise<string | null> {
  const j = (await (await fetch("/api/human", { cache: "no-store" })).json().catch(() => null)) as { required?: boolean; siteKey?: string | null } | null;
  return j?.required && j.siteKey ? j.siteKey : null;
}
