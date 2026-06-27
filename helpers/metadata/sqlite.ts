export async function getSqliteColumnsByItem(
  db: {
    prepare: (queryText: string) => {
      all: () => Array<{ name?: string }> | undefined
    }
  },
  objectNames: string[]
) {
  const result: Record<string, string[]> = {}
  const detailsResult: Record<string, Array<{ name: string; dataType: string; size: string }>> = {}

  for (const objectName of objectNames) {
    const pragmaRows = db.prepare(`PRAGMA table_info('${objectName.replace(/'/g, "''")}')`).all() as
      | Array<{ name?: string; type?: string }>
      | undefined
    const columns = (pragmaRows ?? [])
      .map((row) => String(row.name ?? "").trim())
      .filter(Boolean)
    const columnDetails = (pragmaRows ?? [])
      .map((row) => {
        const type = String(row.type ?? "").trim().toUpperCase()
        const sizeMatch = type.match(/^(.*)\((.+)\)$/)

        return {
          name: String(row.name ?? "").trim(),
          dataType: sizeMatch ? sizeMatch[1].trim().toUpperCase() : type,
          size: sizeMatch ? sizeMatch[2].trim() : "",
        }
      })
      .filter((row) => row.name)

    if (columns.length) {
      result[objectName] = columns
      detailsResult[objectName] = columnDetails as Array<{ name: string; dataType: string; size: string }>
    }
  }

  return {
    columnsByItem: result,
    columnsDetailsByItem: detailsResult,
  }
}
