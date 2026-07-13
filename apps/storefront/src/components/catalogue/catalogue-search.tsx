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
    <form onSubmit={submit} role="search" className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        placeholder="Search all products"
        aria-label="Search all products"
        className="h-11 w-full rounded-full bg-surface-sunken pl-11 pr-4 text-body-md text-text-primary placeholder:text-text-muted outline-none transition-shadow duration-fast focus-visible:bg-surface-raised focus-visible:ring-2 focus-visible:ring-border-strong"
      />
    </form>
  );
}
