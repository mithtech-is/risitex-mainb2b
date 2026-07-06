/**
 * Canonical RISITEX company / contact details.
 *
 * Single source of truth for every user-facing mention of the company's
 * address, GST, email, phone, and physical location. Change it here and it
 * propagates to the contact page, footer, policy pages, structured data,
 * and any "email the company / support" links.
 */
export const COMPANY = {
  name: "RISITEX",
  /** Operating legal entity (used in the footer copyright line). */
  legalEntity: "Mithtech Innovative Solutions",
  address: "#48-34-10, 4th Floor, 1st Cross, Lalbagh Road, Bangalore 560027",
  city: "Bangalore",
  state: "Karnataka",
  postalCode: "560027",
  country: "India",
  gstin: "29ADTPR2186G1ZU",
  /** All company mail — support, finance, general — routes here. */
  email: "risitexindia@gmail.com",
  phone: "+91 8660381681",
  /** Google Maps link to the office, used for "Get directions". */
  mapsUrl: "https://maps.app.goo.gl/BWYxGr63rTCWM3un9?g_st=iwb",
} as const;

/** `tel:` / `mailto:`-safe phone (no spaces). */
export const COMPANY_PHONE_HREF = COMPANY.phone.replace(/\s+/g, "");
