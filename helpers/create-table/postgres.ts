import type { SavedConnection } from "@/types/connections"

import { quoteIdentifier, quoteSqlLiteral } from "@/helpers/connections"

import { buildCreateTableColumnDefinition, type CreateTableColumnSpec } from "./shared"

export function buildPostgreSqlCreateTableSql(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: CreateTableColumnSpec[]
) {
  const createSchemaSql =
    schemaName && schemaName !== "public"
      ? `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier("postgresql", schemaName)}`
      : null
  const quotedSchema = quoteIdentifier("postgresql", schemaName)
  const quotedTable = quoteIdentifier("postgresql", tableName)
  const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))
  const createTableSql = `CREATE TABLE IF NOT EXISTS ${quotedSchema}.${quotedTable} (\n  ${columnDefinitions.join(",\n  ")}\n)`
  const commentSql = comment
    ? `COMMENT ON TABLE ${quotedSchema}.${quotedTable} IS ${quoteSqlLiteral(comment)}`
    : null

  return {
    createSchemaSql,
    createTableSql,
    commentSql,
  }
}
