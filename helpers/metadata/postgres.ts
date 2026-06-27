import { buildColumnsDetailsMap, buildColumnsMap } from "./shared"

export async function getPostgreSqlColumnsByItem(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
  },
  schemaName: string,
  objectNames: string[]
) {
  if (!objectNames.length) {
    return { columnsByItem: {}, columnsDetailsByItem: {} }
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

  const detailsResult = await client.query(
    `
      SELECT
        table_name AS object_name,
        column_name AS column_name,
        UPPER(data_type) AS data_type,
        CASE
          WHEN character_maximum_length IS NOT NULL AND character_maximum_length >= 0 THEN character_maximum_length::text
          WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL THEN numeric_precision::text || ',' || numeric_scale::text
          WHEN numeric_precision IS NOT NULL THEN numeric_precision::text
          ELSE ''
        END AS column_size
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position
    `,
    [schemaName]
  )

  return {
    columnsByItem: buildColumnsMap(result.rows, schemaName, objectNames, "object_name", "column_name"),
    columnsDetailsByItem: buildColumnsDetailsMap(
      detailsResult.rows,
      objectNames,
      "object_name",
      "column_name",
      "data_type",
      "column_size"
    ),
  }
}
