import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DENIED_MSG, LocationError, distanceToRouteM, gpsOnce, helpSteps, platformOf, where } from './location';
import { useApp } from './store';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

describe('platformOf', () => {
  it('tells phones apart', () => {
    expect(platformOf(IPHONE)).toBe('iphone');
    expect(platformOf(ANDROID)).toBe('android');
    expect(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('other');
  });
  it('treats an iPad asking for the desktop site as an iPhone-style device', () => {
    expect(platformOf(MAC, 5)).toBe('iphone');
    expect(platformOf(MAC, 0)).toBe('other');
  });
});

describe('helpSteps', () => {
  it('gives four iPhone steps that name the Settings path', () => {
    const s = helpSteps('iphone');
    expect(s).toHaveLength(4);
    expect(s[0]).toMatch(/Settings.*Privacy & Security.*Location Services/);
    expect(s.join(' ')).toMatch(/While Using the App/);
  });
  it('gives Android and desktop steps and every list ends by trying again', () => {
    for (const p of ['android', 'other'] as const) {
      const s = helpSteps(p);
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(s[s.length - 1]).toMatch(/Try again/);
    }
  });
});

describe('where and gpsOnce', () => {
  beforeEach(() => {
    useApp.setState({ anchor: null, locationBlocked: false });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const geo = (impl: (ok: (p: unknown) => void, bad: (e: { code: number }) => void) => void) =>
    vi.stubGlobal('navigator', { userAgent: IPHONE, maxTouchPoints: 5, geolocation: { getCurrentPosition: impl } });

  it('uses the hand-picked start point and never asks the phone', async () => {
    const spy = vi.fn();
    geo(spy);
    useApp.setState({ anchor: { id: 'a', title: 'Gatineau Park', subtitle: '', lngLat: [-75.8, 45.5] } });
    expect(await where()).toEqual([-75.8, 45.5]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns a fix as [lng, lat] and clears the blocked flag', async () => {
    useApp.setState({ locationBlocked: true });
    geo((ok) => ok({ coords: { longitude: -75.7, latitude: 45.4 } }));
    expect(await gpsOnce()).toEqual([-75.7, 45.4]);
    expect(useApp.getState().locationBlocked).toBe(false);
  });

  it('a refusal rejects with a denied error and switches the help card on', async () => {
    geo((_ok, bad) => bad({ code: 1 }));
    await expect(gpsOnce()).rejects.toMatchObject({ why: 'denied', message: DENIED_MSG });
    expect(useApp.getState().locationBlocked).toBe(true);
  });

  it('a timeout is not a refusal and leaves the help card off', async () => {
    geo((_ok, bad) => bad({ code: 3 }));
    const e = await gpsOnce().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LocationError);
    expect((e as LocationError).why).toBe('timeout');
    expect(useApp.getState().locationBlocked).toBe(false);
  });

  it('a device with no location sensor says so', async () => {
    vi.stubGlobal('navigator', { userAgent: ANDROID });
    await expect(gpsOnce()).rejects.toMatchObject({ why: 'unsupported' });
  });
});

describe('distance to a route', () => {
  it('is small on the road and large far away', () => {
    const road: [number, number][] = [[-75.62, 45.52], [-75.61, 45.52], [-75.6, 45.52]];
    expect(distanceToRouteM([-75.61, 45.52], road)).toBeLessThan(1);
    const km = distanceToRouteM([-75.99, 45.27], road) / 1000;
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(45);
  });
});
