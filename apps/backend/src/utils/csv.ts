/**
 * Minimal CSV parser with support for quoted fields and escaped quotes.
 * Shared between all admin CSV import routes.
 */

export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === ",") {
        out.push(cur)
        cur = ""
      } else if (ch === '"') {
        inQuotes = true
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out
}

/**
 * Parse a CSV string into { header, rows } where each row is an object keyed
 * by lower-cased, trimmed column names.
 */
export function parseCsvToObjects(
  text: string
): { header: string[]; rows: Array<Record<string, string>> } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { header: [], rows: [] }
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const rows: Array<Record<string, string>> = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = (cols[j] ?? "").trim()
    }
    rows.push(row)
  }
  return { header, rows }
}
