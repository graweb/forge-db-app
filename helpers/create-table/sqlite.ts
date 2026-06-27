import type { SavedConnection } from "@/types/connections"

import { quoteIdentifier, sanitizeDatabaseIdentifier } from "@/helpers/connections"

import { buildCreateTableColumnDefinition, type CreateTableColumnSpec } from "./shared"

export function buildSqliteCreateTableSql(
  connection: SavedConnection,
  tableName: string,
  columns: CreateTableColumnSpec[]
) {
  const tablePath = sanitizeDatabaseIdentifier(tableName)

  if (!tablePath) {
    throw new Error("Informe um nome válido para a tabela.")
  }

  const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))
  const createTableSql = `CREATE TABLE IF NOT EXISTS ${quoteIdentifier("sqlite", tablePath)} (\n  ${columnDefinitions.join(",\n  ")}\n)`

  return {
    tablePath,
    createTableSql,
  }
}
