"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { updateCustomerMetadata } from "@/lib/auth";
import { CheckCircle2, AlertTriangle, Save } from "lucide-react";

type Address = {
  line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
};

type CompanyContext = {
  authenticated?: boolean;
  customer?: {
    id?: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  b2b?: {
    company?: {
      id?: string;
      gstin?: string | null;
      trade_name?: string | null;
      status?: string | null;
      billing_address?: Address | null;
      customer_tier_id?: string | null;
      sales_rep_id?: string | null;
    };
    customer_tier?: { code?: string; name?: string } | null;
    payment_terms?: string | null;
  } | null;
  application?: {
    status?: string;
    trade_name?: string | null;
    gstin?: string | null;
    applicant_email?: string | null;
    applicant_phone?: string | null;
    contact_name?: string | null;
    billing_address?: Address | null;
  } | null;
};

const BUSINESS_TYPES = [
  { value: "retailer", label: "Retailer" },
  { value: "distributor", label: "Distributor" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "ecommerce", label: "E-commerce Seller" },
  { value: "corporate", label: "Corporate / Institution" },
  { value: "other", label: "Other" },
];

export default function ProfilePage() {
  const _router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Raw fetched context data
  const [contextData, setContextData] = React.useState<CompanyContext | null>(null);

  // Whether the signed-in user is themselves an assigned sales representative.
  // The "Dedicated Sales Representative" field is only meaningful to reps, so
  // it stays hidden for ordinary customers.
  const [isRep, setIsRep] = React.useState(false);

  // Form states
  const [form, setForm] = React.useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company_name: "",
    trade_name: "",
    business_type: "",
    pan: "",
    gstin: "",
    trade_license: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  const loadData = React.useCallback(() => {
    const token = window.localStorage.getItem("medusa_auth_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
      headers,
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load profile data.");
        return (await res.json()) as CompanyContext;
      })
      .then((data) => {
        setContextData(data);
        const customer = data.customer;
        const b2b = data.b2b;
        const company = b2b?.company;
        const application = data.application;
        const meta = customer?.metadata ?? null;

        const getMetaStr = (key: string) => {
          const v = meta?.[key];
          return typeof v === "string" ? v.trim() : "";
        };

        setForm({
          first_name: customer?.first_name || "",
          last_name: customer?.last_name || "",
          email: customer?.email || "",
          phone: customer?.phone || getMetaStr("phone") || "",
          company_name: getMetaStr("company_name") || company?.trade_name || application?.trade_name || "",
          trade_name: getMetaStr("trade_name") || company?.trade_name || application?.trade_name || "",
          business_type: getMetaStr("business_type") || "",
          pan: getMetaStr("pan") || "",
          gstin: company?.gstin || application?.gstin || getMetaStr("gstin") || "",
          trade_license: getMetaStr("trade_license") || "",
          address: company?.billing_address?.line1 || application?.billing_address?.line1 || getMetaStr("address") || "",
          city: company?.billing_address?.city || application?.billing_address?.city || getMetaStr("city") || "",
          state: company?.billing_address?.state || application?.billing_address?.state || getMetaStr("state") || "",
          pincode: company?.billing_address?.postal_code || application?.billing_address?.postal_code || getMetaStr("pincode") || "",
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load account details.");
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => {
    const token = window.localStorage.getItem("medusa_auth_token");
    if (!token) return;
    fetch(`${MEDUSA_BASE_URL}/store/rep/me`, {
      headers: {
        "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : { is_rep: false }))
      .then((data: { is_rep?: boolean }) => setIsRep(Boolean(data?.is_rep)))
      .catch(() => setIsRep(false));
  }, []);

  const setVal = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      // Update customer details and metadata in Medusa
      await updateCustomerMetadata({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        company_name: form.company_name.trim(),
        metadata: {
          ...(contextData?.customer?.metadata ?? {}),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim(),
          company_name: form.company_name.trim(),
          trade_name: form.trade_name.trim(),
          business_type: form.business_type,
          pan: form.pan.trim().toUpperCase(),
          gstin: form.gstin.trim().toUpperCase(),
          trade_license: form.trade_license.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pincode: form.pincode.trim(),
        },
      });

      setSuccess("Profile updated successfully.");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Profile" subtitle="Manage your B2B account details" />
        <p className="text-body-sm text-text-muted">Loading your profile information...</p>
      </div>
    );
  }

  const b2b = contextData?.b2b;
  const company = b2b?.company;
  const application = contextData?.application;
  const status =
    company?.status ??
    (application?.status === "pending"
      ? "pending"
      : application?.status === "approved"
        ? "approved"
        : application?.status === "rejected"
          ? "rejected"
          : "pending");

  const tier = b2b?.customer_tier?.name ?? "Bronze (default)";
  const paymentTerms = b2b?.payment_terms ?? "Advance Payment";
  const salesRep = company?.sales_rep_id ? `Assigned (ID: ${company.sales_rep_id})` : "To be assigned post-approval";

  return (
    <div className="flex min-h-full flex-col gap-8 pb-12">
      <B2bTopbar title="Profile Settings" subtitle="Manage your personal profile, company details, and billing address." />

      {success && (
        <div className="flex items-center gap-2 rounded-md border border-feedback-success-border bg-feedback-success-bg px-4 py-3 text-feedback-success-text">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-body-sm">{success}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-feedback-danger-border bg-feedback-danger-bg px-4 py-3 text-feedback-danger-text">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-body-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Main Edit Form */}
        <div className="lg:col-span-8 space-y-8">
          {/* Section: Personal Info */}
          <section className="rounded-md border border-border-subtle bg-surface-raised p-6 space-y-4">
            <h2 className="text-heading-sm text-text-primary font-display font-semibold">Personal Information</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="first_name" required>First Name</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setVal("first_name", e.currentTarget.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="last_name" required>Last Name</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setVal("last_name", e.currentTarget.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  value={form.email}
                  readOnly
                  className="bg-surface-sunken cursor-not-allowed opacity-75"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setVal("phone", e.currentTarget.value)}
                />
              </div>
            </div>
          </section>

          {/* Section: Company Details */}
          <section className="rounded-md border border-border-subtle bg-surface-raised p-6 space-y-4">
            <h2 className="text-heading-sm text-text-primary font-display font-semibold">Company Information</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="company_name" required>Company Legal Name</Label>
                <Input
                  id="company_name"
                  value={form.company_name}
                  onChange={(e) => setVal("company_name", e.currentTarget.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="trade_name">Trade / Brand Name</Label>
                <Input
                  id="trade_name"
                  value={form.trade_name}
                  onChange={(e) => setVal("trade_name", e.currentTarget.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="business_type">Business Type</Label>
                <Select
                  value={form.business_type}
                  onValueChange={(v) => setVal("business_type", v)}
                >
                  <SelectTrigger id="business_type">
                    <SelectValue placeholder="Select business type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value}>
                        {bt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Section: Business Verification */}
          <section className="rounded-md border border-border-subtle bg-surface-raised p-6 space-y-4">
            <h2 className="text-heading-sm text-text-primary font-display font-semibold">Verification & Tax Details</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pan" required>PAN Number</Label>
                <Input
                  id="pan"
                  value={form.pan}
                  onChange={(e) => setVal("pan", e.currentTarget.value.toUpperCase())}
                  placeholder="AAAPL1234C"
                  maxLength={10}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gstin">GSTIN (Optional)</Label>
                <Input
                  id="gstin"
                  value={form.gstin}
                  onChange={(e) => setVal("gstin", e.currentTarget.value.toUpperCase())}
                  placeholder="29ABCDE1234F1Z5"
                  maxLength={15}
                />
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="trade_license">Trade License Number</Label>
                <Input
                  id="trade_license"
                  value={form.trade_license}
                  onChange={(e) => setVal("trade_license", e.currentTarget.value)}
                />
              </div>
            </div>
          </section>

          {/* Section: Business Address */}
          <section className="rounded-md border border-border-subtle bg-surface-raised p-6 space-y-4">
            <h2 className="text-heading-sm text-text-primary font-display font-semibold">Business Billing Address</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="address">Address Line</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setVal("address", e.currentTarget.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setVal("city", e.currentTarget.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(e) => setVal("state", e.currentTarget.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pincode">PIN Code</Label>
                <Input
                  id="pincode"
                  value={form.pincode}
                  onChange={(e) => setVal("pincode", e.currentTarget.value)}
                  maxLength={6}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value="India (IN)"
                  readOnly
                  className="bg-surface-sunken cursor-not-allowed opacity-75"
                />
              </div>
            </div>
          </section>

          {/* Submit Action */}
          <div className="flex items-center gap-3">
            <Button type="submit" size="lg" isLoading={saving}>
              <Save className="mr-2 h-5 w-5" />
              Save Changes
            </Button>
          </div>
        </div>

        {/* Sidebar B2B Settings Details */}
        <aside className="lg:col-span-4 space-y-6">
          <section className="rounded-md border border-border-subtle bg-surface-raised p-6 space-y-4">
            <h2 className="text-heading-sm text-text-primary font-display font-semibold">Account Status</h2>
            <div className="space-y-4">
              <div>
                <p className="text-micro text-text-muted uppercase tracking-wider">Wholesale Status</p>
                <div className="mt-1">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                    status === "approved"
                      ? "bg-feedback-success-bg text-feedback-success-text"
                      : status === "rejected"
                        ? "bg-feedback-danger-bg text-feedback-danger-text"
                        : "bg-feedback-warning-bg text-feedback-warning-text"
                  }`}>
                    {status}
                  </span>
                </div>
              </div>
              <div className="border-t border-border-subtle pt-3">
                <p className="text-micro text-text-muted uppercase tracking-wider">Pricing Tier</p>
                <p className="mt-1 text-body-md font-bold text-text-primary">{tier}</p>
              </div>
              <div className="border-t border-border-subtle pt-3">
                <p className="text-micro text-text-muted uppercase tracking-wider">Default Payment Terms</p>
                <p className="mt-1 text-body-md text-text-primary">{paymentTerms}</p>
              </div>
              {isRep && company?.sales_rep_id && (
                <div className="border-t border-border-subtle pt-3">
                  <p className="text-micro text-text-muted uppercase tracking-wider">Dedicated Sales Representative</p>
                  <p className="mt-1 text-body-md text-text-primary">{salesRep}</p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
}
