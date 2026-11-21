import type { Metadata } from "next";
import { TonyGame } from "@/components/play/TonyGame";
import { getLevels, getSurvivalSegments } from "@/lib/gameLevels.ts";
import { pageMeta } from "@/lib/site.ts";

const TITLE = "Tony Stonk: fly through the market's history";
const DESCRIPTION = "Tony Stonk is a trader protecting his liquidity. Learn the controls in a short tutorial, then play the endless mode: a run through real price history, with every trader on the board.";

export const metadata: Metadata = pageMeta({ title: TITLE, fullTitle: `${TITLE} | Replay`, description: DESCRIPTION, path: "/game" });

export default function PlayPage() {
  const levels = getLevels();
  const segments = getSurvivalSegments();
  return (
    <main className="flex-1">
      <h1 className="sr-only">Tony Stonk</h1>
      <TonyGame levels={levels} segments={segments} />
    </main>
  );
}
