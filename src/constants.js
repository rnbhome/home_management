// Frequency → number of days added to today when a task is ticked.
export const FREQ_DAYS = {
  '1w': 7,
  '2w': 14,
  '3w': 21,
  '4w': 28,
  '1m': 30,
  '2m': 60,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  any: 0
};

export const FREQ_LABELS = {
  '1w': 'Weekly',
  '2w': '2 weeks',
  '3w': '3 weeks',
  '4w': '4 weeks',
  '1m': 'Monthly',
  '2m': '2 months',
  '3m': '3 months',
  '6m': '6 months',
  '1y': 'Yearly',
  any: 'As needed'
};

// Ordered list of chips shown in the Frequencies tab.
export const FREQ_ORDER = ['1w', '2w', '3w', '4w', '1m', '2m', '3m', '6m', '1y', 'any'];

// Canonical room order used throughout the UI.
export const ROOM_ORDER = [
  'Kitchen',
  'Laundry',
  'Living Room',
  'Bedroom',
  'Stairs',
  'Bathroom',
  'Garden',
  'Car'
];

export const ROOM_ICONS = {
  Kitchen: '🍳',
  Laundry: '🧺',
  'Living Room': '🛋️',
  Bedroom: '🛏️',
  Stairs: '🪜',
  Bathroom: '🚿',
  Garden: '🌿',
  Car: '🚗'
};

// Bin chip colours.
export const BIN_STYLES = {
  'Black bin': { bg: '#2A2A2A', fg: '#FFFFFF' },
  'Blue bin': { bg: '#1565C0', fg: '#FFFFFF' },
  'Green bin': { bg: '#2E7D32', fg: '#FFFFFF' }
};
