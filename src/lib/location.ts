import type { LngLat } from '@/core/types';
import { useApp } from './store';

/**
 * One place for "where is the phone". Every feature that needs a start point asks here, so a blocked
 * location never shows a different message in each corner of the app, and a start point the driver
 * picked by hand (the "anchor") works everywhere GPS would.
 */
export type LocWhy = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export class LocationError extends Error {
  readonly why: LocWhy;
  constructor(why: LocWhy, message: string) {
    super(message);
    this.name = 'LocationError';
    this.why = why;
  }
}

export const DENIED_MSG = 'Location is blocked for Navi. Turn it on with the steps shown, or search for a place and start from there.';

export type Platform = 'iphone' | 'android' | 'other';

export function platformOf(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iphone';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'iphone'; // iPad asking for the desktop site
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** Plain steps to turn location back on. The iPhone and Android paths follow Apple's and Google's own help pages. */
export function helpSteps(p: Platform): string[] {
  if (p === 'iphone') {
    return [
      'Open the Settings app, then Privacy & Security, then Location Services. Make sure Location Services is on.',
      'In that same list, tap Safari Websites (or Navi, if you added it to your Home Screen) and choose While Using the App.',
      'Open Safari, tap the aA button in the address bar, tap Website Settings, and set Location to Allow.',
      'Come back to Navi, pull down to reload the page, then tap Try again.',
    ];
  }
  if (p === 'android') {
    return [
      'Swipe down from the top and make sure the phone’s Location switch is on.',
      'In Chrome, tap the icon at the left of the address bar, tap Permissions, and set Location to Allow. Or tap the Chrome menu, then Settings, Site settings, Location.',
      'Reload Navi, then tap Try again.',
    ];
  }
  return [
    'Click the lock icon at the left of the address bar and set Location to Allow.',
    'Reload the page, then tap Try again.',
  ];
}

export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  return platformOf(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** One GPS fix. Rejects with a LocationError; a refusal also switches on the help card. */
export function gpsOnce(opts: PositionOptions = { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return reject(new LocationError('unsupported', 'This device has no location sensor. Search for a place and start from there.'));
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        useApp.getState().setLocationBlocked(false);
        resolve([p.coords.longitude, p.coords.latitude]);
      },
      (e) => {
        if (e.code === 1) {
          useApp.getState().setLocationBlocked(true);
          reject(new LocationError('denied', DENIED_MSG));
        } else {
          reject(new LocationError(e.code === 3 ? 'timeout' : 'unavailable', 'Could not get a GPS fix. Move to open sky and try again, or search for a place and start from there.'));
        }
      },
      opts,
    );
  });
}

/** The start point for planning: the place the driver picked, otherwise where the phone is. */
export async function where(): Promise<LngLat> {
  const a = useApp.getState().anchor;
  if (a) return a.lngLat;
  return gpsOnce();
}
