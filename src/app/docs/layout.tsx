import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { GithubIcon, XIcon } from "@/components/BrandIcons";
import { BrandMark } from "@/components/BrandMark";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // Replay has its own theme switch (Settings in the footer), so Fumadocs' theme handling is off and its colours follow ours.
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <span className="flex items-center gap-2 font-medium">
              <BrandMark size={22} />
              Replay
            </span>
          ),
          url: "/",
        }}
        links={[
          { text: "Wayback", url: "/wayback" },
          // The icons in the sidebar footer: the same links as the site's footer.
          { type: "icon", label: "GitHub", text: "GitHub", icon: <GithubIcon className="size-4" />, url: "https://github.com/bytegen-dev/replay", external: true },
          { type: "icon", label: "X", text: "X", icon: <XIcon className="size-4" />, url: "https://x.com/bytegen_dev", external: true },
        ]}
        themeSwitch={{ enabled: false }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
