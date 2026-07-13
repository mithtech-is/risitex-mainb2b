"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ThemeSwitch } from "@risitex/ui/components";
import { Container } from "./container";
import { Wordmark } from "./wordmark";
import * as React from "react";
import { MobileMenu } from "./mobile-menu";
import { WalletIconButton } from "@/components/wallet/wallet-icon-button";
import { AuthModal } from "@/components/auth/auth-modal";
import { Heart, Search, ShoppingCart, UserRound } from "lucide-react";
import { getCart } from "@/lib/cart";
import { scopedKey } from "@/lib/user-scope";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

const WISHLIST_KEY = "risitex-b2b-wishlist";
const CART_KEY = "risitex.b2b.cart.v1";

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
          <div className="flex items-center gap-6">
            <MobileMenu />
            <Link
              href="/"
              className="rounded-sm transition-opacity duration-fast hover:opacity-80 focus-visible:ring-focus"
              aria-label="RISITEX home"
            >
              <Wordmark showMonogram />
            </Link>
            <NavLinks />
          </div>

          <TopnavActions />
        </nav>
      </Container>
    </header>
  );
}

/** Primary nav links with an active-page indicator + smooth hover underline. */
function NavLinks() {
  const pathname = usePathname() ?? "";
  return (
    <ul className="hidden items-center gap-8 lg:flex">
      {NAV.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative text-body-md transition-colors duration-fast ${
                active
                  ? "text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {item.label}
              <span
                className={`pointer-events-none absolute -bottom-1.5 left-0 h-px bg-text-primary transition-all duration-base ease-standard ${
                  active ? "w-full" : "w-0 group-hover:w-full"
                }`}
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

type SearchHit = { id: string; title: string; handle: string; thumbnail: string | null };

/**
 * Inline pill search with a live product-name typeahead. As you type, matching
 * product names appear in a dropdown (from Medusa `/store/products?q=`); pick one
 * to jump straight to its page, or press Enter to see all results in the
 * catalogue. Icon sits clear of the placeholder (no overlap).
 */
function NavSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // Debounced live search against the store products endpoint.
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
        `${MEDUSA_BASE_URL}/store/products?q=${encodeURIComponent(term)}&limit=6&fields=id,title,handle,thumbnail`,
        { headers: { "x-publishable-api-key": PUB_KEY }, signal: ctrl.signal },
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setHits((data?.products ?? []) as SearchHit[]);
          setLoading(false);
        })
        .catch(() => {
          /* aborted or offline — ignore */
        });
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

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
      <form onSubmit={submit} role="search">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
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
          placeholder="Search"
          aria-label="Search all products"
          className="h-10 w-44 rounded-full bg-surface-sunken pl-10 pr-4 text-body-sm text-text-primary placeholder:text-text-muted outline-none transition-[width,box-shadow] duration-base ease-standard focus:w-64 focus-visible:bg-surface-raised focus-visible:ring-2 focus-visible:ring-border-strong"
        />
      </form>

      {showPanel && (
        <div className="absolute right-0 top-full z-popover mt-2 w-[min(88vw,340px)] animate-fade-down overflow-hidden rounded-lg border border-border-subtle bg-surface-raised shadow-popover">
          {hits.length > 0 ? (
            <ul className="max-h-[60vh] overflow-y-auto p-1.5">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => go(`/wholesale/p/${h.handle}`)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-fast hover:bg-surface-sunken"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunken text-caption font-semibold text-text-muted">
                      {h.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (h.title || "?").charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">
                      {h.title}
                    </span>
                  </button>
                </li>
              ))}
              <li className="mt-1 border-t border-border-subtle pt-1">
                <button
                  type="button"
                  onClick={submit}
                  className="w-full rounded-md px-2 py-2 text-left text-caption font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary"
                >
                  See all results for “{q.trim()}”
                </button>
              </li>
            </ul>
          ) : (
            <p className="px-3 py-4 text-body-sm text-text-muted">
              {loading ? "Searching…" : "No products found."}
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
    <div className="flex items-center gap-2">
      <NavSearch />
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
        wishlist: readLocalCount(scopedKey(WISHLIST_KEY)),
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
    // Sign-in / sign-out re-scopes both keys — recompute both badges so they
    // reflect the new user, not whoever was signed in before.
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
