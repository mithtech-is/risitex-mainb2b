"use client";

import Link from "next/link";
import { ThemeSwitch } from "@risitex/ui/components";
import { Container } from "./container";
import { Wordmark } from "./wordmark";
import * as React from "react";
import { MobileMenu } from "./mobile-menu";
import { WalletIconButton } from "@/components/wallet/wallet-icon-button";
import { AuthModal } from "@/components/auth/auth-modal";
import { Heart, ShoppingCart, UserRound } from "lucide-react";
import { getCart } from "@/lib/cart";

const NAV = [
  { href: "/about", label: "About" },
  { href: "/products", label: "Catalogue" },
  { href: "/contact", label: "Contact Us" },
];

export function Topnav() {
  return (
    <header className="sticky top-0 z-sticky border-b border-border-subtle bg-surface-background/90 backdrop-blur-modal">
      <Container>
        <nav
          className="flex h-14 items-center justify-between gap-3"
          aria-label="Primary"
        >
          <div className="flex items-center gap-3">
            <MobileMenu />
            <Link
              href="/"
              className="rounded-sm transition-opacity duration-fast hover:opacity-80 focus-visible:ring-focus"
              aria-label="RISITEX home"
            >
              <Wordmark showMonogram />
            </Link>
          </div>

          <ul className="hidden items-center gap-6 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-body-md text-text-secondary transition-colors duration-fast hover:text-text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <TopnavActions />
        </nav>
      </Container>
    </header>
  );
}

function TopnavActions() {
  const counts = useNavActionCounts();

  return (
    <div className="flex items-center gap-1">
      <ThemeSwitch />
      <NavIcon href="/b2b/wishlist" label="Wishlist" count={counts.wishlist}>
        <Heart className="h-5 w-5" />
      </NavIcon>
      <WalletIconButton />
      <NavIcon href="/b2b/cart" label="Cart" count={counts.cart}>
        <ShoppingCart className="h-5 w-5" />
      </NavIcon>
      <AccountNavSlot />
    </div>
  );
}

/**
 * Account icon switches its destination + label by auth state. Signed-out
 * users see a Sign in button that opens the AuthModal. Signed-in users get
 * the usual person icon linking to their profile.
 */
function AccountNavSlot() {
  const [authed, setAuthed] = React.useState<boolean | null>(null);
  const [authOpen, setAuthOpen] = React.useState(false);

  React.useEffect(() => {
    const read = () => {
      try {
        setAuthed(!!window.localStorage.getItem("medusa_auth_token"));
      } catch {
        setAuthed(false);
      }
    };
    read();
    const onChange = () => read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "medusa_auth_token" || e.key === null) read();
    };
    window.addEventListener("risitex:auth-changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("risitex:auth-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (authed === false) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-3 text-body-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-sunken focus-visible:ring-focus"
        >
          Sign in
        </button>
        <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      </>
    );
  }
  // authed === true OR null (still resolving — render the icon, which
  // links to a guarded route that handles the redirect itself).
  return (
    <NavIcon href="/b2b/profile" label="Account">
      <UserRound className="h-5 w-5" />
    </NavIcon>
  );
}

function NavIcon({
  href,
  label,
  count,
  children,
}: {
  href: string;
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  const showBadge = typeof count === "number" && count > 0;

  return (
    <Link
      href={href}
      aria-label={showBadge ? `${label}, ${count} items` : label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-focus"
    >
      {children}
      {showBadge && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand-accent px-1 text-center font-mono text-[10px] leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function useNavActionCounts() {
  const [counts, setCounts] = React.useState({ wishlist: 0, cart: 0 });

  React.useEffect(() => {
    let cancelled = false;

    // Cart badge = number of distinct LINES in the cart, not total units.
    // Total units for a B2B cart is typically in the hundreds or thousands
    // (just one carton can be 60+ pieces), which would always cap at "99+"
    // — useless. Line count tells the buyer "I have 2 different products
    // waiting" at a glance, which is the actionable signal.
    //
    // Wishlist is read from localStorage only — the older code path
    // contaminated this count with /store/saved-carts.length, which is a
    // totally unrelated archive of named baskets. Reading purely from
    // local keeps the badge in sync with the heart-toggle UI.
    const recomputeCart = () => getCart().length;
    const load = () => {
      if (cancelled) return;
      setCounts({
        wishlist: readLocalCount("risitex-b2b-wishlist"),
        cart: recomputeCart(),
      });
    };

    load();
    // React to wishlist heart toggles AND cart mutations so the navbar
    // badges update without a page reload.
    const onWishlistChange = () => {
      if (cancelled) return;
      setCounts((c) => ({
        ...c,
        wishlist: readLocalCount("risitex-b2b-wishlist"),
      }));
    };
    const onCartChange = () => {
      if (cancelled) return;
      setCounts((c) => ({ ...c, cart: recomputeCart() }));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "risitex-b2b-wishlist" || e.key === null) onWishlistChange();
      if (e.key === "risitex.b2b.cart.v1" || e.key === null) onCartChange();
    };
    window.addEventListener("risitex:wishlist-changed", onWishlistChange);
    window.addEventListener("risitex:cart-changed", onCartChange);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("risitex:wishlist-changed", onWishlistChange);
      window.removeEventListener("risitex:cart-changed", onCartChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return counts;
}

function readLocalCount(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
