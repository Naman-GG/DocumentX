// A curated palette of distinct, readable cursor/avatar colors.
const USER_COLORS = [
  '#2563EB', // blue
  '#DC2626', // red
  '#16A34A', // green
  '#D97706', // amber
  '#7C3AED', // violet
  '#DB2777', // pink
  '#0891B2', // cyan
  '#CA8A04', // gold
  '#4F46E5', // indigo
  '#059669', // emerald
  '#EA580C', // orange
  '#9333EA', // purple
]

const ADJECTIVES = [
  'Swift', 'Calm', 'Bright', 'Bold', 'Keen', 'Lively', 'Witty', 'Brave',
  'Quiet', 'Sunny', 'Clever', 'Gentle', 'Eager', 'Noble', 'Merry',
]
const ANIMALS = [
  'Otter', 'Falcon', 'Fox', 'Heron', 'Lynx', 'Panda', 'Wren', 'Bison',
  'Koala', 'Raven', 'Tiger', 'Seal', 'Moose', 'Crane', 'Wolf',
]

export function randomColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
}

export function randomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${adj} ${animal}`
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
