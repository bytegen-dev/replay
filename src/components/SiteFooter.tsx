const LINKS = [
  { label: "GitHub", href: "https://github.com/bytegen-dev" },
  { label: "X", href: "https://x.com/bytegen_dev" },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-auto shrink-0 border-t border-border bg-background py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Historical prices are indicative only. Not financial advice.</p>
        <nav aria-label="Author" className="flex gap-4">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
