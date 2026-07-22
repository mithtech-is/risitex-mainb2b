"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { MobileMenu } from "./mobile-menu";
import { CatalogueMega } from "./catalogue-mega";
import { WalletIconButton } from "@/components/wallet/wallet-icon-button";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Search,
  ShoppingBag,
  SunMoon,
  UserRound,
} from "lucide-react";
import { getCart } from "@/lib/cart";
import { scopedKey } from "@/lib/user-scope";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

const WISHLIST_KEY = "risitex-b2b-wishlist";
const CART_KEY = "risitex.b2b.cart.v1";

/**
 * Catalogue is first and rendered as the mega-menu; the rest are plain links.
 * Matches the reference's centred nav-with-carets, but every entry is a real
 * RISITEX destination — no invented "Sale"/"Trending" tabs that go nowhere.
 */
const NAV = [
  { href: "/wholesale/catalogue", label: "Catalogue" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/** Rotating promo strip — the dark rounded bar above the nav in the reference. */
const ANNOUNCEMENTS = [
  "MOQ from 240 pieces · Wholesale buyers only",
  "Made in Bengaluru · Manufacturing since 2019",
  "GST invoices · Pan-India delivery",
];

export function Topnav() {
  const hidden = useHideOnScroll();
  return (
    // FIXED and full-bleed: the announcement bar and nav span the whole width,
    // flush to the very top (no gutter, no gap, squared corners). `fixed` takes
    // no flow space, so the homepage hero sits behind it; other pages reserve
    // its height via `main { padding-top }` in globals.css. It slides up out of
    // view on scroll-down and returns at the top / on scroll-up.
    <header
      className="fixed inset-x-0 top-0 z-sticky"
      style={{
        transform: hidden ? "translateY(-100%)" : "translateY(0)",
        // Inline, not a duration-* class: this preset overrides the numeric
        // duration utilities so `duration-300` emitted 0s (no visible slide).
        transition: "transform 300ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <AnnouncementBar />
      <div className="w-full border-b border-border-subtle bg-surface-raised">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-3 px-4 md:gap-4 md:px-8">
          {/* Left — logo */}
          <div className="flex items-center gap-2">
            <MobileMenu />
            <Logo />
          </div>

          {/* Centre — pill nav, as on the live site (lamongie.in): the links
              sit inside a rounded, hairline-bordered pill. */}
          <nav
            aria-label="Primary"
            className="hidden items-center rounded-full border border-border-subtle bg-surface-raised px-1.5 py-1.5 lg:flex"
          >
            <NavLinks />
          </nav>

          {/* Right — actions */}
          <TopnavActions />
        </div>
      </div>
    </header>
  );
}

/**
 * Hide the fixed navbar when the reader scrolls down away from the top, reveal
 * it at the very top or on any upward scroll. This is what makes it "disappear
 * from the hero" while staying reachable.
 *
 * rAF-throttled and reads window.scrollY directly (not IntersectionObserver,
 * which this codebase avoids). The small ±4px deadband stops it flickering on
 * sub-pixel scroll jitter.
 */
function useHideOnScroll() {
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      if (y < 12) setHidden(false);
      else if (y > last + 4) setHidden(true);
      else if (y < last - 4) setHidden(false);
      last = y;
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}

/**
 * The mark is two PNGs (black for a light navbar, cream for a dark one); the
 * .rx-logo-black/.rx-logo-light classes are toggled by CSS in globals.css so
 * the right one shows against the ACTUAL navbar background — including the
 * homepage, which forces the navbar light even under a dark stored theme.
 * The wordmark is live text in a semantic colour, so it follows the theme too.
 */
function Logo() {
  return (
    <Link
      href="/"
      aria-label="RISITEX home"
      className="flex items-center gap-[10px] rounded-sm transition-opacity duration-fast hover:opacity-85 focus-visible:ring-focus"
    >
      {/* h-[34px]/w-[34px], NOT h-9/w-9: 9 is not in this repo's REPLACED
          spacing scale, so h-9/w-9 emit no CSS and the mark collapsed to 0×0
          (verified). Arbitrary px values always work. */}
      <span className="relative block h-[34px] w-[34px] shrink-0">
        <Image
          src="/brand/risitex-mark-black.png"
          alt=""
          fill
          sizes="36px"
          priority
          className="rx-logo-black object-contain"
        />
        <Image
          src="/brand/risitex-mark-light.png"
          alt=""
          fill
          sizes="36px"
          className="rx-logo-light object-contain"
        />
      </span>
      <span className="text-[17px] font-semibold uppercase tracking-[0.16em] text-text-primary">
        Risitex
      </span>
    </Link>
  );
}

function AnnouncementBar() {
  const [i, setI] = React.useState(0);
  const n = ANNOUNCEMENTS.length;

  // setInterval, not rAF: rAF is frozen in a background tab, timers still fire.
  React.useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % n), 5000);
    return () => clearInterval(id);
  }, [n]);

  const go = (d: 1 | -1) => setI((v) => (v + d + n) % n);

  return (
    // Full-bleed dark bar, flush to the top. Always dark with light text —
    // independent of theme so it never blends into a dark page.
    <div className="w-full bg-[#1D1D1D] text-[#F3F1EC]">
      <div className="mx-auto flex h-[36px] max-w-[1600px] items-center justify-center gap-6 px-4">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous announcement"
          className="opacity-60 transition-opacity hover:opacity-100"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-[11px] uppercase tracking-[0.18em]" aria-live="polite">
          {ANNOUNCEMENTS[i]}
        </p>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next announcement"
          className="opacity-60 transition-opacity hover:opacity-100"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function NavLinks() {
  const pathname = usePathname() ?? "";
  return (
    <ul className="flex items-center gap-1">
      {NAV.map((item) => {
        if (item.href === "/wholesale/catalogue") {
          return <CatalogueMega key={item.href} />;
        }
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href.split("?")[0]!));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "block rounded-full px-4 py-2 text-body-sm font-medium transition-all duration-fast",
                active
                  ? "bg-text-primary text-text-on-inverse"
                  : "text-text-secondary hover:bg-text-primary hover:text-text-on-inverse",
              ].join(" ")}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

type SearchHit = { id: string; title: string; handle: string };

function NavSearch() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(
        `${MEDUSA_BASE_URL}/store/products?q=${encodeURIComponent(term)}&limit=6&fields=id,title,handle`,
        { headers: { "x-publishable-api-key": PUB_KEY }, signal: ctrl.signal },
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setHits((data?.products ?? []) as SearchHit[]);
          setLoading(false);
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 1) return;
    if (pathname === "/wholesale/catalogue") return;
    const t = setTimeout(() => {
      router.push(
        `/wholesale/catalogue?q=${encodeURIComponent(term)}`,
        { scroll: false },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [q, pathname, router]);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    go(term ? `/wholesale/catalogue?q=${encodeURIComponent(term)}` : "/wholesale/catalogue");
  };

  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative hidden md:block">
      <form
        onSubmit={submit}
        role="search"
        className="flex items-center gap-2 border border-text-primary bg-surface-background pl-3 h-10 rounded-md overflow-hidden w-[260px] focus-within:w-[340px] transition-[width] duration-base ease-standard"
      >
        <Search
          className="pointer-events-none h-[18px] w-[18px] shrink-0 text-text-muted"
          aria-hidden
        />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.currentTarget.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder="Search products"
          aria-label="Search all products"
          className="w-full h-full outline-none bg-transparent text-body-sm text-text-primary placeholder:text-text-muted"
        />
      </form>

      {showPanel && (
        <div className="absolute right-0 top-full z-popover mt-1 w-full overflow-hidden rounded-md border border-text-primary bg-surface-background py-3">
          <p className="px-4 pb-2 text-[11px] text-text-muted">
            {loading ? "Searching…" : "Search Results"}
          </p>
          {hits.length > 0 ? (
            <ul className="max-h-[60vh] overflow-y-auto">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => go(`/wholesale/p/${h.handle}`)}
                    className="block w-full truncate px-4 py-1.5 text-left text-body-sm text-text-secondary transition-colors duration-fast hover:bg-surface-sunken cursor-pointer"
                  >
                    {h.title}
                  </button>
                </li>
              ))}
              <li className="mt-1 border-t border-border-subtle pt-1">
                <button
                  type="button"
                  onClick={submit}
                  className="w-full px-4 py-1.5 text-left text-caption font-medium text-text-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary"
                >
                  See all results for &ldquo;{q.trim()}&rdquo;
                </button>
              </li>
            </ul>
          ) : (
            <p className="px-4 py-1 text-body-sm text-text-muted">
              {loading ? "" : "No products found."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TopnavActions() {
  const counts = useNavActionCounts();

  return (
    // One consistent gap between every action; the search + theme sit left of
    // the uniform icon cluster (wishlist · wallet · cart · account), which all
    // share the SAME 40px square button and 20px icon so the row aligns evenly.
    <div className="flex items-center gap-1">
      <NavSearch />
      <ThemeToggle />
      <NavIcon href="/b2b/wishlist" label="Wishlist" count={counts.wishlist}>
        <Heart className="h-5 w-5" />
      </NavIcon>
      <WalletIconButton />
      <NavIcon href="/b2b/cart" label="Cart" count={counts.cart}>
        <ShoppingBag className="h-5 w-5" />
      </NavIcon>
      <AccountNavSlot />
    </div>
  );
}

/**
 * Light/dark toggle, styled as one of the uniform 40px action buttons so it
 * lines up with wishlist / wallet / cart. Uses the single SunMoon glyph (the
 * "light dark mode" mark) — it doesn't depend on the resolved theme, so it
 * renders identically on server and client and can't cause a hydration
 * mismatch. next-themes drives the actual switch.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle light and dark mode"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-focus"
    >
      {/* h-[23px], bigger than the other 20px icons on purpose: the SunMoon
          glyph is sparser (sun + crescent with lots of whitespace), so at 20px
          it read visually smaller than the solid Heart/bag/wallet. The button
          stays 40px, so spacing/alignment are unchanged — only the glyph grows
          to match the others' visual weight. */}
      <SunMoon className="h-[23px] w-[23px]" strokeWidth={1.9} aria-hidden />
    </button>
  );
}

function AccountNavSlot() {
  const [authed, setAuthed] = React.useState<boolean | null>(null);

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
      <div className="flex items-center gap-2 ml-1.5">
        <Link
          href="/auth/sign-in"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-raised px-4 text-body-sm font-medium text-text-primary transition-all duration-fast hover:border-text-primary hover:shadow-[0_1px_3px_rgba(20,20,18,0.08)] focus-visible:ring-focus"
        >
          Sign in
        </Link>
        <Link
          href="/auth/sign-up"
          className="hidden h-9 items-center gap-1.5 rounded-full bg-text-primary px-4 text-body-sm font-medium text-text-on-inverse transition-all duration-fast hover:opacity-90 focus-visible:ring-focus sm:inline-flex"
        >
          Get started
        </Link>
      </div>
    );
  }
  return (
    <NavIcon href="/b2b/profile" label="Account">
      <UserRound className="h-[18px] w-[18px]" />
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
      // h-10 w-10 (40px) — NOT h-9 w-9: 9 is not in this repo's REPLACED
      // spacing scale, so the buttons were content-sized and uneven. Every
      // action icon now shares this exact square, so the row aligns.
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-focus"
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
    const recomputeCart = () => getCart().length;
    const load = () => {
      if (cancelled) return;
      setCounts({
        wishlist: readLocalCount(scopedKey(WISHLIST_KEY)),
        cart: recomputeCart(),
      });
    };

    load();
    const onWishlistChange = () => {
      if (cancelled) return;
      setCounts((c) => ({
        ...c,
        wishlist: readLocalCount(scopedKey(WISHLIST_KEY)),
      }));
    };
    const onCartChange = () => {
      if (cancelled) return;
      setCounts((c) => ({ ...c, cart: recomputeCart() }));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith(WISHLIST_KEY)) onWishlistChange();
      if (e.key === null || e.key.startsWith(CART_KEY)) onCartChange();
    };
    window.addEventListener("risitex:wishlist-changed", onWishlistChange);
    window.addEventListener("risitex:cart-changed", onCartChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("risitex:auth-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("risitex:wishlist-changed", onWishlistChange);
      window.removeEventListener("risitex:cart-changed", onCartChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("risitex:auth-changed", load);
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
