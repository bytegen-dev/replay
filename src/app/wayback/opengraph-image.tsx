import { ImageResponse } from "next/og";
import { OG_SIZE, OgBanner } from "@/lib/ogBanner.tsx";

// The picture shown when a link to Wayback is shared. The card is a real lookup (Apple's close on 14 March 2025), saved here so the
// picture needs no network.
export const alt = "Wayback on Replay: the price of any token or stock on a past day";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function WaybackImage() {
  return new ImageResponse(
    (
      <OgBanner
        headline={["Wayback."]}
        sub="The price on any past day."
        body="Ask for a token or a stock on a date and get its price, and its market cap, from that moment. To the minute for recent dates."
        card={{
          kind: "lookup",
          caption: "Apple Inc. on 14 Mar 2025",
          price: "$213.49",
          lines: ["Closing price of that day", "Market cap about $3.04 trillion (estimated)"],
        }}
        cta="Try it free"
        footer="A real lookup"
      />
    ),
    size,
  );
}
