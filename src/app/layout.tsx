import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bloom — Marketing, in flow",
  description:
    "A thoughtful workspace for your team’s social content. Create, review, schedule, and learn.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
