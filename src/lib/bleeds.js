export const BLEED_LOCATIONS = ['Elbow', 'Knee', 'Ankle', 'Hip', 'Shoulder', 'Wrist', 'Muscle', 'Head/CNS', 'Other']
export const BLEED_SIDES = ['Left', 'Right', 'N/A']
export const SEVERITIES = [
  { key: 'mild',     label: 'Mild' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'severe',   label: 'Severe' },
]

// Visually distinct from src/lib/reasons.js's REASON_COLORS -- this scales
// with how alarming a bleed is, independent of what treated it.
export const SEVERITY_META = {
  mild:     { color: '217,171,116', border: '1px solid', label: 'Mild' },
  moderate: { color: '239,68,68',   border: '2px solid', label: 'Moderate' },
  severe:   { color: '153,27,27',   border: '3px solid', label: 'Severe' },
}

export function symptomList(bleed) {
  return [
    bleed.symptom_swelling && 'Swelling',
    bleed.symptom_bruising && 'Bruising',
    bleed.symptom_discoloration && 'Discoloration',
  ].filter(Boolean)
}
