import type { DatabaseStructureGroup } from "@/types/connections"

export type ColumnDetails = {
  name: string
  dataType: string
  size: string
}

export function normalizeColumnSize(length?: unknown, precision?: unknown, scale?: unknown) {
  const normalizedLength = Number(length)
  const normalizedPrecision = Number(precision)
  const normalizedScale = Number(scale)

  if (Number.isFinite(normalizedLength) && normalizedLength > 0) {
    return String(normalizedLength)
  }

  if (Number.isFinite(normalizedPrecision) && normalizedPrecision > 0) {
    return Number.isFinite(normalizedScale) && normalizedScale > 0
      ? `${normalizedPrecision},${normalizedScale}`
      : String(normalizedPrecision)
  }

  return ""
}

export function createGroup(
  label: string,
  items: string[],
  columnsByItem?: Record<string, string[]>,
  columnsDetailsByItem?: Record<string, ColumnDetails[]>
): DatabaseStructureGroup {
  const group: DatabaseStructureGroup = { label, items }

  if (columnsByItem) {
    group.columnsByItem = columnsByItem
  }

  if (columnsDetailsByItem) {
    group.columnsDetailsByItem = columnsDetailsByItem
  }

  return group
}

export function extractNames(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => row.name ?? row.NAME ?? row.table_name ?? row.TABLE_NAME ?? row.indexname)
    .map((value) => (value === null || value === undefined ? "" : String(value)))
    .filter(Boolean)
}

export function buildColumnsMap(
  rows: Array<Record<string, unknown>>,
  _schemaName: string,
  objectNames: string[],
  objectKey: string,
  columnKey: string
) {
  const allowedObjects = new Set(objectNames)
  const result: Record<string, string[]> = {}

  for (const row of rows) {
    const objectName = String(row[objectKey] ?? row[objectKey.toUpperCase()] ?? "").trim()
    const columnName = String(row[columnKey] ?? row[columnKey.toUpperCase()] ?? "").trim()

    if (!objectName || !columnName || !allowedObjects.has(objectName)) {
      continue
    }

    if (!result[objectName]) {
      result[objectName] = []
    }

    result[objectName].push(columnName)
  }

  return result
}

export function buildColumnsDetailsMap(
  rows: Array<Record<string, unknown>>,
  objectNames: string[],
  objectKey: string,
  columnKey: string,
  dataTypeKey: string,
  sizeKey?: string
) {
  const allowedObjects = new Set(objectNames)
  const result: Record<string, ColumnDetails[]> = {}

  for (const row of rows) {
    const objectName = String(row[objectKey] ?? row[objectKey.toUpperCase()] ?? "").trim()
    const name = String(row[columnKey] ?? row[columnKey.toUpperCase()] ?? "").trim()
    const dataType = String(row[dataTypeKey] ?? row[dataTypeKey.toUpperCase()] ?? "").trim().toUpperCase()
    const size = sizeKey ? String(row[sizeKey] ?? row[sizeKey.toUpperCase()] ?? "").trim() : ""

    if (!objectName || !name || !allowedObjects.has(objectName)) {
      continue
    }

    if (!result[objectName]) {
      result[objectName] = []
    }

    result[objectName].push({ name, dataType, size })
  }

  return result
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}
