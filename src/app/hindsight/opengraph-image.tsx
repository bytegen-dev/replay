import { ImageResponse } from "next/og";
import { demoChecks } from "@/lib/landingData.ts";
import { OG_SIZE, OgBanner } from "@/lib/ogBanner.tsx";

// The picture shown when a link to Hindsight is shared: its headline and a real saved result drawn the way the page draws it.
export const alt = "Hindsight on Replay: what a past buy would be worth today";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function HindsightImage() {
  const checks = demoChecks();
  const check = checks.find((c) => c.id === "bitcoin-monthly") ?? checks[0];
  return new ImageResponse(
    (
      <OgBanner
        headline={["Hindsight."]}
        sub="What a past buy would be worth today."
        body="Pick a stock, coin or currency and a date. See what one buy, or the same amount every month, would be worth now, with leverage and dividends if you want them."
        card={{ kind: "chart", check }}
        cta="Try it free"
      />
    ),
    size,
  );
}
