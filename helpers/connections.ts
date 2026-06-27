import type { DatabaseType, SavedConnection, SerializedValue } from "@/types/connections"

export function sanitizeText(value?: string) {
  return value?.trim() ?? ""
}

export function serializeValue(value: unknown): SerializedValue {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("base64")
  }

  return String(value)
}

export function normalizeRows(rows: Array<Record<string, unknown>>) {
  const columns = new Set<string>()

  const normalizedRows = rows.map((row) => {
    const normalizedRow: Record<string, SerializedValue> = {}

    Object.entries(row).forEach(([key, value]) => {
      columns.add(key)
      normalizedRow[key] = serializeValue(value)
    })

    return normalizedRow
  })

  return {
    columns: Array.from(columns),
    rows: normalizedRows,
  }
}

export function parsePort(port?: string) {
  if (!port) return undefined
  const value = Number(port)
  return Number.isFinite(value) ? value : undefined
}

export function sanitizeDatabaseIdentifier(value?: string) {
  return sanitizeText(value).replace(/[`"'\[\]]/g, "")
}

export function sanitizeCharset(value?: string) {
  return sanitizeText(value).replace(/[^A-Za-z0-9_:-]/g, "")
}

export function quoteIdentifier(databaseType: DatabaseType, value: string) {
  const normalized = sanitizeDatabaseIdentifier(value)

  if (!normalized) {
    throw new Error("Informe um nome válido para o banco de dados.")
  }

  if (databaseType === "sqlserver") {
    return `[${normalized.replace(/\]/g, "]]")}]`
  }

  if (databaseType === "postgresql") {
    return `"${normalized.replace(/"/g, '""')}"`
  }

  return `\`${normalized.replace(/`/g, "``")}\``
}

export function quoteSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

export function quoteSqlServerIdentifier(value: string) {
  return `[${value.replace(/\]/g, "]]")}]`
}

export function sanitizeSqlType(value?: string) {
  return sanitizeText(value).toUpperCase().replace(/[^A-Z0-9_]/g, "")
}

export function sanitizeSqlExpression(value?: string) {
  return sanitizeText(value)
}

export function getFallbackSchemaName(connection: SavedConnection) {
  if (connection.databaseType === "sqlite") {
    return "main"
  }

  if (connection.databaseType === "sqlserver") {
    return "dbo"
  }

  return connection.databaseName.trim() || "public"
}

export function buildMySqlLikeConnectionOptions(connection: SavedConnection, database?: string) {
  const host = sanitizeText(connection.host) || "localhost"
  const user = sanitizeText(connection.user)
  const password = connection.password ?? ""
  const port = parsePort(connection.port) ?? 3306
  const ssl = Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined

  return {
    host,
    port,
    user,
    password,
    database: database || undefined,
    connectTimeout: 5000,
    ssl,
  }
}

export function buildPostgresConnectionOptions(connection: SavedConnection, database?: string) {
  const host = sanitizeText(connection.host) || "localhost"
  const user = sanitizeText(connection.user)
  const password = connection.password ?? ""
  const port = parsePort(connection.port) ?? 5432
  const ssl = Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined

  return {
    host,
    port,
    user,
    password,
    database: database || undefined,
    connectionTimeoutMillis: 5000,
    ssl,
  }
}

export function buildSqlServerConnectionOptions(connection: SavedConnection, database = "master") {
  return {
    user: sanitizeText(connection.user),
    password: connection.password ?? "",
    server: sanitizeText(connection.host) || "localhost",
    port: parsePort(connection.port) ?? 1433,
    database,
    options: {
      encrypt: Boolean(connection.useSsl),
      trustServerCertificate: true,
    },
    connectionTimeout: 5000,
    requestTimeout: 5000,
  }
}
