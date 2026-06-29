// Sentry initialization — must run BEFORE any other app code so the
// SDK can patch http/express/pg instrumentations.
//
// medusa-config.ts imports this at the top of the file so it runs
// before the Medusa framework boots. The @sentry/* packages are
// OPTIONAL — if they're not installed (e.g. on a slim CI image, or
// in the dockerized prod image where they're intentionally absent
// to keep the bundle lean), this file no-ops cleanly. When DSN is
// also empty, even the dynamic require is skipped.

const dsn = process.env.SENTRY_DSN

if (dsn) {
    try {
        // Use require() not import so a missing module is a runtime
        // catchable error, not a hard module-resolution failure that
        // would crash `medusa build` at config-load time. The `as any`
        // cast keeps TypeScript from trying to resolve the module's
        // type declarations at compile time — the @sentry/* packages
        // are intentionally NOT in package.json so the prod docker
        // image stays slim.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Sentry: any = require("@sentry/node")
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { nodeProfilingIntegration } = require(
            "@sentry/profiling-node",
        ) as any
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV ?? "production",
            release: process.env.RELEASE ?? process.env.GIT_SHA,
            tracesSampleRate: 0.05,
            profilesSampleRate: 0.05,
            integrations: [nodeProfilingIntegration()],
        })
    } catch (err) {
        // Silent — Sentry is observability, not core. Better to ship
        // un-instrumented than fail the build/boot.
        // eslint-disable-next-line no-console
        console.warn(
            "[instrument] @sentry/* not installed; skipping Sentry init",
        )
    }
}
