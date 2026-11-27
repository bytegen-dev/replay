import { ImageResponse } from "next/og";
import { heroChecks } from "@/lib/landingData.ts";
import { OG_SIZE, OgBanner } from "@/lib/ogBanner.tsx";
import { BRAND_LINE, HERO_DESCRIPTION, TAGLINE } from "@/lib/site.ts";

// The picture shown when a link to Replay is shared: the landing page's hero, with the same headline and a real saved result.
export const alt = `Replay: ${TAGLINE.toLowerCase()}. ${BRAND_LINE}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  const checks = heroChecks();
  const check = checks.find((c) => c.id === "hero-spy") ?? checks[0];
  return new ImageResponse(
    (
      <OgBanner
        headline={["A time machine", "for your money."]}
        sub={BRAND_LINE}
        body={HERO_DESCRIPTION}
        card={{ kind: "chart", check }}
        cta="Open the CoTrader"
      />
    ),
    size,
  );
}
