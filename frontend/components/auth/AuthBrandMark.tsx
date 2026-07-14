/* eslint-disable @next/next/no-img-element -- Branding images are admin-configured and may come from arbitrary external URLs. */

import { Car } from "lucide-react";

type AuthBrandMarkProps = {
  logoSrc: string | null;
  siteName: string;
  primaryColor: string;
  /** Hero panel sits on colored/image backgrounds; form variant is for the light panel. */
  variant?: "hero" | "form";
  size?: "md" | "lg";
  className?: string;
};

/**
 * Brand logo for auth pages — no frame, just the image at a clear size.
 */
export default function AuthBrandMark({
  logoSrc,
  siteName,
  primaryColor,
  size = "lg",
  className = "",
}: AuthBrandMarkProps) {
  const imgHeight = size === "lg" ? "h-24 xl:h-28" : "h-16 sm:h-20";
  const iconBox = size === "lg" ? "h-24 w-24 xl:h-28 xl:w-28" : "h-16 w-16 sm:h-20 sm:w-20";
  const iconSize = size === "lg" ? "h-12 w-12 xl:h-14 xl:w-14" : "h-9 w-9 sm:h-10 sm:w-10";

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={siteName}
          className={`${imgHeight} w-auto max-w-[320px] object-contain drop-shadow-sm`}
        />
      ) : (
        <div className={`${iconBox} flex items-center justify-center`}>
          <Car className={iconSize} style={{ color: primaryColor }} aria-hidden />
        </div>
      )}
    </div>
  );
}
