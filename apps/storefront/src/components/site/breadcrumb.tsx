import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { href: string; label: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex">
      <ol className="flex items-center gap-1.5 text-caption">
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-1.5">
              {isLast ? (
                <span className="font-medium text-text-primary">{c.label}</span>
              ) : (
                <Link
                  href={c.href}
                  className="text-text-muted transition-colors duration-fast hover:text-text-primary"
                >
                  {c.label}
                </Link>
              )}
              {!isLast && (
                <ChevronRight
                  aria-hidden
                  className="h-3.5 w-3.5 text-text-disabled"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
