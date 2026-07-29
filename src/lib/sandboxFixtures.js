// Named, versioned test scenarios for the sandbox test harness (see
// docs/testing/sandbox-methodology.md). Values are derived using
// Equivalence Partitioning + Boundary Value Analysis (EP/BVA) — the
// standard black-box test design techniques defined in ISO/IEC/IEEE
// 29119-4 and specifically recommended by ISO 26262 (clause 9, "Software
// unit verification") for ASIL B–D test case derivation — rather than
// arbitrary numbers, so every fixture's value is traceable to a specific
// classification boundary in the firmware.
//
// MUST be kept in sync with the actual firmware thresholds — see
// docs/ml/firmware-reference/AccidentDetector_proposed_fix.ino. These are
// mirrored here (not imported — the firmware is C++, not JS) purely as the
// derivation basis for the values below.
const MINOR_THRESHOLD = 10.0        // m/s² — firmware MINOR_THRESHOLD
const MAJOR_THRESHOLD = 13.0        // m/s² — firmware MAJOR_THRESHOLD
const GYRO_MAJOR_THRESHOLD = 1.5    // rad/s — firmware GYRO_MAJOR_THRESHOLD
const GRAVITY = 9.81                // m/s² — resting-state floor; magnitude can't go below this in practice

// ── Equivalence classes (magnitude) ──────────────────────────────────────
//   EC1 [GRAVITY, MINOR_THRESHOLD)   → no alert
//   EC2 [MINOR_THRESHOLD, MAJOR_THRESHOLD) → MINOR
//   EC3 [MAJOR_THRESHOLD, ∞)          → MAJOR
// Each class gets one representative (interior) value; each class boundary
// gets a value exactly at, just below, and just above it (BVA), per
// ISO/IEC/IEEE 29119-4's equivalence-partitioning + boundary-value technique.

