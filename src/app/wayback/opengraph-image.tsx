import { ImageResponse } from "next/og";
import { demoChecks } from "@/lib/landingData.ts";
import { OG_SIZE, OgBanner } from "@/lib/ogBanner.tsx";

// The picture shown when a link to Wayback is shared: its headline and a real saved result drawn the way the page draws it.
export const alt = "Wayback on Replay: what a past buy would be worth today, and the price on any past day";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function WaybackImage() {
  const checks = demoChecks();
  const check = checks.find((c) => c.id === "bitcoin-monthly") ?? checks[0];
  return new ImageResponse(
    (
      <OgBanner
        headline={["Wayback."]}
        sub="What a past buy would be worth today."
        body="Pick a stock, coin, commodity or currency and a date. See what one buy, or the same amount every month, would be worth now, or just its price on that day."
        card={{ kind: "chart", check }}
        cta="Try it free"
      />
    ),
    size,
  );
}
