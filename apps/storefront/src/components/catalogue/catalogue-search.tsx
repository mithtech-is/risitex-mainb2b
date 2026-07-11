"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export function CatalogueSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = React.useState(params.get("q") ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    router.push(`/wholesale/catalogue?${next.toString()}`);
  };

  return (
    <form onSubmit={submit} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        placeholder="Search all products"
        aria-label="Search all products"
        className="h-10 w-full rounded-md border border-border-subtle bg-surface-raised pl-9 pr-3 text-body-md text-text-primary"
      />
    </form>
  );
}
