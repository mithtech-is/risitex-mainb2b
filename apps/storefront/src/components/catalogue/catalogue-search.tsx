"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

export function CatalogueSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = React.useState(params.get("q") ?? "");

  React.useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  const pushQuery = React.useCallback(
    (term: string) => {
      const next = new URLSearchParams(params.toString());
      if (term) next.set("q", term);
      else next.delete("q");
      router.push(`/wholesale/catalogue?${next.toString()}`, { scroll: false });
    },
    [router, params],
  );

  React.useEffect(() => {
    const trimmed = value.trim();
    const current = params.get("q") ?? "";
    if (trimmed === current) return;
    const id = setTimeout(() => pushQuery(trimmed), 300);
    return () => clearTimeout(id);
  }, [value, params, pushQuery]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    pushQuery(value.trim());
  };

  const clear = () => {
    setValue("");
    pushQuery("");
  };

  return (
    <form onSubmit={submit} role="search" className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        placeholder="Search all products"
        aria-label="Search all products"
        className="h-10 w-full rounded-full bg-surface-sunken pl-10 pr-10 text-body-sm text-text-primary placeholder:text-text-muted outline-none transition-shadow duration-fast focus-visible:bg-surface-raised focus-visible:ring-2 focus-visible:ring-border-strong"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-text-muted transition-colors duration-fast hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
