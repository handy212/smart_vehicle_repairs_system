export type GeolocationCaptureResult = {
  latitude: number;
  longitude: number;
  label: string;
};

function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function getGeolocationErrorMessage(error: GeolocationPositionError | Error): string {
  if (error instanceof GeolocationPositionError) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return "Location access was blocked. Allow location for this site in your browser settings, or type your address.";
      case error.POSITION_UNAVAILABLE:
        return "Your device could not determine a location. Enter the address manually.";
      case error.TIMEOUT:
        return "Location request timed out. Try again or enter the address manually.";
      default:
        break;
    }
  }
  if (error.message === "NOT_SUPPORTED") {
    return "Geolocation is not supported by your browser.";
  }
  return "Could not get your location. Please enter it manually.";
}

async function reverseGeocodeLabel(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "16");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { display_name?: string };
    return data.display_name?.trim() || null;
  } catch {
    return null;
  }
}

function requestPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Capture the user's current position. Tries a quick/low-accuracy read first,
 * then falls back to high accuracy when needed.
 */
export async function captureCurrentPosition(): Promise<GeolocationCaptureResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("NOT_SUPPORTED");
  }

  const attempts: PositionOptions[] = [
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  ];

  let lastError: GeolocationPositionError | Error | null = null;

  for (const options of attempts) {
    try {
      const position = await requestPosition(options);
      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      const address = await reverseGeocodeLabel(latitude, longitude);
      return {
        latitude,
        longitude,
        label: address || formatCoordinates(latitude, longitude),
      };
    } catch (error) {
      lastError =
        error instanceof GeolocationPositionError || error instanceof Error
          ? error
          : new Error("Could not get location");
      if (
        lastError instanceof GeolocationPositionError &&
        lastError.code === lastError.PERMISSION_DENIED
      ) {
        break;
      }
    }
  }

  throw lastError ?? new Error("Could not get location");
}
