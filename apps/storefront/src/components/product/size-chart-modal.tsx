"use client";

import * as React from "react";
import { Button } from "@risitex/ui/components";

type SizeValue = {
  inches: number;
  label: string; // e.g. "38", "S", etc.
};

type DimensionRow = {
  name: string; // e.g. "Chest", "Waist"
  sizes: Record<string, number>; // sizeLabel -> inches value
};

type SizeChartData = {
  sizes: string[]; // e.g. ["38", "40", "42", "44"]
  dimensions: DimensionRow[];
};

const SHIRT_CHART: SizeChartData = {
  sizes: ["38", "40", "42", "44"],
  dimensions: [
    { name: "Chest", sizes: { "38": 40, "40": 42, "42": 44, "44": 46 } },
    { name: "Waist", sizes: { "38": 36, "40": 38, "42": 40, "44": 42 } },
    { name: "Length", sizes: { "38": 29.5, "40": 30, "42": 30.5, "44": 31 } },
    { name: "Shoulder", sizes: { "38": 18, "40": 18.5, "42": 19, "44": 19.5 } },
    { name: "Sleeve", sizes: { "38": 25, "40": 25.5, "42": 26, "44": 26.5 } },
  ],
};

const TSHIRT_CHART: SizeChartData = {
  sizes: ["S", "M", "L", "XL"],
  dimensions: [
    { name: "Chest", sizes: { "S": 38, "M": 40, "L": 42, "XL": 44 } },
    { name: "Length", sizes: { "S": 27, "M": 28, "L": 29, "XL": 30 } },
    { name: "Sleeve", sizes: { "S": 8, "M": 8.5, "L": 9, "XL": 9.5 } },
  ],
};

const JEANS_CHART: SizeChartData = {
  sizes: ["30", "32", "34", "36"],
  dimensions: [
    { name: "Waist", sizes: { "30": 30, "32": 32, "34": 34, "36": 36 } },
    { name: "Hip", sizes: { "30": 38, "32": 40, "34": 42, "36": 44 } },
    { name: "Inseam", sizes: { "30": 32, "32": 32, "34": 32, "36": 32 } },
    { name: "Rise", sizes: { "30": 10, "32": 10.5, "34": 11, "36": 11.5 } },
  ],
};

const TROUSER_CHART: SizeChartData = {
  sizes: ["30", "32", "34", "36"],
  dimensions: [
    { name: "Waist", sizes: { "30": 30, "32": 32, "34": 34, "36": 36 } },
    { name: "Hip", sizes: { "30": 39, "32": 41, "34": 43, "36": 45 } },
    { name: "Inseam", sizes: { "30": 31, "32": 31, "34": 31, "36": 31 } },
    { name: "Rise", sizes: { "30": 9.5, "32": 10, "34": 10.5, "36": 11 } },
  ],
};

const INNERWEAR_CHART: SizeChartData = {
  sizes: ["S", "M", "L", "XL"],
  dimensions: [
    { name: "Waist (To Fit)", sizes: { "S": 28, "M": 32, "L": 36, "XL": 40 } },
  ],
};

const VEST_CHART: SizeChartData = {
  sizes: ["S", "M", "L", "XL"],
  dimensions: [
    { name: "Chest (To Fit)", sizes: { "S": 36, "M": 40, "L": 44, "XL": 48 } },
  ],
};

const CHARTS: Record<string, SizeChartData> = {
  Shirt: SHIRT_CHART,
  "T-Shirt": TSHIRT_CHART,
  Jeans: JEANS_CHART,
  Trouser: TROUSER_CHART,
  Innerwear: INNERWEAR_CHART,
  Vest: VEST_CHART,
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
};

export function SizeChartModal() {
  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<string>("Shirt");
  const [unit, setUnit] = React.useState<"in" | "cm">("in");

  const currentChart = CHARTS[activeTab];

  const formatVal = (inches: number) => {
    if (unit === "in") {
      return `${inches}"`;
    }
    const cm = Math.round(inches * 2.54 * 10) / 10;
    return `${cm} cm`;
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
                              {formatVal(row.sizes[sz] ?? 0)}
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
