import type { CSSProperties, ReactNode } from "react";
import type { ResolvedCatalogueStyle } from "@/lib/catalogueTemplates";

/** Shared keyframes + ambient layers for the buyer catalogue. */
export function CataloguePremiumStyles({ style }: { style: ResolvedCatalogueStyle }) {
  return (
    <style>{`
      @keyframes catalogueFadeIn {
        from { opacity: 0; transform: translateY(18px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes catalogueShimmer {
        0% { transform: translateX(-120%) skewX(-12deg); opacity: 0; }
        30% { opacity: 0.55; }
        100% { transform: translateX(160%) skewX(-12deg); opacity: 0; }
      }
      @keyframes catalogueFloat {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-12px) scale(1.04); }
      }
      @keyframes cataloguePulseGlow {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 0.65; }
      }
      .catalogue-card-shine::after {
        content: "";
        pointer-events: none;
        position: absolute;
        inset: 0;
        background: linear-gradient(
          105deg,
          transparent 40%,
          ${style.accentSoft} 48%,
          rgba(255,255,255,${style.isDark ? "0.14" : "0.45"}) 50%,
          ${style.accentSoft} 52%,
          transparent 60%
        );
        opacity: 0;
        transform: translateX(-120%) skewX(-12deg);
      }
      .group:hover .catalogue-card-shine::after {
        animation: catalogueShimmer 1.1s ease;
        opacity: 1;
      }
    `}</style>
  );
}

export function CatalogueAmbientOrbs({ style }: { style: ResolvedCatalogueStyle }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -left-[10%] top-[8%] h-[42vw] max-h-[520px] w-[42vw] max-w-[520px] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${style.accentGlow} 0%, transparent 68%)`,
          animation: "catalogueFloat 14s ease-in-out infinite",
          opacity: style.isDark ? 0.55 : 0.35,
        }}
      />
      <div
        className="absolute -right-[8%] bottom-[5%] h-[38vw] max-h-[460px] w-[38vw] max-w-[460px] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${style.accentSoft} 0%, transparent 70%)`,
          animation: "catalogueFloat 18s ease-in-out infinite reverse",
          animationDelay: "-4s",
          opacity: style.isDark ? 0.5 : 0.4,
        }}
      />
      <div
        className="absolute left-1/2 top-1/3 h-[28vw] max-h-[320px] w-[28vw] max-w-[320px] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${style.accentSoft} 0%, transparent 72%)`,
          animation: "cataloguePulseGlow 8s ease-in-out infinite",
        }}
      />
      {/* Fine grain */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

export function CatalogueHairline({ style, className = "" }: { style: ResolvedCatalogueStyle; className?: string }) {
  return (
    <div
      className={`h-px w-full ${className}`}
      style={{ background: style.hairlineGradient }}
      aria-hidden
    />
  );
}

export function CatalogueGlassPanel({
  style,
  children,
  className = "",
  styleOverride,
}: {
  style: ResolvedCatalogueStyle;
  children: ReactNode;
  className?: string;
  styleOverride?: CSSProperties;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: style.panelGradient,
        borderRadius: style.cardRadius,
        border: `1px solid ${style.border}`,
        boxShadow: style.cardShadow,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        ...styleOverride,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: style.hairlineGradient }}
      />
      {children}
    </div>
  );
}

/** Gradient-rimmed card frame; keep image area aspect 2/3 inside. */
export function CatalogueGradientFrame({
  style,
  children,
  className = "",
}: {
  style: ResolvedCatalogueStyle;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative p-[1px] transition duration-500 ${className}`}
      style={{
        background: style.cardBorderGradient,
        borderRadius: style.cardRadius,
        boxShadow: style.cardShadow,
      }}
    >
      <div
        className="catalogue-card-shine relative overflow-hidden"
        style={{
          borderRadius: `calc(${style.cardRadius} - 1px)`,
          background: style.surfaceGradient,
        }}
      >
        {children}
      </div>
    </div>
  );
}
