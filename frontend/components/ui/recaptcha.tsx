"use client";

import { useRef, useEffect } from "react";
import ReCAPTCHA from "react-google-recaptcha";

interface ReCAPTCHAProps {
  onChange: (token: string | null) => void;
  onExpired?: () => void;
  onError?: () => void;
  theme?: "light" | "dark";
  size?: "normal" | "compact";
  className?: string;
  siteKey?: string; // Allow site key to be passed as prop
}

export function ReCAPTCHAComponent({
  onChange,
  onExpired,
  onError,
  theme = "light",
  size = "normal",
  className = "",
  siteKey: propSiteKey,
}: ReCAPTCHAProps) {
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  // Use prop site key if provided, otherwise fall back to env var
  const siteKey = propSiteKey || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  useEffect(() => {
    // Reset reCAPTCHA when component mounts or when needed
    if (recaptchaRef.current) {
      recaptchaRef.current.reset();
    }
  }, []);

  if (!siteKey) {
    console.warn("reCAPTCHA site key is not configured. reCAPTCHA will not be displayed.");
    return null;
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <ReCAPTCHA
        ref={recaptchaRef}
        sitekey={siteKey}
        onChange={onChange}
        onExpired={onExpired}
        onError={onError}
        theme={theme}
        size={size}
      />
    </div>
  );
}

