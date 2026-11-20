import type { Metadata } from "next";
import { AdminApp } from "@/components/AdminApp";
import { SiteHeader } from "@/components/SiteHeader";

// Not linked anywhere and kept out of search results. The page itself asks for the admin password.
export const metadata: Metadata = { title: { absolute: "Admin" }, robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <AdminApp />
      </main>
    </div>
  );
}
