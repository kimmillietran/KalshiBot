"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bitcoin,
  LayoutDashboard,
  LineChart,
  NotebookPen,
  Settings,
  Sparkles,
  Star,
} from "lucide-react";

import { iconSize, labelClass } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Routes not yet built in this milestone. */
  comingSoon?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Markets", href: "/markets", icon: LineChart, comingSoon: true },
  {
    label: "Recommendations",
    href: "/recommendations",
    icon: Sparkles,
    comingSoon: true,
  },
  { label: "Journal", href: "/journal", icon: NotebookPen, comingSoon: true },
  { label: "Analytics", href: "/analytics", icon: BarChart3, comingSoon: true },
  { label: "Watchlist", href: "/watchlist", icon: Star, comingSoon: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-sidebar text-sidebar-foreground hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <Bitcoin className={cn("text-primary", iconSize.lg)} />
        <span className="font-heading text-sm font-semibold tracking-tight">
          Kalshi BTC Edge
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className={iconSize.md} />
              <span className="flex-1">{item.label}</span>
              {item.comingSoon ? (
                <span className={cn(labelClass(), "rounded bg-muted px-1.5 py-0.5 font-normal normal-case tracking-wide")}>
                  Soon
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <Link
          href="/settings"
          className="text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        >
          <Settings className="size-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
