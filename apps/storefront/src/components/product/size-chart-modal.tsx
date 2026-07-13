"use client";

import * as React from "react";
import { Button } from "@risitex/ui/components";


type DimensionRow = {
  name: string; // e.g. "Chest", "Waist"
  sizes: Record<string, number>; // sizeLabel -> inches value
};

type SizeChartData = {
  sizes: string[]; // e.g. ["38", "40", "42", "44"]
  dimensions: DimensionRow[];
};

const JEANS_CHART: SizeChartData = {
  sizes: ["30", "32", "34", "36"],
  dimensions: [
    { name: "Waist", sizes: { "30": 30, "32": 32, "34": 34, "36": 36 } },
    { name: "Hip", sizes: { "30": 38, "32": 40, "34": 42, "36": 44 } },
    { name: "Inseam", sizes: { "30": 32, "32": 32, "34": 32, "36": 32 } },
    { name: "Bottom", sizes: { "30": 13, "32": 13.5, "34": 14, "36": 14.5 } },
  ],
};

const INNERWEAR_CHART: SizeChartData = {
  sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
  dimensions: [
    {
      name: "Waist (To Fit)",
      // Range low bounds in inches; the display shows the low–high band.
      sizes: { S: 28, M: 32, L: 36, XL: 40, "2XL": 44, "3XL": 48, "4XL": 52 },
    },
  ],
};

// Innerwear waist bands (low–high, inches) shown verbatim in the table.
const INNERWEAR_WAIST_RANGES: Record<string, [number, number]> = {
  S: [28, 30], M: [32, 34], L: [36, 38], XL: [40, 42],
  "2XL": [44, 46], "3XL": [48, 50], "4XL": [52, 54],
};

const CHARTS: Record<string, SizeChartData> = {
  Jeans: JEANS_CHART,
  "Inner Boxer": INNERWEAR_CHART,
};

const MEASURING_GUIDE: Record<string, string[]> = {
  Chest: [
    "Measure around the fullest part of your chest, keeping the tape horizontal.",
    "Do not pull the tape too tight; leave space for comfort.",
  ],
  Waist: [
    "Measure around your natural waistline, where you normally wear your trousers.",
    "Keep one finger between the tape and your body for a correct fit.",
  ],
  Hip: [
    "Stand with your feet together and measure around the fullest point of your hips.",
  ],
  Shoulder: [
    "Measure from the outer edge of one shoulder joint across your back to the other shoulder joint.",
  ],
  Sleeve: [
    "Measure from the shoulder seam down to your wrist bone or desired cuff line.",
  ],
  Inseam: [
    "Measure from the crotch point down to the bottom ankle along the inner leg seam.",
  ],
  Bottom: [
    "Measure the width across the bottom leg opening, then double it for the full circumference.",
  ],
};

export function SizeChartModal({ garment }: { garment?: string } = {}) {
  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<string>(
    garment && CHARTS[garment] ? garment : "Jeans",
  );
  const [unit, setUnit] = React.useState<"in" | "cm">("in");

  React.useEffect(() => {
    if (garment && CHARTS[garment]) setActiveTab(garment);
  }, [garment]);

  const currentChart = CHARTS[activeTab];

  const formatVal = (inches: number) => {
    if (unit === "in") {
      return `${inches}"`;
    }
    const cm = Math.round(inches * 2.54 * 10) / 10;
    return `${cm} cm`;
  };

  const renderCell = (row: DimensionRow, sz: string): string => {
    if (activeTab === "Inner Boxer" && INNERWEAR_WAIST_RANGES[sz]) {
      const [lo, hi] = INNERWEAR_WAIST_RANGES[sz];
      if (unit === "cm") {
        const hiCm = Math.round(hi * 2.54 * 10) / 10;
        const loCm = Math.round(lo * 2.54 * 10) / 10;
        return `${loCm}–${hiCm} cm`;
      }
      return `${lo}"–${hi}"`;
    }
    return formatVal(row.sizes[sz] ?? 0);
  };

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Size Chart
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg bg-surface-background p-6 shadow-xl border border-border-subtle flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h2 className="text-heading-md text-text-primary font-display">
                RISITEX Size Guide
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-primary text-xl p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto py-4 flex-1 space-y-6">
              {/* Category tabs + Unit Selector */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-1 bg-surface-sunken p-1 rounded-md">
                  {Object.keys(CHARTS).map((tabName) => (
                    <button
                      key={tabName}
                      onClick={() => setActiveTab(tabName)}
                      className={`px-3 py-1.5 text-body-sm font-medium rounded-md transition-colors duration-fast ${
                        activeTab === tabName
                          ? "bg-surface-background text-text-primary shadow-sm"
                          : "text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      {tabName}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-md">
                  <button
                    onClick={() => setUnit("in")}
                    className={`px-2.5 py-1 text-micro font-mono rounded transition-colors ${
                      unit === "in"
                        ? "bg-action-primary-bg text-action-primary-text shadow-sm"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    INCHES
                  </button>
                  <button
                    onClick={() => setUnit("cm")}
                    className={`px-2.5 py-1 text-micro font-mono rounded transition-colors ${
                      unit === "cm"
                        ? "bg-action-primary-bg text-action-primary-text shadow-sm"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    CMS
                  </button>
                </div>
              </div>

              {/* Sizing Table */}
              {currentChart && (
                <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised">
                  <table className="w-full border-collapse text-left text-body-sm">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-sunken">
                        <th className="px-4 py-3 font-semibold text-text-primary">
                          Dimension
                        </th>
                        {currentChart.sizes.map((sz) => (
                          <th
                            key={sz}
                            className="px-4 py-3 font-semibold text-text-primary text-center font-mono"
                          >
                            {sz}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {currentChart.dimensions.map((row) => (
                        <tr key={row.name} className="hover:bg-surface-sunken">
                          <td className="px-4 py-3 font-medium text-text-secondary">
                            {row.name}
                          </td>
                          {currentChart.sizes.map((sz) => (
                            <td
                              key={sz}
                              className="px-4 py-3 text-center text-text-primary font-mono"
                            >
                              {renderCell(row, sz)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Measuring Guide section */}
              <div className="border-t border-border-subtle pt-4">
                <h3 className="text-heading-sm text-text-primary font-display mb-3">
                  How to Measure
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentChart?.dimensions.map((dim) => {
                    const cleanName = dim.name.replace(/\s*\(.*\)/, "");
                    const steps = MEASURING_GUIDE[cleanName];
                    if (!steps) return null;
                    return (
                      <div key={dim.name} className="space-y-1">
                        <h4 className="text-caption font-bold text-text-primary">
                          {cleanName}
                        </h4>
                        <ul className="list-disc list-inside text-caption text-text-muted space-y-0.5 pl-1">
                          {steps.map((step, idx) => (
                            <li key={idx} className="leading-relaxed">
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="border-t border-border-subtle pt-4 flex justify-end">
              <Button onClick={() => setOpen(false)}>Close Guide</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
