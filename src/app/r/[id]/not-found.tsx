import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-bold">This link doesn&apos;t exist</h1>
      <p className="text-sm text-muted-foreground">It may have been deleted, or the address is mistyped.</p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Check a token yourself
      </Link>
    </main>
  );
}
