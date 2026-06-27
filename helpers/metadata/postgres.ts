import { buildColumnsMap } from "./shared"

export async function getPostgreSqlColumnsByItem(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
  },
  schemaName: string,
  objectNames: string[]
) {
  if (!objectNames.length) {
    return {}
  }

  const result = await client.query(
    `
      SELECT table_name AS object_name, column_name AS column_name
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position
    `,
    [schemaName]
  )

  return buildColumnsMap(result.rows, schemaName, objectNames, "object_name", "column_name")
}
