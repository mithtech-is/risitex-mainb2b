import { jsPDF } from "jspdf";

/**
 * Generates a client-side fallback PDF when the backend invoice route
 * is unavailable. Mirrors the layout of the real backend PDF so
 * the user gets a consistent visual experience even offline.
 */
export function generateDemoInvoicePdf(
  orderId: string,
  displayId?: number | string,
  customerEmail?: string,
): Blob {
  const display = displayId
    ? `RST-${String(displayId).padStart(6, "0")}`
    : orderId;
  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const doc = new jsPDF({
    unit: "pt",
    format: "letter"
  });

  const left = 50;
  const right = 562;
  const midX = 306;

  // Helper: draw a horizontal rule
  function rule(y: number): void {
    doc.setDrawColor(128, 118, 104); // roughly 0.502 0.463 0.408 in RGB
    doc.setLineWidth(0.6);
    doc.line(left, y, right, y);
  }

  // Helper: write text at (x, y) with font size
  // In jsPDF, Y is from top to bottom. The previous code had Y from bottom to top (792 to 0).
  // 792 - y = jsPDF Y.
  function text(s: string, x: number, y: number, size: number, fontStyle: "normal" | "bold" | "italic"): void {
    if (!s) return;
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(size);
    doc.text(s, x, 792 - y); // Convert bottom-up Y to top-down Y
  }

  // 1. Header
  text("RISITEX", left, 750, 20, "bold");
  text("Tax Invoice", right - 80, 754, 9, "normal");

  rule(792 - 714);

  // 2. Invoice meta
  text("From", left, 698, 9, "normal");
  text("RISITEX (PIX)", left, 710, 11, "bold");
  text("Erode, Tamil Nadu, India", left, 684, 9, "normal");

  const metaLines = [
    `Invoice no.  ${display}`,
    `Issued:      ${dateStr}`,
    `Status:      Payment — pending   ·   Fulfillment — not fulfilled`,
  ];
  let metaY = 698;
  for (const l of metaLines) {
    text(l, midX, metaY, 9, metaY === 698 ? "bold" : "normal");
    metaY -= 14;
  }

  // 3. Divider + Bill / Ship to
  rule(792 - 610);

  text("Bill to", left, 596, 9, "normal");
  text("Customer", left, 582, 10, "normal");
  if (customerEmail) {
    text(customerEmail, left, 568, 9, "normal");
  }
  text("Ship to", midX, 596, 9, "normal");
  text("(see bill to)", midX, 582, 10, "normal");
  text(orderId, left, 554, 7, "italic");

  // 4. Items table header
  rule(792 - 530);

  const colSku = left;
  const colItem = left + 90;
  const colQty = 360;
  const colUnit = 420;
  const colAmt = 490;

  text("SKU", colSku, 526, 8, "bold");
  text("ITEM", colItem, 526, 8, "bold");
  text("QTY", colQty, 526, 8, "bold");
  text("UNIT", colUnit, 526, 8, "bold");
  text("AMOUNT", colAmt, 526, 8, "bold");

  rule(792 - 516);

  // 5. Items placeholder
  text("—", colSku, 506, 9, "normal");
  text("(Demo invoice — item data unavailable)", colItem, 506, 9, "italic");

  // 6. Divider before totals
  rule(792 - 480);

  // 7. Summary (demo)
  const sumLabels = ["Subtotal", "Shipping", "Tax", "Total"];
  const sumValues = ["—", "—", "—", "—"];
  let sumY = 468;
  for (let i = 0; i < sumLabels.length; i++) {
    const label = sumLabels[i];
    const value = sumValues[i];

    if (label === undefined || value === undefined) continue;

    const bold = i === sumLabels.length - 1;

    text(label, 320, sumY, bold ? 10 : 9, bold ? "bold" : "normal");
    text(value, 490, sumY, bold ? 10 : 9, bold ? "bold" : "normal");

    sumY -= bold ? 18 : 14;
  }

  // 8. Footer
  rule(792 - 340);

  text("This is a demo invoice. Not a valid tax invoice for GST purposes.", left, 330, 8, "italic");
  text("Thank you for ordering from RISITEX.", left, 316, 8, "normal");

  return doc.output('blob');
}
