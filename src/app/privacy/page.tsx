import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/contact.ts";
import { pageMeta } from "@/lib/site.ts";

const TITLE = "Privacy";
const DESCRIPTION = "What Replay and the CoTrader collect, what they do with it, who else sees it, and how to have it removed.";

export const metadata: Metadata = pageMeta({ title: `${TITLE}: what Replay keeps`, fullTitle: `${TITLE} | Replay`, description: DESCRIPTION, path: "/privacy" });

export default function PrivacyPage() {
  return (
    <LegalPage title={TITLE} updated="26 November 2026" intro="Replay's tools work without an account, and keep almost nothing. The CoTrader needs an account, and keeps more. This page says what, in plain words. It covers replay.bytegen.dev and the CoTrader app.">
      <LegalSection title="What we never collect">
        <ul>
          <li>A private key, a seed phrase or a password. Nothing in Replay asks for one.</li>
          <li>Anything that lets us move, send or sell your funds. The CoTrader only reads public blockchain data.</li>
          <li>Advertising or tracking profiles. There are no ad trackers on the site.</li>
        </ul>
      </LegalSection>

      <LegalSection title="When you only use the tools">
        <p>
          The price tools (what-if, Timestamp, Recap) need no account. The tokens, tickers, dates and wallet addresses you type are sent to our server and to the price sources listed on the <Link href="/docs/data-sources">data sources</Link> page, only to answer your question. Your display settings, and a Tiingo key if you add one, stay in your own browser.
        </p>
        <p>To stop abuse we count recent requests per visitor. The visitor is stored only as a hash, not as an address.</p>
      </LegalSection>

      <LegalSection title="When you have an account">
        <p>We keep:</p>
        <ul>
          <li><strong>Your account:</strong> the wallet address you signed in with, your plan, and, if you sign in with email, Google or X, how you signed in (the provider keeps your email, not us).</li>
          <li><strong>How you are known:</strong> the display name and picture you choose, if any.</li>
          <li><strong>What you watch:</strong> the wallets you add and the names you give them, your rules, and the alerts they raised.</li>
          <li><strong>Notifications:</strong> the address your browser gives us for sending them, until you turn them off.</li>
          <li><strong>Your CoTraders:</strong> each one&apos;s name, picture, tone and notes.</li>
          <li><strong>Your chats:</strong> what you and a CoTrader have said to one another, the newest 200 messages for each CoTrader. Failed answers are not kept.</li>
          <li><strong>Your own model account, if you connect one:</strong> its key is stored sealed (encrypted) and only used to answer your chats.</li>
          <li><strong>A count of your messages</strong> for the day, to apply the daily limit on the shared model.</li>
          <li><strong>A session cookie</strong> that keeps you signed in. Scripts on the page cannot read it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What leaves our servers">
        <p>We use other services to run Replay. Each sees only what it needs:</p>
        <ul>
          <li><strong>Privy</strong> handles email, Google and X sign-in and creates the wallet linked to that login. Its key is held by Privy.</li>
          <li><strong>Helius</strong> reads the public history and balances of the wallets you watch. <strong>DexScreener, Pyth, Birdeye and GeckoTerminal</strong> give prices for tokens. These are public lookups of addresses and tokens.</li>
          <li><strong>The model behind the chat.</strong> To answer, your messages, the CoTrader&apos;s name and notes, your display name, and the facts it looks up for you (your watched wallets and their names, positions, trades and alerts) are sent to the model provider. On the shared model that is OpenRouter and the model&apos;s host. If you connect your own account, it goes to your provider instead, under their terms. Do not put anything in a chat or in a CoTrader&apos;s notes that you would not want that provider to see.</li>
          <li><strong>Hosting and our database</strong> (Vercel and Neon) store and serve the data above.</li>
        </ul>
        <p>We do not sell your data and do not share it for advertising.</p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <ul>
          <li>A chat stays until you clear it, delete the CoTrader, or delete your account. Clearing a chat or deleting a CoTrader removes the saved messages.</li>
          <li>Notification addresses go when you turn notifications off.</li>
          <li>Everything else on your account stays until you ask us to delete it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your choices">
        <ul>
          <li>Edit or remove your display name and picture on the Account screen.</li>
          <li>Clear any conversation, or delete any CoTrader, from the app.</li>
          <li>Disconnect your own model account on the Agents screen. Its key is removed.</li>
          <li>Ask for a copy or the deletion of your account and everything on it, by writing to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Send it from where you can show it is yours, and say which wallet.</li>
        </ul>
        <p>Blockchain data is public and outside our control. Deleting your account does not remove anything from a blockchain.</p>
      </LegalSection>

      <LegalSection title="Children">
        <p>Replay is not for anyone under 18, and we do not knowingly collect data from them.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          When this page changes, the date at the top changes with it. Questions go to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. See also the <Link href="/terms">terms of service</Link> and <Link href="/docs/cotrader/safety">Is this safe?</Link>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
