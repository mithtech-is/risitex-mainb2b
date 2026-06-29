"use client";

import * as React from "react";
import { cn } from "./utils";

export type FabricMetric = {
  label: string;
  /** Display value as string (e.g. "110 GSM") */
  value: string;
  /** Normalised position 0..1 along the scale for the bar indicator */
  scale?: number;
  /** Low and high end labels for the scale */
  scaleLowLabel?: string;
  scaleHighLabel?: string;
};

export type FabricIntelligenceProps = {
  /** Top-level GSM as the headline number */
  gsm: number;
  yarnCount: string;
  weave: string;
  composition: string;
  /** 0..1 normalised values used to render quick visual bars */
  metrics?: {
    breathability?: number;
    weight?: number;
    drape?: number;
    durability?: number;
    sheerness?: number;
  };
  /** Shrinkage percentages */
  dryShrinkagePct?: number;
  wetShrinkagePct?: number;
  /** Colourfastness on 1–5 (ISO grade) */
  colourfastness?: 1 | 2 | 3 | 4 | 5;
  /** OEKO-TEX or similar certification badges */
  certifications?: string[];
  className?: string;
};

/**
 * Fabric Intelligence — the textile-specific spec block.
 *
 * Headline GSM + yarn count + weave + composition on top, then a quick visual
 * map of weight / drape / breathability / durability / sheerness as 5 little
 * bars, then shrinkage + colourfastness + certifications. Built for buyers
 * who actually know what these numbers mean and need to compare across SKUs.
 */
export function FabricIntelligence({
  gsm,
  yarnCount,
  weave,
  composition,
  metrics = {},
  dryShrinkagePct,
  wetShrinkagePct,
  colourfastness,
  certifications = [],
  className,
}: FabricIntelligenceProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised numerics-tabular",
        className,
      )}
    >
      <header className="border-b border-border-subtle px-6 py-5">
        <p className="text-micro text-text-muted">Fabric intelligence</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <p className="text-micro text-text-muted">GSM</p>
            <p className="font-display text-display-lg text-text-primary">{gsm}</p>
          </div>
          <div>
            <p className="text-micro text-text-muted">Yarn count</p>
            <p className="font-display text-heading-lg text-text-primary">
              {yarnCount}
            </p>
          </div>
          <div>
            <p className="text-micro text-text-muted">Weave</p>
            <p className="font-display text-heading-lg text-text-primary">
              {weave}
            </p>
          </div>
          <div>
            <p className="text-micro text-text-muted">Composition</p>
            <p className="font-display text-heading-lg text-text-primary">
              {composition}
            </p>
          </div>
        </div>
      </header>

      {/* Visual metric bars */}
      <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-2">
        {metrics.weight !== undefined && (
          <MetricBar label="Weight" lowLabel="Light" highLabel="Heavy" value={metrics.weight} />
        )}
        {metrics.drape !== undefined && (
          <MetricBar label="Drape" lowLabel="Stiff" highLabel="Fluid" value={metrics.drape} />
        )}
        {metrics.breathability !== undefined && (
          <MetricBar
            label="Breathability"
            lowLabel="Low"
            highLabel="High"
            value={metrics.breathability}
          />
        )}
        {metrics.durability !== undefined && (
          <MetricBar
            label="Durability"
            lowLabel="Delicate"
            highLabel="Rugged"
            value={metrics.durability}
          />
        )}
        {metrics.sheerness !== undefined && (
          <MetricBar
            label="Sheerness"
            lowLabel="Opaque"
            highLabel="Sheer"
            value={metrics.sheerness}
          />
        )}
      </div>

      {/* Shrinkage + colourfastness + certifications */}
      <div className="grid grid-cols-1 gap-6 border-t border-border-subtle px-6 py-5 md:grid-cols-3">
        {(dryShrinkagePct !== undefined || wetShrinkagePct !== undefined) && (
          <div>
            <p className="text-micro text-text-muted">Shrinkage</p>
            <div className="mt-2 flex flex-col gap-1 text-body-md text-text-primary">
              {dryShrinkagePct !== undefined && (
                <span>Dry · <strong className="font-medium">{dryShrinkagePct.toFixed(1)}%</strong></span>
              )}
              {wetShrinkagePct !== undefined && (
                <span>Wet · <strong className="font-medium">{wetShrinkagePct.toFixed(1)}%</strong></span>
              )}
            </div>
          </div>
        )}
        {colourfastness && (
          <div>
            <p className="text-micro text-text-muted">Colourfastness</p>
            <p className="mt-2 text-body-md text-text-primary">
              <strong className="font-medium">{colourfastness} / 5</strong>{" "}
              <span className="text-text-muted">(ISO 105)</span>
            </p>
            <div className="mt-1 inline-flex gap-1">
              {[1, 2, 3, 4, 5].map((g) => (
                <span
                  key={g}
                  aria-hidden
                  className={cn(
                    "inline-block h-1.5 w-5 rounded-full",
                    g <= colourfastness
                      ? "bg-brand-accent"
                      : "bg-border-subtle",
                  )}
                />
              ))}
            </div>
          </div>
        )}
        {certifications.length > 0 && (
          <div>
            <p className="text-micro text-text-muted">Certifications</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {certifications.map((c) => (
                <li
                  key={c}
                  className="inline-flex items-center rounded-full bg-feedback-success-bg px-2 py-0.5 text-caption text-feedback-success-text ring-1 ring-feedback-success-border"
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function MetricBar({
  label,
  lowLabel,
  highLabel,
  value,
}: {
  label: string;
  lowLabel: string;
  highLabel: string;
  /** 0..1 */
  value: number;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-caption font-medium text-text-primary">{label}</span>
        <span className="text-caption text-text-muted">
          {lowLabel} · {highLabel}
        </span>
      </div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle">
        <div
          className="absolute inset-y-0 left-0 bg-brand-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
