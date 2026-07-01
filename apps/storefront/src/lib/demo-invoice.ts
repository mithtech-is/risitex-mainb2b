function escapePdfString(s: string): string {
  if (!s) return "()";
  const esc = s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const truncated = esc.length > 100 ? esc.slice(0, 97) + "..." : esc;
  return `(${truncated})`;
}

function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

function addObj(objs: string[], s: string): number {
  const n = objs.length + 2;
  objs.push(`${n} 0 obj\n${s}\nendobj`);
  return n;
}

/**
 * Generates a client-side fallback PDF when the backend invoice route
 * is unavailable.  Mirrors the layout of the real backend PDF (header,
 * invoice meta, address block, items table placeholder, summary) so
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

  const left = 50;
  const right = 562;
  const midX = 306;

  // ── Build PDF objects ──────────────────────────────────────────
  const objs: string[] = [];

  const fontHelv = addObj(objs, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = addObj(objs, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const fontItalic = addObj(objs, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>");

  const lines: string[] = [];

  // Helper: draw a horizontal rule
  function rule(y: number): void {
    lines.push(
      `${left} ${y} m ${right} ${y} l S`,
    );
  }

  // Helper: write text at (x, y) with font size
  function text(s: string, x: number, y: number, size: number, font: number): void {
    if (!s) return;
    lines.push(`/${font === 1 ? "F1" : font === 2 ? "F2" : "F3"} ${size} Tf`);
    lines.push(`${x} ${y} Td`);
    lines.push(`${escapePdfString(s)} Tj`);
  }

  // ══════════════════════════════════════════════════════════════
  // Page 1 content
  // ══════════════════════════════════════════════════════════════
  lines.push("BT");

  // 1. Header
  text("RISITEX", left, 750, 20, 2);
  text("Tax Invoice", right - 80, 754, 9, 1);

  lines.push("ET");
  lines.push("q 0.502 0.463 0.408 RG 0.6 w");
  rule(714);
  lines.push("Q");
  lines.push("BT");

  // 2. Invoice meta — left column "From", right column invoice no
  text("From", left, 698, 9, 1);
  text("RISITEX (PIX)", left, 710, 11, 2);
  text("Erode, Tamil Nadu, India", left, 684, 9, 1);

  const metaLines = [
    `Invoice no.  ${display}`,
    `Issued:      ${dateStr}`,
    `Status:      Payment — pending   ·   Fulfillment — not fulfilled`,
  ];
  let metaY = 698;
  for (const l of metaLines) {
    text(l, midX, metaY, 9, metaY === 698 ? 2 : 1);
    metaY -= 14;
  }

  // 3. Divider + Bill / Ship to
  lines.push("ET");
  lines.push("q 0.502 0.463 0.408 RG 0.6 w");
  rule(610);
  lines.push("Q");
  lines.push("BT");

  text("Bill to", left, 596, 9, 1);
  text("Customer", left, 582, 10, 1);
  if (customerEmail) {
    text(customerEmail, left, 568, 9, 1);
  }
  text("Ship to", midX, 596, 9, 1);
  text("(see bill to)", midX, 582, 10, 1);
  text(orderId, left, 554, 7, 3);

  // 4. Items table header
  lines.push("ET");
  lines.push("q 0.502 0.463 0.408 RG 0.6 w");
  rule(530);
  lines.push("Q");
  lines.push("BT");

  const colSku = left;
  const colItem = left + 90;
  const colQty = 360;
  const colUnit = 420;
  const colAmt = 490;

  text("SKU", colSku, 526, 8, 2);
  text("ITEM", colItem, 526, 8, 2);
  text("QTY", colQty, 526, 8, 2);
  text("UNIT", colUnit, 526, 8, 2);
  text("AMOUNT", colAmt, 526, 8, 2);

  lines.push("ET");
  lines.push("q 0.502 0.463 0.408 RG 0.6 w");
  rule(516);
  lines.push("Q");
  lines.push("BT");

  // 5. Items placeholder
  text("—", colSku, 506, 9, 1);
  text("(Demo invoice — item data unavailable)", colItem, 506, 9, 3);

  // 6. Divider before totals
  lines.push("ET");
  lines.push("q 0.502 0.463 0.408 RG 0.6 w");
  rule(480);
  lines.push("Q");
  lines.push("BT");

  // 7. Summary (demo)
  const sumLabels = ["Subtotal", "Shipping", "Tax", "Total"];
  const sumValues = ["—", "—", "—", "—"];
  let sumY = 468;
  for (let i = 0; i < sumLabels.length; i++) {
    const bold = i === sumLabels.length - 1;
    text(sumLabels[i], 320, sumY, bold ? 10 : 9, bold ? 2 : 1);
    text(sumValues[i], 490, sumY, bold ? 10 : 9, bold ? 2 : 1);
    sumY -= bold ? 18 : 14;
  }

  // 8. Footer
  lines.push("ET");
  lines.push("q 0.502 0.463 0.408 RG 0.6 w");
  rule(340);
  lines.push("Q");
  lines.push("BT");

  text("This is a demo invoice. Not a valid tax invoice for GST purposes.", left, 330, 8, 3);
  text("Thank you for ordering from RISITEX.", left, 316, 8, 1);

  lines.push("ET");

  const stream = lines.join("\n");
  const streamLen = byteLen(stream);
  const contentObj = addObj(objs, `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`);

  const resources = `<< /Font << /F1 ${fontHelv} /F2 ${fontBold} /F3 ${fontItalic} >> >>`;
  const pageObj = addObj(
    objs,
    `<< /Type /Page /Parent ${objs.length + 2} 0 R /MediaBox [0 0 612 792] /Contents ${contentObj} /Resources ${resources} >>`,
  );

  const pagesObjNum = addObj(objs, `<< /Type /Pages /Kids [${pageObj}] /Count 1 >>`);

  const catalog = `1 0 obj\n<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>\nendobj`;
  const allObjs = [catalog, ...objs];
  const body = allObjs.join("\n");
  const xrefOffset = byteLen(body) + allObjs.length - 1;

  const xref = [
    "xref",
    `0 ${allObjs.length + 1}`,
    "0000000000 65535 f ",
    `${String(xrefOffset).padStart(10, "0")} 00000 n `,
    "trailer",
    `<< /Size ${allObjs.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");

  return new Blob([`%PDF-1.4\n${body}\n${xref}`], { type: "application/pdf" });
}
