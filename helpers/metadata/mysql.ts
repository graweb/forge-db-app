import type { DatabaseType } from "@/types/connections"

import { buildColumnsMap } from "./shared"

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
    return {}
  }

  const queryText = `
    SELECT TABLE_NAME AS object_name, COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `

  const rows = await runMySqlLikeMetadataQuery(client, databaseType, queryText, [schemaName])
  return buildColumnsMap(rows, schemaName, objectNames, "object_name", "column_name")
}
