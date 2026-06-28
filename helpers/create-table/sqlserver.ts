import type { SavedConnection } from "@/types/connections"

import { quoteSqlLiteral, quoteSqlServerIdentifier } from "@/helpers/connections"

import {
  buildCreateTableColumnDefinition,
  buildCreateTableForeignKeyDefinition,
  type CreateTableColumnSpec,
  type CreateTableForeignKeySpec,
} from "./shared"

export function buildSqlServerCreateTableSql(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  columns: CreateTableColumnSpec[],
  foreignKeys: CreateTableForeignKeySpec[] = []
) {
  const createSchemaSql =
    schemaName && schemaName !== "dbo"
      ? `
        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = ${quoteSqlLiteral(schemaName)})
        EXEC('CREATE SCHEMA ${quoteSqlServerIdentifier(schemaName)}')
      `
      : null
  const quotedSchema = quoteSqlServerIdentifier(schemaName)
  const quotedTable = quoteSqlServerIdentifier(tableName)
  const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))
  const foreignKeyDefinitions = foreignKeys.map((foreignKey, index) =>
    buildCreateTableForeignKeyDefinition(connection, tableName, foreignKey, index, schemaName)
  )
  const createTableSql = `CREATE TABLE ${quotedSchema}.${quotedTable} (\n  ${[
    ...columnDefinitions,
    ...foreignKeyDefinitions,
  ].join(",\n  ")}\n)`

  return {
    createSchemaSql,
    createTableSql,
  }
}
