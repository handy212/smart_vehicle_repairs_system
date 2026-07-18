"use client";
/* eslint-disable @next/next/no-img-element -- Branding images are admin-configured and may come from arbitrary external URLs. */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MoveLeft } from "lucide-react";
import AuthBrandMark from "@/components/auth/AuthBrandMark";
import { useBranding } from "@/lib/hooks/useBranding";

const DEFAULT_HERO_IMAGE = "/images/login-hero.png";

type AuthShellProps = {
  /** Large brand-plane headline; defaults to site name. */
  headline?: string;
  /** Supporting line under the brand headline. */
  description?: string;
  /** Optional title inside the light form panel. */
  panelTitle?: string;
  /** Optional subtitle inside the light form panel. */
  panelDescription?: string;
  /** Content below the form panel (e.g. register / sign-in links). */
  panelFooter?: ReactNode;
  /** Wider panel for denser forms like registration. */
  panelSize?: "md" | "lg";
  backHref?: string;
  backLabel?: string;
  /** When set, used instead of navigating to backHref. */
  onBack?: () => void;
  children: ReactNode;
};

/**
 * Shared full-bleed auth stage. Form panel always uses light tokens so
 * signing out from dark mode never leaves unreadable copy.
 */
export default function AuthShell({
  headline,
  description,
  panelTitle,
  panelDescription,
  panelFooter,
  panelSize = "md",
  backHref,
  backLabel = "Back to login",
  onBack,
  children,
}: AuthShellProps) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const {
    siteName,
    tagline,
    primaryColor,
    logoPath,
    logoDarkPath,
    loginBackground,
    logoSrc,
    getMediaUrl,
  } = useBranding("public");

  useEffect(() => {
    setIsMounted(true);
    // One-shot light preference for auth — do not observe class mutations
    // (useBranding → useTheme would fight an observer and freeze the page).
    document.documentElement.classList.remove("dark");
  }, []);

  const heroImage = loginBackground
    ? getMediaUrl(loginBackground) || DEFAULT_HERO_IMAGE
    : DEFAULT_HERO_IMAGE;

  const heroLogo = logoDarkPath || logoPath;
  const heroLogoSrc = heroLogo
    ? getMediaUrl(heroLogo) || logoSrc || null
    : logoSrc || null;

  const brandHeadline = headline?.trim() || siteName;
  const brandDescription =
    description?.trim() ||
    tagline?.trim() ||
    "Manage jobs, pipelines, and the shop floor in one place.";

  const panelWidth =
    panelSize === "lg"
      ? "lg:w-[min(100%,30rem)] xl:w-[32rem]"
      : "lg:w-[min(100%,24.5rem)] xl:w-[26rem]";

  return (
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#0f1419]">
      <style>{`
        @keyframes auth-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes auth-panel-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-rise { animation: auth-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .auth-rise-delay { animation: auth-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both; }
        .auth-panel-in { animation: auth-panel-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both; }
        @media (prefers-reduced-motion: reduce) {
          .auth-rise,
          .auth-rise-delay,
          .auth-panel-in { animation: none; }
        }
      `}</style>

      {/* Stage fills remaining height above footer — never 100dvh + footer */}
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute inset-0" style={{ backgroundColor: primaryColor }} />
          {isMounted && (
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-65"
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(105deg, rgba(12,16,22,0.82) 0%, rgba(12,16,22,0.5) 45%, rgba(12,16,22,0.72) 100%),
                linear-gradient(to top, ${primaryColor}b3 0%, ${primaryColor}33 42%, transparent 72%)
              `,
            }}
          />
        </div>

        {/* Brand plane — compact on short viewports */}
        <div className="relative z-10 flex shrink-0 flex-col justify-end px-5 pb-4 pt-6 sm:px-8 lg:min-h-0 lg:flex-1 lg:justify-between lg:px-10 lg:pb-10 lg:pt-10 xl:px-14">
          <div className="auth-rise hidden lg:block">
            <AuthBrandMark
              logoSrc={heroLogoSrc}
              siteName={siteName}
              primaryColor="#ffffff"
              variant="hero"
              size="md"
            />
          </div>

          <div className="auth-rise-delay max-w-lg space-y-2 lg:space-y-3">
            <div className="lg:hidden">
              <AuthBrandMark
                logoSrc={heroLogoSrc}
                siteName={siteName}
                primaryColor="#ffffff"
                variant="hero"
                size="md"
              />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white leading-[1.08] text-balance sm:text-4xl lg:text-[2.75rem] xl:text-5xl">
              {brandHeadline}
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
              {brandDescription}
            </p>
          </div>
        </div>

        {/* Form column — scrolls internally if content is tall (register) */}
        <div
          className={`relative z-10 flex min-h-0 w-full flex-1 flex-col justify-center overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 lg:flex-none lg:px-0 lg:py-6 lg:pr-8 xl:pr-12 ${panelWidth}`}
        >
          <div className="auth-panel-in mx-auto w-full max-w-md space-y-3 lg:mx-0 lg:max-w-none">
            {(backHref || onBack) && (
              <button
                type="button"
                onClick={() => {
                  if (onBack) onBack();
                  else if (backHref) router.push(backHref);
                }}
                className="group flex items-center text-sm font-semibold text-white/75 transition-colors hover:text-white"
              >
                <MoveLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                {backLabel}
              </button>
            )}

            <div
              className="auth-panel rounded-xl border border-white/20 p-4 shadow-[0_20px_48px_-18px_rgba(0,0,0,0.55)] sm:p-5 lg:p-6"
              style={{ borderTop: `3px solid ${primaryColor}` }}
            >
              {(panelTitle || panelDescription) && (
                <div className="mb-4 space-y-1">
                  {panelTitle && (
                    <h2 className="text-lg font-bold tracking-tight text-[var(--foreground)] sm:text-xl">
                      {panelTitle}
                    </h2>
                  )}
                  {panelDescription && (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {panelDescription}
                    </p>
                  )}
                </div>
              )}
              {children}
            </div>

            {panelFooter}
          </div>
        </div>
      </div>

      <footer className="relative z-10 shrink-0 border-t border-white/10 bg-black/30 px-4 py-2.5 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center text-center text-[11px] text-white/65 sm:text-xs">
          <p className="w-full max-w-full px-2 text-balance break-words">
            © 2026 American AutoParts. Developed by{" "}
            <a
              href="https://safetracksystems.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white/90 hover:underline"
            >
              SafeTrack Systems
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
