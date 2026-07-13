"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

const NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/[^0-9]/g, "");

export function WhatsAppButton() {
  const pathname = usePathname();
  if (!NUMBER) return null;

  // On a product page, include the product slug + absolute URL in the prefilled text.
  const isProduct = /^\/wholesale\/p\//.test(pathname ?? "");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const productName = isProduct
    ? decodeURIComponent((pathname ?? "").split("/wholesale/p/")[1] ?? "").replace(/-/g, " ")
    : "";
  const text = isProduct
    ? `Hi, I have a question about "${productName}" — ${origin}${pathname}`
    : "Hi, I have a question about your products.";
  const href = `https://wa.me/${NUMBER}?text=${encodeURIComponent(text)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Ask a question on WhatsApp"
      className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
    >
      <MessageCircle className="h-7 w-7" aria-hidden />
      <span className="sr-only">Chat on WhatsApp</span>
    </a>
  );
}
