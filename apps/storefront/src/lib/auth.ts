import { medusa } from "./medusa";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/**
 * Notify the `<SignedOut>` / `<SignedIn>` gates so marketing CTAs flip
 * instantly after a login or logout instead of waiting for a full
 * page navigation. No-op on the server (auth state is irrelevant there).
 */
function notifyAuthChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("risitex:auth-changed"));
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const result = await medusa().auth.login("customer", "emailpass", { email, password });
  if (!result) {
    throw new Error("Authentication failed");
  }
  if (typeof result === "object") {
    if ("verification_required" in result) {
      throw new Error("Additional verification required");
    }
    if ("mfa_required" in result) {
      throw new Error("Multi-factor authentication required");
    }
    if ("location" in result) {
      throw new Error("Redirect required");
    }
  }
  notifyAuthChange();
}

export async function accountExists(email: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/store/auth/account-exists`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": PUB_KEY,
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return true;
    const j = (await res.json()) as { exists?: boolean };
    return j.exists !== false;
  } catch {
    return true;
  }
}

export async function signUp(
  email: string,
  password: string,
  first_name?: string,
  last_name?: string,
): Promise<void> {
  const regResult = await medusa().auth.register("customer", "emailpass", { email, password });
  if (!regResult || typeof regResult !== "string") {
    throw new Error("Registration failed - unexpected server response");
  }
  await medusa().store.customer.create({
    email,
    first_name: first_name ?? "",
    last_name: last_name ?? "",
  });
  const loginResult = await medusa().auth.login("customer", "emailpass", { email, password });
  if (!loginResult) {
    throw new Error("Login failed after registration");
  }
  if (typeof loginResult === "object") {
    throw new Error(
      "verification_required" in loginResult
        ? "Verify your email to complete registration"
        : "mfa_required" in loginResult
          ? "Additional verification required"
          : "Login failed after registration",
    );
  }
  notifyAuthChange();
}

export async function updateCustomerMetadata(
  data: Record<string, unknown>,
  retries = 2,
): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try {
      const { email, ...customerData } = data;
      await medusa().store.customer.update(customerData);
      
      // Also sync company details
      const syncData = {
        gstin: data.metadata?.gstin || data.gstin,
        trade_name: data.metadata?.trade_name || data.trade_name || data.metadata?.company_name || data.company_name,
        email: email
      };
      
      try {
        await medusa().client.fetch("/store/companies/me", {
          method: "POST",
          body: syncData
        });
      } catch (e) {
        console.error("Failed to sync company", e);
      }

      return;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

export async function signOut(): Promise<void> {
  await medusa().auth.logout();
  notifyAuthChange();
}

export async function getCurrentCustomer() {
  try {
    const { customer } = await medusa().store.customer.retrieve();
    return customer;
  } catch {
    return null;
  }
}
