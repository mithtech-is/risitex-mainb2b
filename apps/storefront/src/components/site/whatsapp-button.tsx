"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

const NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/[^0-9]/g, "");

/**
 * Premium floating "Ask any questions" help button, fixed to the bottom-right
 * of every page. Hover reveals a label; click opens WhatsApp (pre-filled with
 * the product on product pages). Hidden until NEXT_PUBLIC_WHATSAPP_NUMBER is set.
 */
export function WhatsAppButton() {
  const pathname = usePathname();
  // Resolve the origin AFTER mount so the server-rendered href (origin "") and
  // the first client render match — otherwise the absolute URL differs between
  // server and client and React reports a hydration mismatch on the href.
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!NUMBER) return null;

  const isProduct = /^\/wholesale\/p\//.test(pathname ?? "");
  const productName = isProduct
    ? decodeURIComponent((pathname ?? "").split("/wholesale/p/")[1] ?? "").replace(/-/g, " ")
    : "";
  const text = isProduct
    ? `Hi RISITEX, I have a question about "${productName}" — ${origin}${pathname}`
    : "Hi RISITEX, I have a question about your products.";
  const href = `https://wa.me/${NUMBER}?text=${encodeURIComponent(text)}`;

  return (
    <div className="group fixed bottom-6 right-6 z-50 flex items-center">
      {/* Hover label */}
      <span
        className="pointer-events-none mr-3 max-w-0 overflow-hidden whitespace-nowrap rounded-full bg-text-primary py-2 text-body-sm font-medium text-text-on-inverse opacity-0 shadow-lg transition-all duration-normal ease-standard group-hover:max-w-[220px] group-hover:px-4 group-hover:opacity-100"
        aria-hidden
      >
        Ask us any question
      </span>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ask any question on WhatsApp"
        title="Ask us any question on WhatsApp"
        className="relative inline-flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_10px_30px_-6px_rgba(37,211,102,0.6)] transition-transform duration-normal ease-standard hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
        style={{
          background:
            "radial-gradient(120% 120% at 30% 20%, #4ae285 0%, #25D366 45%, #128C7E 100%)",
        }}
      >
        {/* soft pulsing ring */}
        <span
          className="absolute inset-0 rounded-full bg-[#25D366] opacity-40 motion-safe:animate-ping"
          aria-hidden
        />
        {/* WhatsApp glyph */}
        <svg
          viewBox="0 0 32 32"
          className="relative h-8 w-8 drop-shadow-sm"
          fill="currentColor"
          aria-hidden
        >
          <path d="M16.001 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.256.59 4.46 1.71 6.402L3.2 28.8l6.573-1.68a12.74 12.74 0 0 0 6.228 1.586h.005c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.332-6.635-3.75-9.053A12.72 12.72 0 0 0 16.001 3.2Zm0 23.09h-.004a10.6 10.6 0 0 1-5.4-1.48l-.387-.23-4.003 1.023 1.07-3.9-.253-.4a10.56 10.56 0 0 1-1.62-5.63c0-5.86 4.77-10.63 10.64-10.63a10.57 10.57 0 0 1 7.517 3.116 10.55 10.55 0 0 1 3.112 7.52c0 5.865-4.77 10.635-10.63 10.635Zm5.83-7.96c-.32-.16-1.89-.933-2.183-1.04-.293-.107-.507-.16-.72.16-.213.32-.826 1.04-1.013 1.253-.187.213-.373.24-.693.08-.32-.16-1.35-.498-2.57-1.587-.95-.847-1.59-1.893-1.777-2.213-.187-.32-.02-.493.14-.652.144-.143.32-.373.48-.56.16-.187.213-.32.32-.533.107-.213.053-.4-.027-.56-.08-.16-.72-1.735-.987-2.375-.26-.623-.523-.54-.72-.55l-.613-.01c-.213 0-.56.08-.853.4-.293.32-1.12 1.093-1.12 2.667 0 1.573 1.147 3.093 1.307 3.307.16.213 2.253 3.44 5.467 4.827.763.33 1.36.527 1.824.673.767.244 1.464.21 2.016.127.615-.092 1.89-.773 2.157-1.52.267-.746.267-1.386.187-1.52-.08-.133-.294-.213-.614-.373Z" />
        </svg>
      </a>
    </div>
  );
}
