/** Shared types for the Navi pacenote engine. Pure TypeScript, no DOM. */

export type LngLat = [lng: number, lat: number];
export type Side = 'L' | 'R';
export type Severity = 1 | 2 | 3 | 4 | 5 | 6;
export type DialectId = 'rally' | 'rally-reverse' | 'plain';
export type UnitSystem = 'metric' | 'imperial';
export type DriverProfile = 'cruise' | 'road' | 'stage';

export type ManeuverKind =
  | 'turn'
  | 'uturn'
  | 'roundabout'
  | 'merge'
  | 'exit'
  | 'other';

/** A routing-engine instruction anchored to a vertex of the route polyline. */
export interface Maneuver {
  /** Index into Route.coords where the maneuver begins. */
  shapeIndex: number;
  /** Index into Route.coords where it ends (roundabouts). */
  endShapeIndex?: number;
  kind: ManeuverKind;
  side?: Side;
  sharpness?: 'slight' | 'normal' | 'sharp';
  /** Roundabout exit number. */
  exitCount?: number;
  street?: string;
}

/** Road attributes over a stretch of the route (metres along the route). */
export interface EdgeAttr {
  fromS: number;
  toS: number;
  /** km/h */
  speedLimit?: number;
  surface?: string;
  roadClass?: string;
}

export interface Route {
  coords: LngLat[];
  /** metres, as reported by the router (informational) */
  distance?: number;
  /** seconds */
  duration?: number;
  maneuvers?: Maneuver[];
  edges?: EdgeAttr[];
  name?: string;
}

export interface Corner {
  id: string;
  startS: number;
  endS: number;
  apexS: number;
  side: Side;
  /** Total heading change, degrees (positive magnitude). */
  angleDeg: number;
  /** Apex radius in metres. */
  radius: number;
  entryRadius: number;
  exitRadius: number;
  severity: Severity;
  shape: 'hairpin' | 'square' | 'bend' | 'kink';
  long: boolean;
  tightens: boolean;
  opens: boolean;
}

export type NoteKind =
  | 'corner'
  | 'junction'
  | 'roundabout'
  | 'merge'
  | 'exit'
  | 'uturn'
  | 'hazard'
  | 'finish';

/** Things on the road worth a word: from OpenStreetMap points. */
export type HazardKind = 'bump' | 'rail' | 'camera' | 'narrow';

export interface NoteMods {
  long?: boolean;
  tightens?: boolean;
  opens?: boolean;
  /** Static caution: severe corner after a long approach, or one that tightens hard. */
  caution?: boolean;
  /** A routing junction coincides with this corner. */
  junction?: boolean;
  sharpness?: 'slight' | 'normal' | 'sharp';
  exitCount?: number;
}

export interface Note {
  id: string;
  kind: NoteKind;
  /** Distance along the route where the feature starts (m). */
  s: number;
  sEnd: number;
  /** distance of the tightest point (corners only) */
  apexS?: number;
  side?: Side;
  severity?: Severity;
  shape?: Corner['shape'];
  angleDeg?: number;
  radius?: number;
  mods: NoteMods;
  /** Normalised road sketch: flat [x0,y0,x1,y1,...] in 0..1, entry heading up. */
  glyph?: number[];
  limitKmh?: number;
  /** What a hazard note is about. */
  hazard?: HazardKind;
  /** Driver's own words, added to the call ('watch the gravel'). Set by pacenote edits. */
  extra?: string;
}

export interface StageStats {
  distanceM: number;
  cornerCount: number;
  hairpins: number;
  bySeverity: [number, number, number, number, number, number];
  degreesPerKm: number;
  /** 0-100 heuristic; see docs/PACENOTE-SPEC.md */
  twistScore: number;
  longestStraightM: number;
  noteCount: number;
}
