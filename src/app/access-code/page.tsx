import type { Metadata } from "next";
import { OpenAccessPanel } from "@/components/AccessPanel";
import Home from "../page";

// For phones, where there is no Cmd+K: this address shows the home page with the access code panel already open.
export const metadata: Metadata = { title: { absolute: "Replay" }, robots: { index: false, follow: false } };

export default function AccessCodePage() {
  return (
    <>
      <Home />
      <OpenAccessPanel />
    </>
  );
}
