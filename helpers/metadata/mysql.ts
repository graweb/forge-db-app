import type { DatabaseType } from "@/types/connections"

import { buildColumnsDetailsMap, buildColumnsMap } from "./shared"

export async function runMySqlLikeMetadataQuery(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<unknown>
  },
  databaseType: DatabaseType,
  queryText: string,
  params: unknown[]
) {
  if (databaseType === "mysql") {
    const [rows] = (await client.query(queryText, params)) as [
      Array<Record<string, unknown>>,
      unknown,
    ]
    return rows as Array<Record<string, unknown>>
  }

  const rows = (await client.query(queryText, params)) as Array<Record<string, unknown>>
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
}

export async function getMySqlLikeColumnsByItem(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<unknown>
  },
  databaseType: DatabaseType,
  schemaName: string,
  objectNames: string[]
) {
  if (!objectNames.length) {
    return { columnsByItem: {}, columnsDetailsByItem: {} }
  }

  const queryText = `
    SELECT TABLE_NAME AS object_name, COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `

  const rows = await runMySqlLikeMetadataQuery(client, databaseType, queryText, [schemaName])
  const detailsRows = await runMySqlLikeMetadataQuery(
    client,
    databaseType,
    `
      SELECT
        TABLE_NAME AS object_name,
        COLUMN_NAME AS column_name,
        UPPER(DATA_TYPE) AS data_type,
        COLUMN_TYPE AS column_type,
        CASE
          WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL AND CHARACTER_MAXIMUM_LENGTH >= 0 THEN CAST(CHARACTER_MAXIMUM_LENGTH AS CHAR)
          WHEN NUMERIC_PRECISION IS NOT NULL
            AND NUMERIC_SCALE IS NOT NULL
            AND UPPER(DATA_TYPE) IN ('DECIMAL', 'NUMERIC', 'NUMBER', 'FLOAT', 'DOUBLE')
            THEN CONCAT(NUMERIC_PRECISION, ',', NUMERIC_SCALE)
          WHEN NUMERIC_PRECISION IS NOT NULL THEN CAST(NUMERIC_PRECISION AS CHAR)
          ELSE ''
        END AS column_size
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `,
    [schemaName]
  )
  const primaryKeyRows = await runMySqlLikeMetadataQuery(
    client,
    databaseType,
    `
      SELECT
        TABLE_NAME AS object_name,
        COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
        AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `,
    [schemaName]
  )
  const primaryKeySet = new Set(
    primaryKeyRows.map(
      (row) =>
        `${String(row.object_name ?? row.TABLE_NAME ?? "").trim()}::${String(
          row.column_name ?? row.COLUMN_NAME ?? ""
        ).trim()}`
    )
  )
  const detailsRowsWithPrimaryKey = detailsRows.map((row) => {
    const columnType = String(row.column_type ?? row.COLUMN_TYPE ?? "").trim()
    const dataType = String(row.data_type ?? row.DATA_TYPE ?? "").trim().toUpperCase()
    const unsigned = /\bunsigned\b/i.test(columnType)
    const sizeFromType = (() => {
      const match = columnType.match(/^[^(]+\((\d+(?:\s*,\s*\d+)?)\)(?:\s+unsigned|\s+zerofill)?$/i)

      if (!match) {
        return ""
      }

      return match[1].replace(/\s+/g, "").trim()
    })()

    return {
      ...row,
      unsigned,
      column_size: (() => {
        if (dataType === "BIGINT") {
          return sizeFromType || "20"
        }

        if (
          sizeFromType &&
          /^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|NUMBER|FLOAT|DOUBLE)$/i.test(
            dataType
          )
        ) {
          return sizeFromType
        }

        return String(row.column_size ?? row.COLUMN_SIZE ?? "").trim()
      })(),
      primary_key: primaryKeySet.has(
        `${String(row.object_name ?? row.TABLE_NAME ?? "").trim()}::${String(
          row.column_name ?? row.COLUMN_NAME ?? ""
        ).trim()}`
      ),
    }
  })

  return {
    columnsByItem: buildColumnsMap(rows, schemaName, objectNames, "object_name", "column_name"),
    columnsDetailsByItem: buildColumnsDetailsMap(
      detailsRowsWithPrimaryKey,
      objectNames,
      "object_name",
      "column_name",
      "data_type",
      "column_size",
      "unsigned",
      "primary_key"
    ),
  }
}
