/**
 * Utility to determine if a hex color is "dark" or "light"
 */
export function getContrastColor(hexColor: string): "black" | "white" {
    // Remove # if present
    const hex = hexColor.replace("#", "");

    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Calculate Relative Luminance
    // Formula: 0.299*R + 0.587*G + 0.114*B
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.5 ? "black" : "white";
}

/**
 * Adjusts a color for dark mode if it's too dark
 */
export function ensureVisibleColor(hexColor: string, isDarkMode: boolean): string {
    if (!isDarkMode) return hexColor;

    const hex = hexColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // If color is too dark for dark mode (luminance < 0.4), lighten it
    if (luminance < 0.4) {
        // Simple lighten: increase each channel towards 255
        const factor = 1.5;
        const newR = Math.min(255, Math.floor(r * factor + 50));
        const newG = Math.min(255, Math.floor(g * factor + 50));
        const newB = Math.min(255, Math.floor(b * factor + 50));

        return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
    }

    return hexColor;
}
