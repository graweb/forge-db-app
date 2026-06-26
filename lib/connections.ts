import { randomUUID } from "node:crypto"
import { mkdirSync, access as accessCb } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

import Database from "better-sqlite3"
import mariadb from "mariadb"
import mysql from "mysql2/promise"
import { Client as PostgresClient } from "pg"
import sql from "mssql"

export type DatabaseType = "mysql" | "mariadb" | "postgresql" | "sqlserver" | "sqlite"

export type ConnectionInput = {
  databaseType: DatabaseType
  connectionName: string
  host: string
  port: string
  user: string
  password: string
  databaseName: string
  databaseFile: string
  additional: string
  useSsl: boolean
}

export type TestConnectionResult = {
  message: string
  details: string
}

export type SerializedValue = string | number | boolean | null

export type QueryExecutionResult = {
  columns: string[]
  rows: Array<Record<string, SerializedValue>>
  rowCount: number
  affectedRows?: number
  message: string
}

export type SavedConnection = ConnectionInput & {
  id: string
  createdAt: string
  updatedAt: string
}

const access = promisify(accessCb)
const appDataDir = path.join(process.cwd(), "data")
const databasePath = path.join(appDataDir, "forge-db.sqlite")

let sqliteDatabase: Database.Database | null = null

function sanitizeText(value?: string) {
  return value?.trim() ?? ""
}