export const SANDBOX_FIXTURES = [
  // EC2 interior — representative MINOR value, midpoint of [MINOR, MAJOR).
  {
    id: 'MINOR_TYPICAL',
    label: 'Minor impact (typical)',
    description: `EC2 interior value: midpoint of [${MINOR_THRESHOLD}, ${MAJOR_THRESHOLD}) — a representative moderate impact.`,
    payload: { type: 'MINOR', magnitude: ((MINOR_THRESHOLD + MAJOR_THRESHOLD) / 2).toFixed(2), gps: 'phone' },
    expected: { severity: 'high', accidentType: 'Minor impact detected' },
  },

  // MINOR_THRESHOLD boundary, approached from above (BVA: at-boundary case).
  //
  // simulatable: false — kept documented for the EP/BVA test-design record,
  // but not wired to a button: its label ("boundary" fixtures fire MINOR by
  // design even when the label mentions "Major") was found to be confusing
  // in practice — a "Major boundary" button producing a MINOR alert looked
  // like a bug ("alerts always show minor"). Only unambiguous MINOR/MAJOR
  // buttons are exposed in the UI now.
  {
    id: 'MINOR_BOUNDARY_AT',
    label: 'Minor boundary (at threshold)',
    description: `BVA: magnitude exactly at MINOR_THRESHOLD (${MINOR_THRESHOLD}) — the lowest value that must still classify as MINOR (>= is inclusive).`,
    payload: { type: 'MINOR', magnitude: MINOR_THRESHOLD.toFixed(2), gps: 'phone' },
    expected: { severity: 'high', accidentType: 'Minor impact detected' },
    simulatable: false,
  },

  // MAJOR_THRESHOLD boundary, approached from below (BVA: just-under case) —
  // must NOT classify as MAJOR. simulatable: false — see note above
  // MINOR_BOUNDARY_AT; this is the exact fixture that caused the confusion
  // (label mentions "Major", payload.type is actually 'MINOR' by design).
  {
    id: 'MAJOR_BOUNDARY_BELOW',
    label: 'Major boundary (just under)',
    description: `BVA: magnitude just below MAJOR_THRESHOLD (${(MAJOR_THRESHOLD - 0.1).toFixed(2)} < ${MAJOR_THRESHOLD}) — must still classify as MINOR, not MAJOR.`,
    payload: { type: 'MINOR', magnitude: (MAJOR_THRESHOLD - 0.1).toFixed(2), gps: 'phone' },
    expected: { severity: 'high', accidentType: 'Minor impact detected' },
    simulatable: false,
  },

  // EC3 interior — representative MAJOR value, comfortably above threshold.
  {
    id: 'MAJOR_TYPICAL',
    label: 'Major impact (typical)',
    description: `EC3 interior value: comfortably above MAJOR_THRESHOLD (${MAJOR_THRESHOLD}) — a representative clear impact.`,
    payload: { type: 'MAJOR', magnitude: (MAJOR_THRESHOLD + 9).toFixed(2), gps: 'phone' },
    expected: { severity: 'critical', accidentType: 'Major collision detected' },
  },

  // MAJOR_THRESHOLD boundary, at the exact value (BVA: at-boundary case).
  // simulatable: false — see note above MINOR_BOUNDARY_AT; UI now exposes
  // only one unambiguous MAJOR button (MAJOR_TYPICAL).
  {
    id: 'MAJOR_BOUNDARY_AT',
    label: 'Major boundary (at threshold)',
    description: `BVA: magnitude exactly at MAJOR_THRESHOLD (${MAJOR_THRESHOLD}) — the lowest value that must classify as MAJOR.`,
    payload: { type: 'MAJOR', magnitude: MAJOR_THRESHOLD.toFixed(2), gps: 'phone' },
    expected: { severity: 'critical', accidentType: 'Major collision detected' },
    simulatable: false,
  },

  // EC3 extreme — stress/robustness case, several multiples of threshold
  // (error-guessing technique, ISO 26262 §9, used alongside EP/BVA to
  // cover values a driver test can't safely reproduce by hand).
  // simulatable: false — see note above MINOR_BOUNDARY_AT.
  {
    id: 'MAJOR_EXTREME',
    label: 'Major impact (extreme)',
    description: `Stress case: ~3x MAJOR_THRESHOLD (${(MAJOR_THRESHOLD * 3).toFixed(2)}) — sanity-checks the upper end of the reported magnitude range.`,
    payload: { type: 'MAJOR', magnitude: (MAJOR_THRESHOLD * 3).toFixed(2), gps: 'phone' },
    expected: { severity: 'critical', accidentType: 'Major collision detected' },
    simulatable: false,
  },

  // Independent-trigger path: gyro alone crosses GYRO_MAJOR_THRESHOLD while
  // magnitude stays in the "no alert" class — isolates the OR condition
  // (magnitude >= MAJOR_THRESHOLD || gyroMag >= GYRO_MAJOR_THRESHOLD) so a
  // regression that accidentally turns the OR into an AND is caught.
  //
  // simulatable: false — this only exercises firmware (C++) logic. ble.js
  // trusts the firmware's pre-set `type` field directly (never re-derives
  // classification from magnitude/gyro client-side — see the comment
  // above ble.js's handleChunk()), so simulating this fixture's payload
  // through the web app would be indistinguishable from MAJOR_TYPICAL.
  // Verify this one on real hardware via the Serial Monitor instead: spin
  // the board (low impact force, high rotation) and confirm the firmware
  // itself prints/sends type="MAJOR".
  {
    id: 'MAJOR_VIA_GYRO_ONLY',
    label: 'Major via rotation only',
    description: `Firmware-only EP case: gyro just above GYRO_MAJOR_THRESHOLD (${(GYRO_MAJOR_THRESHOLD + 0.1).toFixed(2)}) with magnitude in the no-alert class (${GRAVITY}) — must still classify MAJOR via the OR condition. Verify on real hardware, not simulatable here.`,
    payload: { type: 'MAJOR', magnitude: GRAVITY.toFixed(2), gyro: (GYRO_MAJOR_THRESHOLD + 0.1).toFixed(2), gps: 'phone' },
    expected: { severity: 'critical', accidentType: 'Major collision detected' },
    simulatable: false,
  },

  // Negative test — malformed/missing-type payload, simulating BLE data
  // corruption. Not part of the magnitude EP/BVA set above; exercises
  // ble.js's own input-validation path instead (see ble.js handleChunk()).
  //
  // simulatable: false — testing this correctly means exercising ble.js's
  // own parser/discard logic, which the test screen's simulate buttons
  // bypass by calling the data handler directly.
  {
    id: 'MALFORMED_MISSING_TYPE',
    label: 'Malformed payload (missing type)',
    description: 'Negative test: no type field — should be discarded by ble.js, never reach the app.',
    payload: { magnitude: '15.00', gps: 'phone' },
    expected: { discarded: true },
    simulatable: false,
  },
]

export function getFixture(id) {
  return SANDBOX_FIXTURES.find(f => f.id === id) || null
}
