# Pacenote specification

## Pipeline
route polyline → resample to 5 m → heading from a ±10 m chord → signed curvature (coarse ±15 m, fine ±5 m for corners tighter than 45 m radius) → corner runs by curvature sign (merged and filtered) → severity → notes (modifiers, gaps, junctions) → scheduler (when to speak).

## Severity (1 = tightest, 6 = flat)
Derived from comfortable corner speed v = √(a·r) at 0.45 g, with speed edges at 40, 60, 80, 105 and 135 km/h.

| Severity | Radius upper bound |
|----------|--------------------|
| 1 | 28 m |
| 2 | 63 m |
| 3 | 112 m |
| 4 | 193 m |
| 5 | 319 m |
| 6 | flatter than 319 m |

Hairpin: turn of 120° or more with radius 30 m or less. Square: 75–115° with radius 25 m or less. "Reversed" dialect flips the numbers (6 = tightest). Plain dialect speaks words.

## Calls
A call starts when distance to its first note ≤ speed × (lead time + speech time), default lead 7 s, so speech ends about 7 s before the corner at any speed. Up to 3 notes are grouped; gaps are rounded ("100"). "Caution" is prefixed when speed exceeds 1.5× the corner's comfortable speed. A separate late-braking "Slow" alert fires when the braking needed to reach corner speed (measured to the apex) exceeds 85% of comfortable braking, and may interrupt speech.

## Driver profiles (lateral g)
Relaxed 0.30, Road 0.40, Stage 0.60. Stage is for closed courses and requires an on-device attestation.

## Twist score
100 × (1 − exp(−degrees per km / 350)). A heuristic for sorting roads, not a measurement of danger.

## Evidence the engine is right
`src/core/engine.test.ts` generates arcs of known radius (15, 35, 80, 150, 250, 400 m, left and right), a hairpin, a square, an S-bend, tightening and opening corners, 0.2 m GPS noise, a 48-hairpin zigzag and vertex-density changes, and checks radius, severity, direction and call timing against ground truth. Simulated drives at 80 and 110 km/h check that every corner is called before it is reached and that alerts fire only when braking is genuinely late.
Not yet checked: real roads against published road books or driver feedback. See docs/ROADMAP.md (live validation).
