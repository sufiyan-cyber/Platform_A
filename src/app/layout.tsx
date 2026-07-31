import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Three faces, three jobs: a display face for headings, a neutral sans for
 * prose, and a mono reserved for anything the machine will read — config,
 * values, ids, counters. `display: swap` keeps text visible during load.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Agent Forge — build a real AI agent, one decision at a time",
    template: "%s · Agent Forge",
  },
  description:
    "A guided build experience for developers. Make one decision at a time, watch your agent config grow, and finish with a real agent running on Lyzr that you can chat with.",
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  width: "device-width",
  initialScale: 1,
  // Zoom is never disabled.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Keyboard users get past the header without tabbing through it. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:rounded-(--radius-control) focus:bg-accent focus:px-4 focus:py-2.5 focus:text-[13px] focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>

        {children}

        <Toaster
          position="top-center"
          duration={4000}
          toastOptions={{
            className:
              "!bg-surface !border !border-line !text-ink !font-sans !text-[13px] !rounded-(--radius-control)",
          }}
        />
      </body>
    </html>
  );
}
