import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

/** The documentation pages, served under /docs. */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
