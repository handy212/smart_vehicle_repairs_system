/**
 * Utilities for API data handling
 */

/**
 * Gets the full URL for a media file (image, document, etc.)
 * Handles both relative paths from Django and already absolute URLs.
 */
export function getMediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  
  // If it's already an absolute URL or a data/blob URL, return it as is
  if (path.startsWith("http://") || path.startsWith("https://") || 
      path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  
  // Get API base URL from env
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";
  
  // The API URL usually ends with /api, so we need the base backend URL
  const backendUrl = apiUrl.replace(/\/api\/?$/, "");
  
  // Prefix the path with backend URL, ensuring no double slashes
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${backendUrl}${cleanPath}`;
}
