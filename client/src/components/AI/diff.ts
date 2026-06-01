export interface DiffPart {
  type: 'same' | 'del' | 'add'
  text: string
}

/**
 * Word-level diff via a longest-common-subsequence table. Produces a flat list
 * of same/deleted/added segments for the grammar diff view.
 */
export function wordDiff(original: string, corrected: string): DiffPart[] {
  const a = original.match(/\S+\s*/g) ?? []
  const b = corrected.match(/\S+\s*/g) ?? []
  const n = a.length
  const m = b.length

  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i].trim() === b[j].trim()
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string) => {
    const last = parts[parts.length - 1]
    if (last && last.type === type) last.text += text
    else parts.push({ type, text })
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].trim() === b[j].trim()) {
      push('same', a[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', a[i])
      i++
    } else {
      push('add', b[j])
      j++
    }
  }
  while (i < n) push('del', a[i++])
  while (j < m) push('add', b[j++])
  return parts
}
