import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shared/app-shell";

export const metadata: Metadata = {
  title: "Dashboard Builder",
  description: "Upload Excel files and build custom dashboards."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
