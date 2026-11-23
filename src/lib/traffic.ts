import { create } from 'zustand';
import type { Stage, TrafficSpan } from '@/core';
import { fetchTraffic } from '@/providers/traffic';
import { useApp } from './store';

interface TrafficState {
  /** Stage key the spans belong to. */
  key: string | null;
  spans: TrafficSpan[];
  error: string | null;
}

export const useTraffic = create<TrafficState>(() => ({ key: null, spans: [], error: null }));

let ctl: AbortController | null = null;

export function clearTraffic() {
  ctl?.abort();
  useTraffic.setState({ key: null, spans: [], error: null });
}

/** Fetch traffic for the stage on screen, if the setting is on. */
export async function refreshTraffic(stage: Stage | null): Promise<void> {
  const { traffic, trafficSource, trafficKey } = useApp.getState().settings;
  ctl?.abort();
  if (!traffic || !stage) return clearTraffic();
  const mine = (ctl = new AbortController());
  try {
    const spans = await fetchTraffic(stage, trafficSource, trafficKey, mine.signal);
    if (!mine.signal.aborted) useTraffic.setState({ key: stage.key ?? null, spans, error: null });
  } catch (e) {
    if (!mine.signal.aborted) useTraffic.setState({ key: stage.key ?? null, spans: [], error: e instanceof Error ? e.message : 'traffic is unavailable' });
  }
}
