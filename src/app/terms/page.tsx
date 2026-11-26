import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/contact.ts";
import { pageMeta } from "@/lib/site.ts";

const TITLE = "Terms of service";
const DESCRIPTION = "The rules for using Replay and the CoTrader: what they are, what they are not, and what you are responsible for.";

export const metadata: Metadata = pageMeta({ title: TITLE, fullTitle: `${TITLE} | Replay`, description: DESCRIPTION, path: "/terms" });

export default function TermsPage() {
  return (
    <LegalPage title={TITLE} updated="26 November 2026" intro="By using Replay (replay.money) or the CoTrader (app.replay.money) you agree to these terms. They are written to be read. If you do not agree, do not use them.">
      <LegalSection title="What Replay is">
        <p>
          Replay shows what past prices say about money, and the CoTrader follows Solana wallets you choose against rules you set, and answers questions about them. They are information tools. <strong>They do not trade, hold or move your funds.</strong> There is no trading in the app.
        </p>
      </LegalSection>

      <LegalSection title="Not financial advice">
        <ul>
          <li>Nothing in Replay or from a CoTrader is investment, tax, legal or financial advice, or a recommendation to buy, sell or hold anything.</li>
          <li>Prices come from public sources and can be wrong, late or missing. Past results say nothing about the next trade.</li>
          <li>A CoTrader&apos;s answers come from an AI model. It can be wrong, even when it sounds sure. Check what matters against the figures on the screen and on a block explorer.</li>
          <li>You make your own decisions and carry their results.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your account">
        <ul>
          <li>You must be at least 18 and allowed to use the service where you live.</li>
          <li>You are responsible for your wallet, your login and what happens under them. Keep your keys and seed phrase to yourself: Replay never asks for them.</li>
          <li>Give accurate information, and do not use someone else&apos;s account.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Using the CoTrader">
        <ul>
          <li>You may add wallets you want to watch. Their public history is public, but do not use Replay to harass, stalk or defraud anyone.</li>
          <li>The free plan has limits, such as a daily number of shared chat messages and a number of wallets and CoTraders. They may change.</li>
          <li>If you connect your own model account, you pay your provider and follow its terms. We never see more of it than the key you give us, which is stored sealed.</li>
          <li>What you write in chats and in a CoTrader&apos;s notes is yours. You allow us to store it and to send it to the model provider to produce answers, as the <Link href="/privacy">privacy page</Link> describes.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What you may not do">
        <ul>
          <li>Break the law, or use Replay to do so.</li>
          <li>Probe, overload or get around the limits of the service, or scrape it at a rate that harms it.</li>
          <li>Try to get into accounts, data or systems that are not yours.</li>
          <li>Use Replay to build something that misleads people into thinking its output is advice from us.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Our code and your content">
        <p>The Replay name, logo and the service itself are ours. The wallets you watch, your rules and your chats stay yours.</p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>Replay is provided as it is. It may be slow, wrong or unavailable, and we may change or end any part of it. We will try to give notice of changes that affect what you have saved, but we do not promise it.</p>
      </LegalSection>

      <LegalSection title="Our responsibility">
        <p>
          To the fullest extent the law allows, Replay and its makers are not liable for losses that come from using it, including trading losses, decisions made from its information or a CoTrader&apos;s answers, wrong or late prices, a missed alert, or the service being down. Nothing here limits a right you have by law that cannot be limited.
        </p>
      </LegalSection>

      <LegalSection title="Ending your use">
        <p>You can stop at any time and ask us to delete your account (see the <Link href="/privacy">privacy page</Link>). We may suspend or close an account that breaks these terms or harms the service.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          When these terms change, the date at the top changes, and using Replay afterwards means you accept them. Questions go to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
