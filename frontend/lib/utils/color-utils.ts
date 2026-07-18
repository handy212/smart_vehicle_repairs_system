/**
 * Parse a CSS color string into RGB channels.
 * Supports #rgb, #rrggbb, rgb()/rgba(), and a few named colors.
 */
function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const raw = color.trim().toLowerCase();
  if (!raw) return null;

  const named: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    navy: "#000080",
    gray: "#808080",
    grey: "#808080",
  };
  const value = named[raw] || raw;

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if ([r, g, b].some((n) => Number.isNaN(n))) return null;
      return { r, g, b };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].some((n) => Number.isNaN(n))) return null;
      return { r, g, b };
    }
    return null;
  }

  const rgbMatch = value.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/,
  );
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }

  return null;
}

/**
 * Utility to determine if a color is "dark" or "light" for contrast text.
 */
export function getContrastColor(hexColor: string): "black" | "white" {
  const rgb = parseRgb(hexColor);
  if (!rgb) return "black";

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? "black" : "white";
}

/**
 * Adjusts a color for dark mode if it's too dark
 */
export function ensureVisibleColor(hexColor: string, isDarkMode: boolean): string {
  if (!isDarkMode) return hexColor;

  const rgb = parseRgb(hexColor);
  if (!rgb) return hexColor;

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;

  // If color is too dark for dark mode (luminance < 0.4), lighten it
  if (luminance < 0.4) {
    const factor = 1.5;
    const newR = Math.min(255, Math.floor(rgb.r * factor + 50));
    const newG = Math.min(255, Math.floor(rgb.g * factor + 50));
    const newB = Math.min(255, Math.floor(rgb.b * factor + 50));

    return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
  }

  return hexColor.startsWith("#") ? hexColor : `#${hexColor}`;
}
