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
  const sequenceDefinitions = columns
    .filter((column) => column.autoIncrement)
    .map((column) => {
      const sequenceName = buildPostgreSqlSequenceName(tableName, column.name)
      const quotedSequence = quoteIdentifier("postgresql", sequenceName)
      const qualifiedSequence = `${quotedSchema}.${quotedSequence}`
      const qualifiedColumn = `${quotedSchema}.${quotedTable}.${quoteIdentifier("postgresql", column.name)}`

      return {
        sequenceName,
        qualifiedSequence,
        createSql: `CREATE SEQUENCE IF NOT EXISTS ${qualifiedSequence}`,
        ownedBySql: `ALTER SEQUENCE ${qualifiedSequence} OWNED BY ${qualifiedColumn}`,
      }
    })
  const columnDefinitions = columns.map((column) => {
    if (!column.autoIncrement) {
      return buildCreateTableColumnDefinition(connection, column)
    }

    const sequenceName = buildPostgreSqlSequenceName(tableName, column.name)
    const qualifiedSequence = `${quotedSchema}.${quoteIdentifier("postgresql", sequenceName)}`
    const defaultValue = `nextval(${quoteSqlLiteral(`${qualifiedSequence}`)}::regclass)`

    return buildCreateTableColumnDefinition(connection, {
      ...column,
      autoIncrement: false,
      defaultValue,
      notNull: true,
    })
  })
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
    sequenceSql: sequenceDefinitions.map((sequence) => sequence.createSql),
    createTableSql,
    sequenceOwnedBySql: sequenceDefinitions.map((sequence) => sequence.ownedBySql),
    commentSql,
  }
}

export function buildPostgreSqlSequenceName(tableName: string, columnName: string) {
  const suffix = `${tableName}_${columnName}_seq`
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")

  return suffix || "forge_sequence"
}
