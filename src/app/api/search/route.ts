import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// Search across the documentation pages.
export const { GET } = createFromSource(source, { language: "english" });
