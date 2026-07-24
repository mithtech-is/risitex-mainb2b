/**
 * Shared "Vexo" theme <style> — the palette, fonts and theme-reactive semantic
 * overrides that give the homepage its look. Extracted so any page can adopt
 * the exact same identity by wrapping its content in `.rx-vexo` and rendering
 * <VexoThemeStyle/> once. Used by the homepage and the About page.
 *
 * THEME-REACTIVE: light tokens by default, dark override under
 * html[data-theme="dark"]. Header semantic tokens are forced light ONLY in
 * light mode (so the design system's own dark tokens drive the navbar in dark
 * mode). The footer is left to the theme so it flips and its logo toggle
 * resolves. Specificity note: html:root:not([data-theme="dark"]):has(.rx-vexo)
 * scores (0,3,1), beating the design system's :root[data-theme="dark"] (0,2,0);
 * html[data-theme="dark"] .rx-vexo (0,2,1) beats .rx-vexo.
 */
export function VexoThemeStyle() {
  return (
    <style>{`
        html:root:not([data-theme="dark"]):has(.rx-vexo) {
          --surface-background: #EDEFEF;
          --surface-raised:     #FFFFFF;
          --surface-sunken:     #F2F3F3;
          --surface-inverse:    #0B0808;
          --text-primary:       #0B0808;
          --text-secondary:     #3A332F;
          --text-muted:         #5D4D45;
          --text-on-accent:     #FFFFFF;
          --text-on-inverse:    #FFFFFF;
          --border-subtle:      #E1E4E4;
          --border-strong:      #D1D6D8;
          --border-focus:       #0B0808;
          --brand-accent:       #0B0808;
          --brand-accent-muted: #5D4D45;
          --brand-accent-surface: #F2F3F3;
          --action-primary-bg:  #0B0808;
          --action-primary-bg-hover: #5D4D45;
          --action-primary-bg-active: #000000;
          --action-primary-text: #FFFFFF;
          --action-secondary-bg: #FFFFFF;
          --action-secondary-bg-hover: #F2F3F3;
          --action-secondary-text: #0B0808;
          color-scheme: light;
        }

        /* ── VEXO PALETTE — light default ── */
        .rx-vexo {
          --vx-bg:        #EDEFEF;
          --vx-card:      #FFFFFF;
          --vx-card-2:    #E4E7E7;
          --vx-line:      #E1E4E4;
          --vx-ink:       #0B0808;
          --vx-ink-soft:  #5D4D45;
          --vx-panel:     #0B0808;
          --vx-on-panel:  #EDEFEF;
          --vx-btn:       #0B0808;
          --vx-btn-fg:    #FFFFFF;
          --vx-btn-hover: #5D4D45;
          --vx-chip:      #0B0808;
          --vx-chip-fg:   #FFFFFF;
          --vx-pill:      rgba(255,255,255,0.92);
          --vx-mist:      #D1D6D8;
          --vx-sage:      #98AEB3;
          --vx-max:       1240px;
          background: var(--vx-bg);
          color: var(--vx-ink);
          font-family: var(--font-space-grotesk), system-ui, sans-serif;
        }

        /* ── VEXO PALETTE — dark override ── */
        html[data-theme="dark"] .rx-vexo {
          --vx-bg:        #0E0F10;
          --vx-card:      #17191A;
          --vx-card-2:    #202325;
          --vx-line:      #282C2E;
          --vx-ink:       #ECEEEE;
          --vx-ink-soft:  #9AA1A1;
          --vx-panel:     #17191A;
          --vx-on-panel:  #ECEEEE;
          --vx-btn:       #ECEEEE;
          --vx-btn-fg:    #0B0808;
          --vx-btn-hover: #C6CFD0;
          --vx-chip:      #ECEEEE;
          --vx-chip-fg:   #0B0808;
          --vx-pill:      rgba(20,22,24,0.86);
          --vx-mist:      #2A2E30;
        }

        /* ONE typeface: Space Grotesk carries display AND accent. .vx-display is
         * the heavy-headline hook; .vx-serif is the LIGHT accent (weight
         * contrast — Space Grotesk has no italic). */
        .rx-vexo .vx-display {
          font-family: var(--font-space-grotesk), system-ui, sans-serif;
        }
        .rx-vexo .vx-serif {
          font-family: var(--font-space-grotesk), system-ui, sans-serif;
          font-style: normal;
          font-weight: 300;
        }

        @keyframes rx-ambient {
          0%   { transform: rotate(0deg)   translate(1.1em) rotate(0deg)    scale(1.2); }
          100% { transform: rotate(360deg) translate(1.1em) rotate(-360deg) scale(1.2); }
        }
        .rx-ambient { animation: rx-ambient 30s linear infinite; }
        @keyframes rx-bar { from { width: 0 } to { width: 100% } }
        @keyframes rx-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .rx-ticker { animation: rx-ticker linear infinite; }
        @media (prefers-reduced-motion: reduce) { .rx-ambient, .rx-ticker { animation: none !important; } }
      `}</style>
  );
}
