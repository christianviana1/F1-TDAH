"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, CalendarDays, ShoppingCart, LayoutDashboard, Smartphone } from "lucide-react";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendário", icon: Calendar },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pit-stop-shop", label: "Pit Stop Shop", icon: ShoppingCart },
  { href: "/mobile", label: "Mobile", icon: Smartphone },
];

export default function AppNav() {
  const pathname = usePathname();

  // Hide nav on login page
  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 h-12">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                isActive
                  ? "bg-red-600 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
