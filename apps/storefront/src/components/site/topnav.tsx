"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ThemeSwitch } from "@risitex/ui/components";
import { Container } from "./container";
import { Wordmark } from "./wordmark";
import * as React from "react";
import { MobileMenu } from "./mobile-menu";
import { CatalogueMega } from "./catalogue-mega";
import { WalletIconButton } from "@/components/wallet/wallet-icon-button";
import { Heart, Search, ShoppingCart, UserRound } from "lucide-react";
import { getCart } from "@/lib/cart";
import { scopedKey } from "@/lib/user-scope";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

const WISHLIST_KEY = "risitex-b2b-wishlist";
const CART_KEY = "risitex.b2b.cart.v1";

const NAV = [
  { href: "/about", label: "About" },
  { href: "/wholesale/catalogue", label: "Catalogue" },
  { href: "/contact", label: "Contact Us" },
];

export function Topnav() {
  return (
    <header className="sticky top-0 z-sticky bg-surface-background">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Left — logo */}
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

          {/* Centre — pill nav bar */}
          <nav
            aria-label="Primary"
            className="hidden lg:flex items-center rounded-full border border-border-subtle bg-surface-raised px-[6px] py-[6px] shadow-[0_1px_3px_rgba(20,20,18,0.06),0_1px_2px_rgba(20,20,18,0.04)]"
          >
            <NavLinks />
          </nav>

          {/* Right — actions */}
          <TopnavActions />
        </div>
      </Container>
      <div className="h-px bg-border-subtle" />
    </header>
  );
}

function NavLinks() {
  const pathname = usePathname() ?? "";
  return (
    <ul className="flex items-center gap-2">
      {NAV.map((item) => {
        if (item.href === "/wholesale/catalogue") {
          return <CatalogueMega key={item.href} />;
        }
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "relative block rounded-full px-4 py-2 text-body-sm font-medium transition-all duration-fast",
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
    <div className="flex items-center gap-3">
      <NavSearch />
      <ThemeSwitch />
      <NavIcon href="/b2b/wishlist" label="Wishlist" count={counts.wishlist}>
        <Heart className="h-[18px] w-[18px]" />
      </NavIcon>
      <WalletIconButton />
      <NavIcon href="/b2b/cart" label="Cart" count={counts.cart}>
        <ShoppingCart className="h-[18px] w-[18px]" />
      </NavIcon>
      <AccountNavSlot />
    </div>
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
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-focus"
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
