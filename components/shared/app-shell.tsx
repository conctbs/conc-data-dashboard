"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, LayoutDashboard, Settings, Upload, PanelLeftClose, Rows3 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/upload", label: "Upload Data", icon: Upload },
  { href: "/datasets", label: "Dataset List", icon: Database },
  { href: "/builder", label: "Dashboard Builder", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 border-r border-line bg-[#f1ece2]/95 p-5 backdrop-blur lg:static lg:w-auto",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          "transition-transform"
        )}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Conc</p>
            <h1 className="font-semibold text-2xl">Dashboard Builder</h1>
          </div>
          <button
            className="rounded-full border border-line p-2 lg:hidden"
            onClick={() => setOpen(false)}
            type="button"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                  active ? "bg-accent text-white" : "bg-white/60 text-slate-700 hover:bg-white"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="card mt-8 p-4 text-sm">
          <p className="font-medium">Ready for auth</p>
          <p className="mt-1 text-slate-600">Structure is in place, but login is not enforced yet.</p>
        </div>
      </aside>

      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-line bg-shell/85 px-4 py-4 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between">
            <button
              className="rounded-full border border-line bg-white p-2 lg:hidden"
              onClick={() => setOpen(true)}
              type="button"
            >
              <Rows3 className="h-4 w-4" />
            </button>
            <div>
              <p className="text-sm text-slate-500">Excel to interactive dashboard</p>
              <p className="font-medium">Upload, model, visualize, export</p>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
