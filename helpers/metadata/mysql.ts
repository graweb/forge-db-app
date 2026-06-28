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
        CASE
          WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL AND CHARACTER_MAXIMUM_LENGTH >= 0 THEN CAST(CHARACTER_MAXIMUM_LENGTH AS CHAR)
          WHEN NUMERIC_PRECISION IS NOT NULL AND NUMERIC_SCALE IS NOT NULL THEN CONCAT(NUMERIC_PRECISION, ',', NUMERIC_SCALE)
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
  const detailsRowsWithPrimaryKey = detailsRows.map((row) => ({
    ...row,
    primary_key: primaryKeySet.has(
      `${String(row.object_name ?? row.TABLE_NAME ?? "").trim()}::${String(
        row.column_name ?? row.COLUMN_NAME ?? ""
      ).trim()}`
    ),
  }))

  return {
    columnsByItem: buildColumnsMap(rows, schemaName, objectNames, "object_name", "column_name"),
    columnsDetailsByItem: buildColumnsDetailsMap(
      detailsRowsWithPrimaryKey,
      objectNames,
      "object_name",
      "column_name",
      "data_type",
      "column_size",
      "primary_key"
    ),
  }
}
