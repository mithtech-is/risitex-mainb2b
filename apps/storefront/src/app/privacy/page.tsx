import type { Metadata } from "next";
import { LegalPage, PolicySection, PolicyList } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How RISITEX collects, uses, stores, and safeguards your personal information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effective="June 2026"
      breadcrumbLabel="Privacy Policy"
      intro={
        <p>
          RISITEX respects your privacy and is committed to protecting your
          personal information. This policy explains how we collect, use,
          store, and safeguard your information when you visit our website,
          create an account, place an order, or interact with our services.
        </p>
      }
    >
      <PolicySection heading="Information we collect">
        <PolicyList
          items={[
            "Name, email address, and phone number",
            "Billing and shipping address",
            "Order and transaction details",
            "Account login information",
            "Device, browser, and website usage data",
            "Customer support communications",
          ]}
        />
      </PolicySection>

      <PolicySection heading="How we use information">
        <PolicyList
          items={[
            "Process and deliver orders",
            "Provide customer support",
            "Manage accounts and memberships",
            "Improve website performance and user experience",
            "Send order updates, promotions, and marketing communications",
            "Prevent fraud and ensure website security",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Data sharing">
        <p>
          RISITEX does not sell customer data. Information may be shared with
          logistics providers, payment gateways, technology partners, and
          legal authorities when required by law.
        </p>
      </PolicySection>

      <PolicySection heading="Cookies">
        <p>
          We use cookies to improve your browsing experience, analyze website
          traffic, and personalize content.
        </p>
      </PolicySection>

      <PolicySection heading="Your rights">
        <p>
          You may request access to, correction of, or deletion of your
          personal information by contacting our support team.
        </p>
      </PolicySection>

      <PolicySection heading="Data security">
        <p>
          Reasonable administrative, technical, and organizational safeguards
          are implemented to protect your personal data.
        </p>
      </PolicySection>

      <PolicySection heading="Policy updates">
        <p>
          RISITEX may update this policy periodically. Material changes will be
          reflected by an updated effective date on this page.
        </p>
      </PolicySection>

      <PolicySection heading="Contact">
        <p>
          For privacy questions or grievances, reach us at{" "}
          <a
            href="mailto:support@risitex.com"
            className="text-text-primary underline underline-offset-4"
          >
            support@risitex.com
          </a>
          .
        </p>
      </PolicySection>
    </LegalPage>
  );
}
