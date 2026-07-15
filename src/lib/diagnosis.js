// Single source of truth for condition options + labels, reused by
// AddPatientModal, CompleteProfileModal, Dashboard, and Provider so the
// dropdown/label/placeholder text never drifts between them.
export const CONDITIONS = [
  { key: 'hemophilia_a',   label: 'Hemophilia A' },
  { key: 'hemophilia_b',   label: 'Hemophilia B' },
  { key: 'von_willebrand', label: 'von Willebrand Disease' },
  { key: 'other',          label: 'Other' },
]

export const CONDITION_LABELS = Object.fromEntries(CONDITIONS.map(c => [c.key, c.label]))

// Hemophilia is usually described by severity, von Willebrand by type --
// the DB column (severity_detail) is deliberately free text either way,
// this just steers the placeholder/preset chips shown for each.
export function severityPlaceholder(condition) {
  if (condition === 'von_willebrand') return 'e.g. Type 1, Type 2, Type 3'
  if (condition === 'hemophilia_a' || condition === 'hemophilia_b') return 'e.g. Mild, Moderate, Severe'
  return 'e.g. Mild, Moderate, Severe'
}

export function severityPresets(condition) {
  if (condition === 'von_willebrand') return ['Type 1', 'Type 2', 'Type 3']
  return ['Mild', 'Moderate', 'Severe']
}
