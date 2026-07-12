export const REASONS = [
  { key: 'prophylaxis',              label: 'Prophylaxis' },
  { key: 'prophylaxis_situational',  label: 'Prophylaxis (situational)' },
  { key: 'bleed',                    label: 'Bleed' },
  { key: 'first_infusion',           label: 'First infusion' },
  { key: 'bleed_followup',           label: 'Bleed follow-up infusion' },
  { key: 'no_treatment',             label: 'No treatment' },
  { key: 'surgery',                  label: 'Surgery/procedure' },
  { key: 'iti',                      label: 'Immune tolerance therapy' },
  { key: 'travel',                   label: 'Travel' },
  { key: 'other',                    label: 'Other' },
]

export const REASON_LABELS = Object.fromEntries(REASONS.map(r => [r.key, r.label]))

// "r,g,b" strings, same convention used throughout the app for rgba(...) colors.
export const REASON_COLORS = {
  prophylaxis:             '184,137,90',
  prophylaxis_situational: '217,171,116',
  bleed:                    '239,68,68',
  first_infusion:           '251,146,60',
  bleed_followup:           '220,38,38',
  no_treatment:             '150,150,150',
  surgery:                  '124,58,237',
  iti:                      '34,211,238',
  travel:                   '139,92,246',
  other:                    '120,120,120',
}
