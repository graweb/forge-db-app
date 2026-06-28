import type { SavedConnection } from "@/types/connections"

import { quoteIdentifier, quoteSqlLiteral } from "@/helpers/connections"

import {
  buildCreateTableColumnDefinition,
  buildCreateTableForeignKeyDefinition,
  type CreateTableColumnSpec,
  type CreateTableForeignKeySpec,
} from "./shared"

export function buildMySqlLikeCreateTableSql(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: CreateTableColumnSpec[]
) {
  const quotedSchema = quoteIdentifier(connection.databaseType, schemaName)
  const quotedTable = quoteIdentifier(connection.databaseType, tableName)
  const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))
  const tableCommentClause =
    comment && (connection.databaseType === "mysql" || connection.databaseType === "mariadb")
      ? ` COMMENT=${quoteSqlLiteral(comment)}`
      : ""

  return `CREATE TABLE IF NOT EXISTS ${quotedSchema}.${quotedTable} (\n  ${columnDefinitions.join(",\n  ")}\n)${tableCommentClause}`
}

export function buildMySqlLikeAddForeignKeySql(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  foreignKeys: CreateTableForeignKeySpec[]
) {
  const qualifiedTable = `${quoteIdentifier(connection.databaseType, schemaName)}.${quoteIdentifier(
    connection.databaseType,
    tableName
  )}`

  return foreignKeys.map((foreignKey, index) => {
    const definition = buildCreateTableForeignKeyDefinition(
      connection,
      tableName,
      foreignKey,
      index,
      schemaName
    )

    return `ALTER TABLE ${qualifiedTable} ADD ${definition}`
  })
}
