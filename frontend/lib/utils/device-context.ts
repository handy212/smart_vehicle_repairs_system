/** Breakpoint aligned with portal/dashboard desktop shell (lg). */
export const MOBILE_APP_BREAKPOINT_PX = 1024;

const MOBILE_USER_AGENT_PATTERN =
  /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i;

/** True when the browser viewport is below the desktop shell breakpoint. */
export function isMobileViewport(width = typeof window !== "undefined" ? window.innerWidth : 0): boolean {
  return width < MOBILE_APP_BREAKPOINT_PX;
}

/** True for phone/tablet user agents (used when viewport is not yet available). */
export function isMobileUserAgent(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""
): boolean {
  return MOBILE_USER_AGENT_PATTERN.test(userAgent);
}

/**
 * Whether the client should use the field technician mobile shell.
 * Desktop browsers always get the staff dashboard even for technician logins.
 */
export function shouldUseMobileApp(
  width = typeof window !== "undefined" ? window.innerWidth : MOBILE_APP_BREAKPOINT_PX,
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""
): boolean {
  return isMobileViewport(width) || isMobileUserAgent(userAgent);
}
