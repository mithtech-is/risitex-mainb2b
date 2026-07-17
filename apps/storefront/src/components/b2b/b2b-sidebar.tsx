"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DashboardSidebar,
  ThemeSwitch,
  type SidebarGroup,
} from "@risitex/ui/components";
import {
  LayoutDashboard,
  Boxes,
  ListOrdered,
  Wallet,
  Truck,
  Grid3X3,
  HeartHandshake,
  User,
  Bell,
  FileSpreadsheet,
  LogOut,
  Heart,
} from "lucide-react";
import { Wordmark } from "@/components/site/wordmark";
import { signOut } from "@/lib/auth";

const GROUPS: SidebarGroup[] = [
  {
    items: [
      { href: "/b2b/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
    ],
  },
  {
    heading: "Catalogue",
    items: [
      { href: "/b2b/inventory", label: "Inventory", icon: <Boxes /> },
      { href: "/products", label: "Catalogue", icon: <Grid3X3 /> },
    ],
  },
  {
    heading: "Ordering",
    items: [
      { href: "/b2b/wishlist", label: "Wishlist", icon: <Heart /> },
    ],
  },
  {
    heading: "Orders",
    items: [
      { href: "/b2b/orders", label: "Orders", icon: <ListOrdered /> },
      { href: "/b2b/shipments", label: "Shipments", icon: <Truck /> },
    ],
  },
  {
    heading: "Finance",
    items: [
      { href: "/b2b/wallet", label: "Wallet", icon: <Wallet /> },
      { href: "/b2b/invoices", label: "Invoices", icon: <FileSpreadsheet /> },
    ],
  },
  {
    heading: "Support",
    items: [
      { href: "/b2b/support", label: "Support", icon: <HeartHandshake /> },
      { href: "/b2b/notifications", label: "Notifications", icon: <Bell /> },
    ],
  },
  {
    heading: "Account",
    items: [
      { href: "/b2b/profile", label: "Profile", icon: <User /> },
    ],
  },
];

export function B2bSidebar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const handleLogout = async () => {
    await signOut().catch(() => {});
    router.replace("/auth/sign-in");
    router.refresh();
  };
  return (
    <DashboardSidebar
      brand={
        <Link href="/b2b/dashboard" className="flex items-center gap-2">
          <Wordmark showMonogram />
          <span className="text-caption text-text-muted">· B2B</span>
        </Link>
      }
      groups={GROUPS}
      activeHref={pathname}
      footer={
        <div className="flex flex-col gap-2 pb-2">
          {/* Theme on its own row so the Logout button can fill the width and
              actually look like a button to the buyer. The previous
              text-caption styling was easy to miss and got visually crushed
              by the floating dev indicator at the viewport's bottom-left. */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-caption text-text-muted">Theme</span>
            <ThemeSwitch />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out of RISITEX"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-feedback-danger-border bg-feedback-danger-bg text-body-sm font-medium text-feedback-danger-text transition-colors duration-fast hover:opacity-90 focus-visible:ring-focus"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span>Sign out</span>
          </button>
        </div>
      }
      renderItem={(item, _isActive, inner) => (
        <Link href={item.href} className="block relative">
          {inner}
        </Link>
      )}
    />
  );
}
