"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-screen bg-surface-background text-text-primary text-body-md antialiased">
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h1 className="text-display-lg text-text-primary">
              Something went wrong
            </h1>
            <p className="mt-4 text-body-md text-text-muted">
              {error?.message?.includes("model does not support") ||
              error?.message?.includes("image.png")
                ? "A system error occurred. Please try again or contact support."
                : "An unexpected error occurred. Please try again."}
            </p>
            <button
              onClick={reset}
              className="mt-6 inline-flex items-center rounded-md bg-brand-accent px-4 py-2 text-body-md font-medium text-white hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
