import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Get the current device position.
 *
 * On native (Capacitor/Android) this uses the @capacitor/geolocation plugin,
 * which triggers the Android runtime location permission prompt. In the browser
 * it falls back to the standard navigator.geolocation API.
 */
export async function getCurrentPosition(timeoutMs = 10000): Promise<LatLng> {
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      throw new Error('Location permission denied');
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: timeoutMs,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  return new Promise<LatLng>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs },
    );
  });
}
