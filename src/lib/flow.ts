import { generateStage, openTestStage } from '@/core';
import { useApp } from '@/lib/store';
import { useLibrary, type Trip } from '@/lib/library';
import { planWaypoints } from '@/lib/plan';
import { reversePlace, type Place } from '@/providers/photon';
import type { SharePayload } from '@/providers/share';
import { useEdits } from '@/lib/edits';

export const HERE: Place = { id: 'here', title: 'My location', subtitle: '', lngLat: [0, 0] };

/** One GPS fix as a Place. Rejects with a message the driver can act on. */
export function locateHere(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This device has no location sensor. Search for a start point instead.'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos: [number, number] = [p.coords.longitude, p.coords.latitude];
        useApp.getState().setUserPos(pos);
        resolve({ id: 'here', title: 'My location', subtitle: '', lngLat: pos });
      },
      (e) => reject(new Error(e.code === 1 ? 'Location is blocked. Allow it in your browser settings, or search for a start point.' : 'Could not get a GPS fix. Search for a start point instead.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  });
}

/** Route from/via/to with the driver's route options, keep it in History, and show it. */
export async function planRoute(): Promise<void> {
  const st = useApp.getState();
  const { from, to, via, settings } = st;
  if (!from || !to) return;
  st.setPlan({ busy: true, err: '' });
  try {
    const stage = await planWaypoints([from.lngLat, ...via.map((v) => v.lngLat), to.lngLat], undefined, settings.avoid);
    st.setStage(stage);
    const id = useLibrary.getState().addTrip({ from, to, via, distanceM: stage.stats.distanceM, durationS: stage.route.duration, corners: stage.stats.cornerCount });
    st.setTripId(id);
  } catch (e) {
    st.setPlan({ err: e instanceof Error ? e.message : 'Could not plan that route.' });
  } finally {
    st.setPlan({ busy: false });
  }
}

/** Pick a destination: remember it, find where the driver is, and plan. */
export async function chooseDestination(place: Place): Promise<void> {
  useLibrary.getState().pushRecent(place);
  const st = useApp.getState();
  st.setStage(null);
  st.setTripId(null);
  st.setVia([]);
  st.setTo(place);
  st.setTab('explore');
  st.setPlan({ err: '' });
  if (!st.from || st.from.id === 'here') {
    st.setPlan({ busy: true });
    try {
      st.setFrom(await locateHere());
    } catch (e) {
      st.setFrom(null);
      st.setPlan({ busy: false, err: e instanceof Error ? e.message : 'Location unavailable.' });
      return;
    }
  }
  await planRoute();
}

export async function loadTrip(t: Trip): Promise<void> {
  const st = useApp.getState();
  st.setStage(null);
  st.setFrom(t.from.id === 'here' ? null : t.from);
  st.setTo(t.to);
  st.setVia(t.via);
  st.setTab('explore');
  st.setPlan({ err: '' });
  if (t.from.id === 'here') {
    try {
      st.setFrom(await locateHere());
    } catch (e) {
      st.setPlan({ err: e instanceof Error ? e.message : 'Location unavailable.' });
      return;
    }
  }
  await planRoute();
}

/** Back to the start screen. */
export function clearRoute(): void {
  const st = useApp.getState();
  st.setStage(null);
  st.setTo(null);
  st.setVia([]);
  st.setTripId(null);
  st.setPlan({ busy: false, err: '' });
  st.setNotice('');
}

export function fmtDuration(s: number | undefined): string {
  if (s === undefined) return '';
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function fmtDistance(m: number, units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;
}

export function fmtArrival(s: number | undefined): string {
  if (s === undefined) return '';
  return new Date(Date.now() + s * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** A long-press on the map: name the spot, then route there. */
export async function dropPin(at: [number, number]): Promise<void> {
  useApp.getState().setPlan({ busy: true, err: '' });
  const place = await reversePlace(at);
  await chooseDestination(place);
}

/** A real, famous twisty road (US 129, "Tail of the Dragon") routed by the same router as any trip. Runs anywhere, no GPS needed. */
export const SAMPLE_FROM: Place = { id: 'sample-a', title: 'Deals Gap, North Carolina', subtitle: 'Tail of the Dragon, south end', lngLat: [-83.9327, 35.4686] };
export const SAMPLE_TO: Place = { id: 'sample-b', title: 'Tabcat Creek, North Carolina', subtitle: 'Tail of the Dragon, north end', lngLat: [-83.9935, 35.5207] };

/** A calm 5 km test road with generous room between turns (no router, works offline). */
export function loadOpenTestRoad(): void {
  const st = useApp.getState();
  st.setTripId(null);
  st.setPlan({ err: '' });
  st.setStage(generateStage(openTestStage()));
}

export async function loadSampleRoad(): Promise<void> {
  const st = useApp.getState();
  st.setStage(null);
  st.setTripId(null);
  st.setVia([]);
  st.setFrom(SAMPLE_FROM);
  st.setTo(SAMPLE_TO);
  st.setTab('explore');
  st.setPlan({ err: '' });
  await planRoute();
}

/** Open a route from a share link: show the places, route them, and add the sender's pacenote edits where they fit. */
export async function openSharedRoute(p: SharePayload): Promise<void> {
  const st = useApp.getState();
  const [a, b] = p.names ?? ['Shared start', 'Shared destination'];
  const pts = p.waypoints;
  const mk = (id: string, title: string, lngLat: [number, number], subtitle = ''): Place => ({ id, title, subtitle, lngLat });
  st.setStage(null);
  st.setTripId(null);
  st.setNotice('');
  st.setFrom(mk('shared-a', a, pts[0], 'From a shared link'));
  st.setTo(mk('shared-b', b, pts[pts.length - 1]));
  st.setVia(pts.slice(1, -1).map((c, i) => mk(`shared-v${i}`, `Stop ${i + 1}`, c)));
  st.setTab('explore');
  st.setPlan({ err: '' });
  await planRoute();
  const stage = useApp.getState().stage;
  if (!stage) return; // planRoute already said why
  if (!p.edits || !p.key) return useApp.getState().setNotice('Shared route opened.');
  if (p.key !== stage.key) {
    return useApp.getState().setNotice('Shared route opened. It came out a little different here, so the sender’s pacenote edits were not added.');
  }
  const mine = useEdits.getState().byRoute[stage.key] ?? {};
  let added = 0;
  for (const [id, e] of Object.entries(p.edits)) {
    if (mine[id]) continue; // never overwrite what this driver already changed
    useEdits.getState().put(stage.key, id, e);
    added++;
  }
  useApp.getState().setStage(stage);
  useApp.getState().setNotice(added > 0 ? `Shared route opened with ${added} pacenote edit${added === 1 ? '' : 's'} from the sender.` : 'Shared route opened.');
}
