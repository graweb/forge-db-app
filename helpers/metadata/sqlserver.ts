export function extractSchemaNames(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => row.schema_name ?? row.SCHEMA_NAME ?? row.table_schema ?? row.TABLE_SCHEMA)
    .map((value) => (value === null || value === undefined ? "" : String(value)))
    .filter(Boolean)
}

export function extractNamesForSchema(rows: Array<Record<string, unknown>>, schemaName: string) {
  return rows
    .filter((row) => {
      const rowSchema = row.schema_name ?? row.SCHEMA_NAME ?? row.table_schema ?? row.TABLE_SCHEMA
      return String(rowSchema ?? "") === schemaName
    })
    .map((row) => row.name ?? row.NAME ?? row.table_name ?? row.TABLE_NAME ?? row.indexname)
    .map((value) => (value === null || value === undefined ? "" : String(value)))
    .filter(Boolean)
}

export function extractColumnsByObjectForSchema(rows: Array<Record<string, unknown>>, schemaName: string) {
  const result: Record<string, string[]> = {}

  for (const row of rows) {
    const rowSchema = String(
      row.schema_name ?? row.SCHEMA_NAME ?? row.table_schema ?? row.TABLE_SCHEMA ?? ""
    )
    if (rowSchema !== schemaName) {
      continue
    }

    const objectName = String(
      row.object_name ?? row.OBJECT_NAME ?? row.table_name ?? row.TABLE_NAME ?? ""
    )
    const columnName = String(
      row.column_name ?? row.COLUMN_NAME ?? row.name ?? row.NAME ?? ""
    ).trim()

    if (!objectName || !columnName) {
      continue
    }

    if (!result[objectName]) {
      result[objectName] = []
    }

    result[objectName].push(columnName)
  }

  return result
}
