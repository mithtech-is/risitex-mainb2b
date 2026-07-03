"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Input,
  Label,
  formatINR,
} from "@risitex/ui/components";
import {
  ShoppingCart,
  Trash2,
  Edit3,
  Copy,
  Save,
  Merge,
  Search,
  X,
} from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { addToCart, getCart, type CartLine } from "@/lib/cart";
import {
  listSavedCarts,
  createSavedCart,
  deleteSavedCart,
  renameSavedCart,
  type SavedCart,
  type SavedCartLine,
} from "@/lib/saved-carts";

export default function B2bCartsPage() {
  const [savedCarts, setSavedCarts] = React.useState<SavedCart[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [restored, setRestored] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const carts = await listSavedCarts();
      setSavedCarts(carts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load carts");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const handleSaveCurrentCart = async () => {
    if (!saveName.trim()) return;
    setBusy("save");
    try {
      const currentCart: CartLine[] = getCart();
      if (currentCart.length === 0) throw new Error("Cart is empty");
      const lines: SavedCartLine[] = currentCart.map((l) => ({
        variantId: l.variantId,
        medusaVariantId: l.variantId,
        productSlug: l.productSlug,
        productName: l.productName,
        variantLabel: l.variantTitle,
        swatchHex: "#A0978A",
        pricePerUnitMajor: l.unitPriceMajor,
        quantity: l.quantity,
      }));
      await createSavedCart({ name: saveName.trim(), lines });
      setSaveName("");
      setShowSaveDialog(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save cart");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this saved cart?")) return;
    setBusy(id);
    try {
      await deleteSavedCart(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(null);
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    setBusy(id);
    try {
      await renameSavedCart(id, renameValue.trim());
      setRenamingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = (cart: SavedCart) => {
    const cartLines: CartLine[] = (cart.lines ?? []).map((l) => ({
      variantId: l.variantId,
      productSlug: l.productSlug,
      productName: l.productName,
      variantTitle: l.variantLabel,
      unitPriceMajor: l.pricePerUnitMajor,
      quantity: l.quantity,
    }));
    addToCart(cartLines);
    setRestored(true);
  };

  const handleMerge = (cart: SavedCart) => {
    const cartLines: CartLine[] = (cart.lines ?? []).map((l) => ({
      variantId: l.variantId,
      productSlug: l.productSlug,
      productName: l.productName,
      variantTitle: l.variantLabel,
      unitPriceMajor: l.pricePerUnitMajor,
      quantity: l.quantity,
    }));
    addToCart(cartLines);
    setRestored(true);
  };

  const handleDuplicate = async (cart: SavedCart) => {
    if (!cart.lines?.length) return;
    setBusy(cart.id);
    try {
      await createSavedCart({
        name: `${cart.name} (copy)`,
        lines: cart.lines,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not duplicate");
    } finally {
      setBusy(null);
    }
  };

  const filtered = savedCarts.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Saved Carts" subtitle="Manage your saved baskets" />
        <p className="text-body-sm text-text-muted">Loading your saved carts\u2026</p>
      </div>
    );
  }

  if (error && savedCarts.length === 0) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Saved Carts" subtitle="" />
        <EmptyState
          title="Could not load carts"
          description={error}
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Saved Carts"
        subtitle={`${savedCarts.length} saved cart${savedCarts.length === 1 ? "" : "s"}`}
        rightActions={
          <div className="flex gap-2">
            {restored && (
              <Button asChild size="sm" variant="secondary">
                <Link href="/b2b/cart">
                  <ShoppingCart className="mr-1 h-4 w-4" />
                  View cart
                </Link>
              </Button>
            )}
            <Button size="sm" onClick={() => setShowSaveDialog(true)}>
              <Save className="mr-1 h-4 w-4" />
              Save current cart
            </Button>
          </div>
        }
      />

      {error && (
        <p className="rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      {showSaveDialog && (
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-body-md font-medium text-text-primary">Save current cart</p>
            <button type="button" onClick={() => setShowSaveDialog(false)} className="text-text-muted hover:text-text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="cart-name">Cart name</Label>
              <Input
                id="cart-name"
                value={saveName}
                onChange={(e) => setSaveName(e.currentTarget.value)}
                placeholder="e.g. Q3 fabric order"
              />
            </div>
            <Button onClick={handleSaveCurrentCart} isLoading={busy === "save"} disabled={!saveName.trim()}>
              Save
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftAdornment={<Search className="h-4 w-4" />}
          placeholder="Search saved carts\u2026"
          className="max-w-xs"
        />
        <span className="text-caption text-text-muted">
          {filtered.length} of {savedCarts.length}
        </span>
      </div>

      {savedCarts.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title="No saved carts yet"
          description="Save a cart from the cart page or browse the catalogue to add items first."
          action={
            <div className="flex gap-3">
              <Button asChild>
                <Link href="/wholesale/catalogue">Browse catalogue</Link>
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <p className="rounded-md bg-surface-sunken px-4 py-3 text-caption text-text-muted">
          No matches for &ldquo;{q}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cart) => (
            <div
              key={cart.id}
              className="flex flex-col rounded-lg border border-border-subtle bg-surface-raised"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-4">
                <div className="min-w-0 flex-1">
                  {renamingId === cart.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(cart.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        autoFocus
                        className="h-8"
                      />
                      <Button size="xs" onClick={() => void handleRename(cart.id)} isLoading={busy === cart.id}>
                        Save
                      </Button>
                    </div>
                  ) : (
                    <p className="truncate text-body-md font-medium text-text-primary">
                      {cart.name}
                    </p>
                  )}
                  <p className="mt-1 text-caption text-text-muted">
                    {cart.item_count ?? 0} item{(cart.item_count ?? 0) === 1 ? "" : "s"}
                    {cart.total_major != null
                      ? ` \u00b7 ${formatINR(Math.round(cart.total_major))}`
                      : ""}
                  </p>
                  <p className="text-caption text-text-muted">
                    Saved {new Date(cart.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
              </div>

              {cart.lines && cart.lines.length > 0 && (
                <div className="max-h-32 divide-y divide-border-subtle overflow-y-auto px-4 py-2">
                  {cart.lines.slice(0, 5).map((line, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <p className="truncate text-caption text-text-secondary">
                        {line.productName}
                      </p>
                      <span className="ml-2 shrink-0 font-mono text-caption text-text-muted">
                        {line.quantity} pcs
                      </span>
                    </div>
                  ))}
                  {cart.lines.length > 5 && (
                    <p className="py-1 text-caption text-text-muted">
                      +{cart.lines.length - 5} more
                    </p>
                  )}
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2 border-t border-border-subtle p-4">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => handleRestore(cart)}
                  title="Restore to cart"
                >
                  <ShoppingCart className="mr-1 h-3 w-3" />
                  Restore
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => handleMerge(cart)}
                  title="Merge with current cart"
                >
                  <Merge className="mr-1 h-3 w-3" />
                  Merge
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    setRenamingId(cart.id);
                    setRenameValue(cart.name);
                  }}
                  title="Rename"
                >
                  <Edit3 className="mr-1 h-3 w-3" />
                  Rename
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  isLoading={busy === cart.id && renamingId !== cart.id}
                  onClick={() => void handleDuplicate(cart)}
                  title="Duplicate"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Duplicate
                </Button>
                <Button
                  size="xs"
                  variant="tertiary"
                  onClick={() => void handleDelete(cart.id)}
                  title="Delete"
                  className="ml-auto"
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