function serializeValue(value: unknown): SerializedValue {
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

function normalizeRows(rows: Array<Record<string, unknown>>) {
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

function ensureAppDatabase() {
  if (sqliteDatabase) {
    return sqliteDatabase
  }

  mkdirSync(appDataDir, { recursive: true })

  sqliteDatabase = new Database(databasePath)
  sqliteDatabase.pragma("journal_mode = WAL")
  sqliteDatabase.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      connection_name TEXT NOT NULL,
      database_type TEXT NOT NULL,
      host TEXT NOT NULL,
      port TEXT NOT NULL,
      user TEXT NOT NULL,
      password TEXT NOT NULL,
      database_name TEXT NOT NULL,
      database_file TEXT NOT NULL,
      additional TEXT NOT NULL,
      use_ssl INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  return sqliteDatabase
}

function parsePort(port?: string) {
  if (!port) return undefined
  const value = Number(port)
  return Number.isFinite(value) ? value : undefined
}

async function testSqlite(databaseFile?: string) {
  const filePath = sanitizeText(databaseFile)

  if (!filePath) {
    throw new Error("Informe o caminho do arquivo SQLite para testar a conexão.")
  }

  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath)

  await access(resolvedPath)

  return {
    message: "Arquivo SQLite encontrado com sucesso.",
    details: `O arquivo ${resolvedPath} está acessível.`,
  }
}

export async function testConnection(input: ConnectionInput): Promise<TestConnectionResult> {
  const host = sanitizeText(input.host) || "localhost"
  const user = sanitizeText(input.user)
  const password = input.password ?? ""
  const database = sanitizeText(input.databaseType === "sqlite" ? input.databaseFile : input.databaseName)
  const additional = sanitizeText(input.additional)
  const port = parsePort(input.port)
  const useSsl = Boolean(input.useSsl)

  switch (input.databaseType) {
    case "sqlite": {
      return testSqlite(database)
    }

    case "mysql": {
      const connection = await mysql.createConnection({
        host,
        port: port ?? 3306,
        user,
        password,
        database: database || undefined,
        connectTimeout: 5000,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      })

      await connection.ping()
      await connection.end()

      return {
        message: "Conexão MySQL validada com sucesso.",
        details: additional || `Servidor ${host}:${port ?? 3306} respondeu corretamente.`,
      }
    }

    case "mariadb": {
      const connection = await mariadb.createConnection({
        host,
        port: port ?? 3306,
        user,
        password,
        database: database || undefined,
        connectTimeout: 5000,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      })

      await connection.ping()
      await connection.end()

      return {
        message: "Conexão MariaDB validada com sucesso.",
        details: additional || `Servidor ${host}:${port ?? 3306} respondeu corretamente.`,
      }
    }

    case "postgresql": {
      const client = new PostgresClient({
        host,
        port: port ?? 5432,
        user,
        password,
        database: database || undefined,
        connectionTimeoutMillis: 5000,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      })

      await client.connect()
      await client.query("SELECT 1")
      await client.end()

      return {
        message: "Conexão PostgreSQL validada com sucesso.",
        details: additional || `Servidor ${host}:${port ?? 5432} respondeu corretamente.`,
      }
    }

    case "sqlserver": {
      const pool = await sql.connect({
        user,
        password,
        server: host,
        port: port ?? 1433,
        database: database || undefined,
        options: {
          encrypt: useSsl,
          trustServerCertificate: true,
        },
        connectionTimeout: 5000,
        requestTimeout: 5000,
      })

      await pool.request().query("SELECT 1")
      await pool.close()

      return {
        message: "Conexão SQL Server validada com sucesso.",
        details: additional || `Servidor ${host}:${port ?? 1433} respondeu corretamente.`,
      }
    }

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function saveConnection(input: ConnectionInput) {
  const result = await testConnection(input)
  const now = new Date().toISOString()
  const id = randomUUID()
  const db = ensureAppDatabase()

  const statement = db.prepare(`
    INSERT INTO connections (
      id,
      connection_name,
      database_type,
      host,
      port,
      user,
      password,
      database_name,
      database_file,
      additional,
      use_ssl,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @connection_name,
      @database_type,
      @host,
      @port,
      @user,
      @password,
      @database_name,
      @database_file,
      @additional,
      @use_ssl,
      @created_at,
      @updated_at
    )
  `)

  statement.run({
    id,
    connection_name: sanitizeText(input.connectionName) || "Conexão",
    database_type: input.databaseType,
    host: sanitizeText(input.host) || "localhost",
    port: sanitizeText(input.port),
    user: sanitizeText(input.user),
    password: input.password ?? "",
    database_name: sanitizeText(input.databaseName),
    database_file: sanitizeText(input.databaseFile),
    additional: sanitizeText(input.additional),
    use_ssl: input.useSsl ? 1 : 0,
    created_at: now,
    updated_at: now,
  })

  return { id, ...result }
}

async function executeSqliteQuery(connection: SavedConnection, sqlText: string) {
  const filePath = connection.databaseType === "sqlite" ? sanitizeText(connection.databaseFile) : ""

  if (!filePath) {
    throw new Error("Informe o caminho do arquivo SQLite salvo para executar a consulta.")
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const db = new Database(resolvedPath)

  try {
    const statement = db.prepare(sqlText)

    if (statement.reader) {
      const rows = statement.all() as Array<Record<string, unknown>>
      const normalized = normalizeRows(rows)

      return {
        columns: normalized.columns,
        rows: normalized.rows,
        rowCount: normalized.rows.length,
        message: normalized.rows.length
          ? `${normalized.rows.length} linha(s) retornada(s).`
          : "Consulta executada com sucesso.",
      }
    }

    const info = statement.run()

    return {
      columns: [],
      rows: [],
      rowCount: Number(info.changes ?? 0),
      affectedRows: Number(info.changes ?? 0),
      message: `${Number(info.changes ?? 0)} linha(s) afetada(s).`,
    }
  } finally {
    db.close()
  }
}

export async function executeQuery(
  connection: SavedConnection,
  sqlText: string
): Promise<QueryExecutionResult> {
  const sqlStatement = sanitizeText(sqlText)

  if (!sqlStatement) {
    throw new Error("Digite uma consulta SQL antes de executar.")
  }

  const host = sanitizeText(connection.host) || "localhost"
  const user = sanitizeText(connection.user)
  const password = connection.password ?? ""
  const database = sanitizeText(
    connection.databaseType === "sqlite" ? connection.databaseFile : connection.databaseName
  )
  const port = parsePort(connection.port)
  const useSsl = Boolean(connection.useSsl)

  switch (connection.databaseType) {
    case "sqlite": {
      return executeSqliteQuery(connection, sqlStatement)
    }

    case "mysql": {
      const client = await mysql.createConnection({
        host,
        port: port ?? 3306,
        user,
        password,
        database: database || undefined,
        connectTimeout: 5000,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      })

      try {
        const [rows, fields] = await client.query(sqlStatement)

        if (Array.isArray(rows)) {
          const normalized = normalizeRows(rows as Array<Record<string, unknown>>)

          return {
            columns: fields.map((field) => String(field.name)),
            rows: normalized.rows,
            rowCount: normalized.rows.length,
            message: `${normalized.rows.length} linha(s) retornada(s).`,
          }
        }

        const result = rows as {
          affectedRows?: number
          insertId?: number
          warningStatus?: number
        }

        const affectedRows = Number(result.affectedRows ?? 0)

        return {
          columns: [],
          rows: [],
          rowCount: affectedRows,
          affectedRows,
          message: `${affectedRows} linha(s) afetada(s).`,
        }
      } finally {
        await client.end()
      }
    }

    case "mariadb": {
      const client = await mariadb.createConnection({
        host,
        port: port ?? 3306,
        user,
        password,
        database: database || undefined,
        connectTimeout: 5000,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      })

      try {
        const result = await client.query(sqlStatement)

        if (Array.isArray(result)) {
          const normalized = normalizeRows(result as Array<Record<string, unknown>>)

          return {
            columns: normalized.columns,
            rows: normalized.rows,
            rowCount: normalized.rows.length,
            message: `${normalized.rows.length} linha(s) retornada(s).`,
          }
        }

        const affectedRows = Number((result as { affectedRows?: number }).affectedRows ?? 0)

        return {
          columns: [],
          rows: [],
          rowCount: affectedRows,
          affectedRows,
          message: `${affectedRows} linha(s) afetada(s).`,
        }
      } finally {
        await client.end()
      }
    }

    case "postgresql": {
      const client = new PostgresClient({
        host,
        port: port ?? 5432,
        user,
        password,
        database: database || undefined,
        connectionTimeoutMillis: 5000,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      })

      await client.connect()

      try {
        const result = await client.query(sqlStatement)
        const normalized = normalizeRows(result.rows as Array<Record<string, unknown>>)

        return {
          columns: result.fields.map((field) => field.name),
          rows: normalized.rows,
          rowCount: result.rowCount ?? normalized.rows.length,
          message:
            result.rowCount && result.rowCount > 0
              ? `${result.rowCount} linha(s) retornada(s).`
              : "Consulta executada com sucesso.",
        }
      } finally {
        await client.end()
      }
    }

    case "sqlserver": {
      const pool = await sql.connect({
        user,
        password,
        server: host,
        port: port ?? 1433,
        database: database || undefined,
        options: {
          encrypt: useSsl,
          trustServerCertificate: true,
        },
        connectionTimeout: 5000,
        requestTimeout: 15000,
      })

      try {
        const result = await pool.request().query(sqlStatement)
        const normalized = normalizeRows(result.recordset as Array<Record<string, unknown>>)

        return {
          columns: normalized.columns,
          rows: normalized.rows,
          rowCount: normalized.rows.length,
          message: `${normalized.rows.length} linha(s) retornada(s).`,
        }
      } finally {
        await pool.close()
      }
    }

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function executeQueryById(connectionId: string, sqlText: string) {
  const connection = getConnectionById(connectionId)

  if (!connection) {
    throw new Error("Conexão não encontrada.")
  }

  return executeQuery(connection, sqlText)
}

export function getConnectionById(id: string): SavedConnection | null {
  const db = ensureAppDatabase()
  const row = db
    .prepare(
      `
        SELECT
          id,
          connection_name as connectionName,
          database_type as databaseType,
          host,
          port,
          user,
          password,
          database_name as databaseName,
          database_file as databaseFile,
          additional,
          use_ssl as useSsl,
          created_at as createdAt,
          updated_at as updatedAt
        FROM connections
        WHERE id = ?
      `
    )
    .get(id) as
    | {
        id: string
        connectionName: string
        databaseType: DatabaseType
        host: string
        port: string
        user: string
        password: string
        databaseName: string
        databaseFile: string
        additional: string
        useSsl: number
        createdAt: string
        updatedAt: string
      }
    | undefined

  if (!row) {
    return null
  }

  return {
    id: row.id,
    connectionName: row.connectionName,
    databaseType: row.databaseType,
    host: row.host,
    port: row.port,
    user: row.user,
    password: row.password,
    databaseName: row.databaseName,
    databaseFile: row.databaseFile,
    additional: row.additional,
    useSsl: Boolean(row.useSsl),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listConnections(limit = 8): SavedConnection[] {
  const db = ensureAppDatabase()
  const rows = db
    .prepare(
      `
        SELECT
          id,
          connection_name as connectionName,
          database_type as databaseType,
          host,
          port,
          user,
          password,
          database_name as databaseName,
          database_file as databaseFile,
          additional,
          use_ssl as useSsl,
          created_at as createdAt,
          updated_at as updatedAt
        FROM connections
        ORDER BY updated_at DESC
        LIMIT ?
      `
    )
    .all(limit) as Array<{
    id: string
    connectionName: string
    databaseType: DatabaseType
    host: string
    port: string
    user: string
    password: string
    databaseName: string
    databaseFile: string
    additional: string
    useSsl: number
    createdAt: string
    updatedAt: string
  }>

  return rows.map((row) => ({
    id: row.id,
    connectionName: row.connectionName,
    databaseType: row.databaseType,
    host: row.host,
    port: row.port,
    user: row.user,
    password: row.password,
    databaseName: row.databaseName,
    databaseFile: row.databaseFile,
    additional: row.additional,
    useSsl: Boolean(row.useSsl),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}
