export async function getSqliteColumnsByItem(
  db: {
    prepare: (queryText: string) => {
      all: () => Array<{ name?: string }> | undefined
    }
  },
  objectNames: string[]
) {
  const result: Record<string, string[]> = {}

  for (const objectName of objectNames) {
    const pragmaRows = db.prepare(`PRAGMA table_info('${objectName.replace(/'/g, "''")}')`).all() as
      | Array<{ name?: string }>
      | undefined
    const columns = (pragmaRows ?? [])
      .map((row) => String(row.name ?? "").trim())
      .filter(Boolean)

    if (columns.length) {
      result[objectName] = columns
    }
  }

  return result
}
