// Named, versioned test scenarios for the sandbox test harness (see
// docs/testing/sandbox-methodology.md). Each fixture is a payload shaped
// exactly like a real firmware BLE event ({type, magnitude, gps}), plus the
// outcome a correct implementation should produce — so a scenario doubles as
// both the test input and its own pass/fail criteria.

export const SANDBOX_FIXTURES = [
  {
    id: 'MINOR_TYPICAL',
    label: 'Minor impact (typical)',
    description: 'A moderate impact just above MINOR_THRESHOLD — pothole/hard brake range.',
    payload: { type: 'MINOR', magnitude: '11.20', gps: 'phone' },
    expected: { severity: 'high', accidentType: 'Minor impact detected' },
  },
  {
    id: 'MAJOR_TYPICAL',
    label: 'Major impact (typical)',
    description: 'A clear impact above MAJOR_THRESHOLD — should escalate immediately, no countdown.',
    payload: { type: 'MAJOR', magnitude: '22.10', gps: 'phone' },
    expected: { severity: 'critical', accidentType: 'Major collision detected' },
  },
  {
    id: 'MAJOR_EXTREME',
    label: 'Major impact (extreme)',
    description: 'A severe impact, well beyond threshold — sanity-checks the upper end of the reported magnitude range.',
    payload: { type: 'MAJOR', magnitude: '38.45', gps: 'phone' },
    expected: { severity: 'critical', accidentType: 'Major collision detected' },
  },
  {
    id: 'MALFORMED_MISSING_TYPE',
    label: 'Malformed payload (missing type)',
    description: 'Simulates a corrupted/partial BLE message with no type field — should be discarded by ble.js, never reach the app.',
    payload: { magnitude: '15.00', gps: 'phone' },
    expected: { discarded: true },
  },
]

export function getFixture(id) {
  return SANDBOX_FIXTURES.find(f => f.id === id) || null
}
