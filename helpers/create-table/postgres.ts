import type { SavedConnection } from "@/types/connections"

import { quoteIdentifier, quoteSqlLiteral } from "@/helpers/connections"

import {
  buildCreateTableColumnDefinition,
  buildCreateTableForeignKeyDefinition,
  type CreateTableColumnSpec,
  type CreateTableForeignKeySpec,
} from "./shared"

export function buildPostgreSqlCreateTableSql(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: CreateTableColumnSpec[],
  foreignKeys: CreateTableForeignKeySpec[] = []
) {
  const createSchemaSql =
    schemaName && schemaName !== "public"
      ? `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier("postgresql", schemaName)}`
      : null
  const quotedSchema = quoteIdentifier("postgresql", schemaName)
  const quotedTable = quoteIdentifier("postgresql", tableName)
  const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))
  const foreignKeyDefinitions = foreignKeys.map((foreignKey, index) =>
    buildCreateTableForeignKeyDefinition(connection, tableName, foreignKey, index, schemaName)
  )
  const createTableSql = `CREATE TABLE IF NOT EXISTS ${quotedSchema}.${quotedTable} (\n  ${[
    ...columnDefinitions,
    ...foreignKeyDefinitions,
  ].join(",\n  ")}\n)`
  const commentSql = comment
    ? `COMMENT ON TABLE ${quotedSchema}.${quotedTable} IS ${quoteSqlLiteral(comment)}`
    : null

  return {
    createSchemaSql,
    createTableSql,
    commentSql,
  }
}
