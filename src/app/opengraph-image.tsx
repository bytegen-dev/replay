import { ImageResponse } from "next/og";

// The picture shown when a link to Replay is shared: the brand line on the app's dark teal, with the mint accent and the
// slanted corners. Drawn with plain shapes and the built-in font, so it needs nothing beyond Next itself.
export const alt = "Replay: a time machine for your money. You can't change the past. You can learn from it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#071013", padding: 48 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 64px",
            border: "2px solid #1f3a40",
            background: "linear-gradient(135deg, #0a181c 0%, #071013 60%, #0b2a26 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="40" height="46" viewBox="0 0 40 46">
              <polygon points="2,2 38,23 2,44" fill="#39d6a3" />
            </svg>
            <div style={{ fontSize: 44, fontWeight: 700, color: "#ecf5f3", letterSpacing: -1 }}>Replay</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ fontSize: 88, fontWeight: 700, color: "#ecf5f3", lineHeight: 1.04, letterSpacing: -3, maxWidth: 980 }}>A time machine for your money.</div>
            <div style={{ fontSize: 38, color: "#39d6a3", maxWidth: 900 }}>You can&apos;t change the past. You can learn from it.</div>
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 10, width: i === 0 ? 64 : 24, background: i === 0 ? "#39d6a3" : "#1f3a40" }} />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
