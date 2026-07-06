/**
 * Canonical RISITEX seller identity for backend-generated documents
 * (tax invoices, emails). Single source of truth — update here to change
 * the "From"/seller block and contact address everywhere the backend
 * renders company details.
 */
export const COMPANY = {
  name: "RISITEX",
  address: "#48-34-10, 4th Floor, 1st Cross, Lalbagh Road, Bangalore 560027",
  city: "Bangalore",
  state: "Karnataka",
  stateCode: "ka",
  gstin: "29ADTPR2186G1ZU",
  email: "risitexindia@gmail.com",
  phone: "+91 8660381681",
} as const
