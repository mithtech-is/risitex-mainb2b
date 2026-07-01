"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogOverlay,
} from "@risitex/ui/components";
import { SignInPanel } from "./sign-in-panel";
import { SignUpPanel } from "./sign-up-panel";

type AuthView = "sign-in" | "sign-up";

export function AuthModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<AuthView>("sign-in");

  const handleSuccess = React.useCallback(() => {
    onOpenChange(false);
    router.push("/b2b/dashboard");
    router.refresh();
  }, [onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent
          hideClose
          className="flex max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl p-0"
        >
          <div className="flex min-h-[600px] w-full flex-col md:flex-row">
            {/* Left panel — form */}
            <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10 md:px-10">
              {view === "sign-in" ? (
                <SignInPanel
                  onSuccess={handleSuccess}
                  onSwitchToSignUp={() => setView("sign-up")}
                />
              ) : (
                <SignUpPanel
                  onSuccess={handleSuccess}
                  onSwitchToSignIn={() => setView("sign-in")}
                />
              )}
            </div>

            {/* Right panel — branded visual */}
            <div className="relative hidden w-[380px] shrink-0 overflow-hidden bg-gradient-to-br from-brand-accent/5 to-brand-accent/10 md:block">
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                <div className="relative h-full w-full">
                  <svg
                    className="absolute inset-0 h-full w-full"
                    viewBox="0 0 380 600"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <defs>
                      <pattern
                        id="weave"
                        x="0"
                        y="0"
                        width="40"
                        height="40"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M0 20h40M20 0v40"
                          stroke="currentColor"
                          strokeWidth="0.5"
                          opacity="0.12"
                        />
                        <rect
                          x="1"
                          y="1"
                          width="18"
                          height="18"
                          rx="2"
                          fill="currentColor"
                          fillOpacity="0.04"
                        />
                        <rect
                          x="21"
                          y="21"
                          width="18"
                          height="18"
                          rx="2"
                          fill="currentColor"
                          fillOpacity="0.04"
                        />
                      </pattern>
                      <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <rect width="380" height="600" fill="url(#weave)" className="text-brand-accent" />
                    <rect width="380" height="600" fill="url(#glow)" />
                    <g className="text-brand-accent" opacity="0.06">
                      <circle cx="190" cy="300" r="180" fill="none" stroke="currentColor" strokeWidth="0.5" />
                      <circle cx="190" cy="300" r="120" fill="none" stroke="currentColor" strokeWidth="0.5" />
                      <circle cx="190" cy="300" r="60" fill="none" stroke="currentColor" strokeWidth="0.5" />
                    </g>
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-accent/10">
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 32 32"
                        fill="none"
                        aria-hidden="true"
                      >
                        <rect
                          x="2"
                          y="2"
                          width="28"
                          height="28"
                          rx="6"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-brand-accent"
                        />
                        <path
                          d="M8 12h16M8 20h16M12 8v16"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="text-brand-accent"
                          opacity="0.6"
                        />
                      </svg>
                    </div>
                    <h3 className="text-heading-md text-text-primary">
                      Premium Textile Sourcing
                    </h3>
                    <p className="mt-3 text-body-sm text-text-muted">
                      Enterprise-grade B2B wholesale platform for verified textile
                      manufacturers and bulk buyers across India.
                    </p>
                    <div className="mt-8 grid grid-cols-3 gap-4">
                      {[
                        { label: "Products", value: "10K+" },
                        { label: "Manufacturers", value: "500+" },
                        { label: "Cities", value: "200+" },
                      ].map((stat) => (
                        <div key={stat.label} className="text-center">
                          <div className="font-mono text-heading-sm text-text-primary">
                            {stat.value}
                          </div>
                          <div className="mt-1 text-micro text-text-muted">
                            {stat.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
