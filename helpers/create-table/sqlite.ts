import type { SavedConnection } from "@/types/connections"

import { quoteIdentifier, sanitizeDatabaseIdentifier } from "@/helpers/connections"

import {
  buildCreateTableColumnDefinition,
  buildCreateTableForeignKeyDefinition,
  type CreateTableColumnSpec,
  type CreateTableForeignKeySpec,
} from "./shared"

export function buildSqliteCreateTableSql(
  connection: SavedConnection,
  tableName: string,
  columns: CreateTableColumnSpec[],
  foreignKeys: CreateTableForeignKeySpec[] = []
) {
  const tablePath = sanitizeDatabaseIdentifier(tableName)

  if (!tablePath) {
    throw new Error("Informe um nome válido para a tabela.")
  }

  const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))
  const foreignKeyDefinitions = foreignKeys.map((foreignKey, index) =>
    buildCreateTableForeignKeyDefinition(connection, tableName, foreignKey, index, "")
  )
  const createTableSql = `CREATE TABLE IF NOT EXISTS ${quoteIdentifier("sqlite", tablePath)} (\n  ${[
    ...columnDefinitions,
    ...foreignKeyDefinitions,
  ].join(",\n  ")}\n)`

  return {
    tablePath,
    createTableSql,
  }
}
