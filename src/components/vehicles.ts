/** Top-down vehicle markers for the map, nose up. Original drawings, 40 by 72 units. */
export type VehicleId = 'dot' | 'car' | 'bike' | 'utv' | 'truck';

const O = '#05070a';
const BODY = '#f2f4f7';
const GLASS = '#2a8fd6';
const ACC = '#56d7e0';
const TYRE = '#2b3138';
const wheel = (x: number, y: number, w = 6, h = 11) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${TYRE}"/>`;
const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 72" width="40" height="72">${inner}</svg>`;

const CAR = wrap(
  [
    wheel(3, 10),
    wheel(31, 10),
    wheel(3, 46),
    wheel(31, 46),
    `<path d="M10 6 Q20 0 30 6 L32 20 L32 56 Q32 67 20 68 Q8 67 8 56 L8 20 Z" fill="${BODY}" stroke="${O}" stroke-width="1.6"/>`,
    `<path d="M11 22 Q20 18 29 22 L28 29 Q20 27 12 29 Z" fill="${GLASS}"/>`,
    `<rect x="14" y="32" width="12" height="12" rx="2" fill="#d9dde3"/>`,
    `<rect x="17" y="35" width="6" height="6" rx="1.5" fill="#e8402f"/>`,
    `<path d="M11 48 Q20 45 29 48 L28 54 Q20 52 12 54 Z" fill="${GLASS}"/>`,
    `<rect x="19" y="8" width="2" height="12" fill="${ACC}"/>`,
    `<circle cx="12" cy="7.5" r="2" fill="#ffd34a"/><circle cx="28" cy="7.5" r="2" fill="#ffd34a"/>`,
    `<rect x="9" y="64" width="22" height="3" rx="1.5" fill="${O}"/>`,
  ].join(''),
);

const BIKE = wrap(
  [
    `<rect x="17.5" y="2" width="5" height="17" rx="2.5" fill="${TYRE}"/>`,
    `<rect x="17.5" y="52" width="5" height="17" rx="2.5" fill="${TYRE}"/>`,
    `<rect x="6" y="20" width="28" height="3.5" rx="1.75" fill="${TYRE}"/>`,
    `<path d="M15 24 Q20 20 25 24 L26 44 Q20 48 14 44 Z" fill="${BODY}" stroke="${O}" stroke-width="1.4"/>`,
    `<rect x="19" y="24" width="2" height="18" fill="${ACC}"/>`,
    `<rect x="13" y="26" width="5" height="12" rx="2.5" fill="${O}" transform="rotate(-18 15 32)"/>`,
    `<rect x="22" y="26" width="5" height="12" rx="2.5" fill="${O}" transform="rotate(18 25 32)"/>`,
    `<circle cx="20" cy="38" r="5.5" fill="${GLASS}" stroke="${O}" stroke-width="1.4"/>`,
  ].join(''),
);

const UTV = wrap(
  [
    wheel(2, 8, 7, 13),
    wheel(31, 8, 7, 13),
    wheel(2, 48, 7, 13),
    wheel(31, 48, 7, 13),
    `<path d="M10 6 L30 6 L32 24 L32 60 Q32 66 20 67 Q8 66 8 60 L8 24 Z" fill="${BODY}" stroke="${O}" stroke-width="1.6"/>`,
    `<rect x="11" y="26" width="18" height="22" rx="3" fill="#d9dde3" stroke="${O}" stroke-width="1.4"/>`,
    `<path d="M12 26 L28 26 M12 48 L28 48 M12 26 L12 48 M28 26 L28 48" stroke="${GLASS}" stroke-width="2.4" fill="none"/>`,
    `<rect x="19" y="8" width="2" height="14" fill="${ACC}"/>`,
    `<rect x="12" y="52" width="16" height="9" rx="2" fill="#bfc4cc"/>`,
  ].join(''),
);

const TRUCK = wrap(
  [
    wheel(3, 8),
    wheel(31, 8),
    wheel(3, 50),
    wheel(31, 50),
    `<rect x="8" y="3" width="24" height="25" rx="5" fill="${BODY}" stroke="${O}" stroke-width="1.6"/>`,
    `<path d="M11 10 Q20 7 29 10 L28 16 Q20 14 12 16 Z" fill="${GLASS}"/>`,
    `<rect x="19" y="3.5" width="2" height="5" fill="${ACC}"/>`,
    `<rect x="8" y="30" width="24" height="38" rx="2" fill="#bfc4cc" stroke="${O}" stroke-width="1.6"/>`,
    `<rect x="11" y="33" width="18" height="32" rx="1" fill="#9ea4ad"/>`,
  ].join(''),
);

const DOT = wrap(`<circle cx="20" cy="36" r="10" fill="${ACC}" stroke="${O}" stroke-width="3"/>`);

export const VEHICLES: { id: VehicleId; label: string; svg: string }[] = [
  { id: 'dot', label: 'Dot', svg: DOT },
  { id: 'car', label: 'Car', svg: CAR },
  { id: 'bike', label: 'Motorcycle', svg: BIKE },
  { id: 'utv', label: 'Side-by-side', svg: UTV },
  { id: 'truck', label: 'Truck', svg: TRUCK },
];
