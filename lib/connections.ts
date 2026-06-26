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

export type DatabaseStructureGroup = {
  label: string
  items: string[]
  columnsByItem?: Record<string, string[]>
}

export type DatabaseStructureSchema = {
  name: string
  groups: DatabaseStructureGroup[]
}

export type DatabaseStructureDatabase = {
  name: string
  schemas: DatabaseStructureSchema[]
  groups: DatabaseStructureGroup[]
}

export type DatabaseStructure = {
  databases: DatabaseStructureDatabase[]
  schemas: DatabaseStructureSchema[]
  groups: DatabaseStructureGroup[]
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
  sqlText: string,
  databaseNameOverride?: string
): Promise<QueryExecutionResult> {
  const sqlStatement = sanitizeText(sqlText)

  if (!sqlStatement) {
    throw new Error("Digite uma consulta SQL antes de executar.")
  }

  const host = sanitizeText(connection.host) || "localhost"
  const user = sanitizeText(connection.user)
  const password = connection.password ?? ""
  const database = sanitizeText(
    connection.databaseType === "sqlite"
      ? connection.databaseFile
      : databaseNameOverride ?? connection.databaseName
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

export async function executeQueryById(
  connectionId: string,
  sqlText: string,
  databaseNameOverride?: string
) {
  const connection = getConnectionById(connectionId)

  if (!connection) {
    throw new Error("Conexão não encontrada.")
  }

  return executeQuery(connection, sqlText, databaseNameOverride)
}

export async function getDatabaseStructure(connection: SavedConnection): Promise<DatabaseStructure> {
  switch (connection.databaseType) {
    case "sqlite":
      return getSqliteStructure(connection)
    case "mysql":
    case "mariadb":
      return getMySqlLikeStructure(connection)
    case "postgresql":
      return getPostgreSqlStructure(connection)
    case "sqlserver":
      return getSqlServerStructure(connection)
    default:
      return { databases: [], schemas: [], groups: [] }
  }
}

async function getSqliteStructure(connection: SavedConnection): Promise<DatabaseStructure> {
  const filePath = sanitizeText(connection.databaseFile)

  if (!filePath) {
    const groups = [
      createGroup("Tabelas", []),
      createGroup("Views", []),
      createGroup("Índices", []),
      createGroup("Funções", []),
      createGroup("Procedures", []),
    ]

    return {
      databases: [{ name: "main", schemas: [{ name: "main", groups }], groups }],
      schemas: [{ name: "main", groups }],
      groups,
    }
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const db = new Database(resolvedPath)

  try {
    const rows = db
      .prepare(
        `
          SELECT type, name
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `
      )
      .all() as Array<{ type: string; name: string }>

    const tables = rows.filter((row) => row.type === "table").map((row) => row.name)
    const views = rows.filter((row) => row.type === "view").map((row) => row.name)
    const tableColumnsByItem = await getSqliteColumnsByItem(db, tables)
    const viewColumnsByItem = await getSqliteColumnsByItem(db, views)
    const groups = [
      createGroup("Tabelas", tables, tableColumnsByItem),
      createGroup("Views", views, viewColumnsByItem),
      createGroup("Índices", rows.filter((row) => row.type === "index").map((row) => row.name)),
      createGroup("Funções", []),
      createGroup("Procedures", []),
    ]

    return {
      databases: [
        {
          name: connection.databaseName.trim() || "main",
          schemas: [{ name: connection.databaseName.trim() || "main", groups }],
          groups,
        },
      ],
      schemas: [{ name: connection.databaseName.trim() || "main", groups }],
      groups,
    }
  } finally {
    db.close()
  }
}

async function getMySqlLikeStructure(connection: SavedConnection): Promise<DatabaseStructure> {
  const host = sanitizeText(connection.host) || "localhost"
  const user = sanitizeText(connection.user)
  const password = connection.password ?? ""
  const database = sanitizeText(connection.databaseName)
  const port = parsePort(connection.port)
  const useSsl = Boolean(connection.useSsl)
  const databaseType = connection.databaseType === "mysql" ? "mysql" : "mariadb"

  const clientFactory =
    databaseType === "mysql"
      ? () =>
          mysql.createConnection({
            host,
            port: port ?? 3306,
            user,
            password,
            database: database || undefined,
            connectTimeout: 5000,
            ssl: useSsl ? { rejectUnauthorized: false } : undefined,
          })
      : () =>
          mariadb.createConnection({
            host,
            port: port ?? 3306,
            user,
            password,
            database: database || undefined,
            connectTimeout: 5000,
            ssl: useSsl ? { rejectUnauthorized: false } : undefined,
          })

  const client = await clientFactory()

  try {
    const schemaName = database || ""
    const tables = await runMySqlLikeMetadataQuery(
      client,
      databaseType,
      `
        SELECT TABLE_NAME AS name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `,
      [schemaName]
    )
    const views = await runMySqlLikeMetadataQuery(
      client,
      databaseType,
      `
        SELECT TABLE_NAME AS name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
          AND TABLE_TYPE = 'VIEW'
        ORDER BY TABLE_NAME
      `,
      [schemaName]
    )
    const indexes = await runMySqlLikeMetadataQuery(
      client,
      databaseType,
      `
        SELECT DISTINCT INDEX_NAME AS name
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
          AND INDEX_NAME <> 'PRIMARY'
        ORDER BY INDEX_NAME
      `,
      [schemaName]
    )
    const procedures = await runMySqlLikeMetadataQuery(
      client,
      databaseType,
      `
        SELECT ROUTINE_NAME AS name
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
          AND ROUTINE_TYPE = 'PROCEDURE'
        ORDER BY ROUTINE_NAME
      `,
      [schemaName]
    )
    const functions = await runMySqlLikeMetadataQuery(
      client,
      databaseType,
      `
        SELECT ROUTINE_NAME AS name
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = COALESCE(NULLIF(DATABASE(), ''), ?)
          AND ROUTINE_TYPE = 'FUNCTION'
        ORDER BY ROUTINE_NAME
      `,
      [schemaName]
    )

    const tableNames = extractNames(tables)
    const viewNames = extractNames(views)
    const groups = [
      createGroup(
        "Tabelas",
        tableNames,
        await getMySqlLikeColumnsByItem(client, databaseType, schemaName, tableNames)
      ),
      createGroup(
        "Views",
        viewNames,
        await getMySqlLikeColumnsByItem(client, databaseType, schemaName, viewNames)
      ),
      createGroup("Índices", extractNames(indexes)),
      createGroup("Funções", extractNames(functions)),
      createGroup("Procedures", extractNames(procedures)),
    ]

    return {
      databases: [
        {
          name: connection.databaseName.trim() || "schema",
          schemas: [{ name: schemaName, groups }],
          groups,
        },
      ],
      schemas: [{ name: connection.databaseName.trim() || "schema", groups }],
      groups,
    }
  } finally {
    await client.end()
  }
}

async function runMySqlLikeMetadataQuery(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<unknown>
  },
  databaseType: "mysql" | "mariadb",
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

async function getPostgreSqlStructure(connection: SavedConnection): Promise<DatabaseStructure> {
  const host = sanitizeText(connection.host) || "localhost"
  const user = sanitizeText(connection.user)
  const password = connection.password ?? ""
  const database = sanitizeText(connection.databaseName)
  const port = parsePort(connection.port)
  const useSsl = Boolean(connection.useSsl)

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
    const schemaQuery = "SELECT current_schema() AS name"
    const schemaResult = await client.query(schemaQuery)
    const schemaName = String(schemaResult.rows[0]?.name ?? "public")

    const tables = await client.query(
      `
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
      [schemaName]
    )
    const views = await client.query(
      `
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'VIEW'
        ORDER BY table_name
      `,
      [schemaName]
    )
    const indexes = await client.query(
      `
        SELECT indexname AS name
        FROM pg_indexes
        WHERE schemaname = $1
        ORDER BY indexname
      `,
      [schemaName]
    )
    const procedures = await client.query(
      `
        SELECT routine_name AS name
        FROM information_schema.routines
        WHERE routine_schema = $1
          AND routine_type = 'PROCEDURE'
        ORDER BY routine_name
      `,
      [schemaName]
    )
    const functions = await client.query(
      `
        SELECT routine_name AS name
        FROM information_schema.routines
        WHERE routine_schema = $1
          AND routine_type = 'FUNCTION'
        ORDER BY routine_name
      `,
      [schemaName]
    )

    const tableNames = extractNames(tables.rows)
    const viewNames = extractNames(views.rows)
    const groups = [
      createGroup(
        "Tabelas",
        tableNames,
        await getPostgreSqlColumnsByItem(client, schemaName, tableNames)
      ),
      createGroup(
        "Views",
        viewNames,
        await getPostgreSqlColumnsByItem(client, schemaName, viewNames)
      ),
      createGroup("Índices", extractNames(indexes.rows)),
      createGroup("Funções", extractNames(functions.rows)),
      createGroup("Procedures", extractNames(procedures.rows)),
    ]

    return {
      databases: [
        {
          name: connection.databaseName.trim() || "schema",
          schemas: [{ name: schemaName, groups }],
          groups,
        },
      ],
      schemas: [{ name: schemaName, groups }],
      groups,
    }
  } finally {
    await client.end()
  }
}

async function getSqlServerStructure(connection: SavedConnection): Promise<DatabaseStructure> {
  const host = sanitizeText(connection.host) || "localhost"
  const user = sanitizeText(connection.user)
  const password = connection.password ?? ""
  const port = parsePort(connection.port)
  const useSsl = Boolean(connection.useSsl)
  const configuredDatabase = sanitizeText(connection.databaseName)

  const pool = await sql.connect({
    user,
    password,
    server: host,
    port: port ?? 1433,
    database: sanitizeText(connection.databaseName) || undefined,
    options: {
      encrypt: useSsl,
      trustServerCertificate: true,
    },
    connectionTimeout: 5000,
    requestTimeout: 5000,
  })

  try {
    const databaseRows = configuredDatabase
      ? [{ name: configuredDatabase }]
      : (await pool.request().query(`
          SELECT name
          FROM sys.databases
          WHERE state_desc = 'ONLINE'
            AND name NOT IN ('model', 'msdb', 'tempdb', 'SSISDB', 'ReportServer', 'ReportServerTempDB')
          ORDER BY name
        `)).recordset as Array<{ name: string }>

    const databaseNames = extractNames(databaseRows)
    const databases = []

    for (const databaseName of databaseNames) {
      const databaseStructure = await getSqlServerDatabaseStructure(pool, databaseName)
      databases.push(databaseStructure)
    }

    return {
      databases,
      schemas: databases[0]?.schemas ?? [],
      groups: databases[0]?.groups ?? [],
    }
  } finally {
    await pool.close()
  }
}

async function getSqlServerDatabaseStructure(
  pool: sql.ConnectionPool,
  databaseName: string
): Promise<DatabaseStructureDatabase> {
  const quotedDatabase = quoteSqlServerIdentifier(databaseName)

  const schemasResult = await pool.request().query(`
    SELECT name
    FROM ${quotedDatabase}.sys.schemas
    WHERE name NOT IN (
      'sys',
      'INFORMATION_SCHEMA',
      'guest',
      'db_owner',
      'db_accessadmin',
      'db_securityadmin',
      'db_ddladmin',
      'db_backupoperator',
      'db_datareader',
      'db_datawriter',
      'db_denydatareader',
      'db_denydatawriter'
    )
    ORDER BY name
  `)

    const tables = await pool.request().query(`
      SELECT
        s.name AS schema_name,
        t.name AS name
      FROM ${quotedDatabase}.sys.tables t
      INNER JOIN ${quotedDatabase}.sys.schemas s ON t.schema_id = s.schema_id
      ORDER BY s.name, t.name
    `)
  const views = await pool.request().query(`
    SELECT
      s.name AS schema_name,
      v.name AS name
    FROM ${quotedDatabase}.sys.views v
    INNER JOIN ${quotedDatabase}.sys.schemas s ON v.schema_id = s.schema_id
    ORDER BY s.name, v.name
  `)
  const indexes = await pool.request().query(`
    SELECT DISTINCT
      s.name AS schema_name,
      i.name AS name
    FROM ${quotedDatabase}.sys.indexes i
    INNER JOIN ${quotedDatabase}.sys.objects o ON i.object_id = o.object_id
    INNER JOIN ${quotedDatabase}.sys.schemas s ON o.schema_id = s.schema_id
    WHERE i.name IS NOT NULL
      AND i.is_primary_key = 0
      AND o.type IN ('U', 'V')
    ORDER BY s.name, i.name
  `)
  const procedures = await pool.request().query(`
    SELECT
      s.name AS schema_name,
      p.name AS name
    FROM ${quotedDatabase}.sys.procedures p
    INNER JOIN ${quotedDatabase}.sys.schemas s ON p.schema_id = s.schema_id
    ORDER BY s.name, p.name
  `)
  const functions = await pool.request().query(`
    SELECT
      s.name AS schema_name,
      o.name AS name
    FROM ${quotedDatabase}.sys.objects o
    INNER JOIN ${quotedDatabase}.sys.schemas s ON o.schema_id = s.schema_id
    WHERE o.type IN ('FN', 'IF', 'TF')
    ORDER BY s.name, o.name
  `)

  const columns = await pool.request().query(`
      SELECT
        s.name AS schema_name,
        o.name AS object_name,
        c.name AS column_name
      FROM ${quotedDatabase}.sys.columns c
      INNER JOIN ${quotedDatabase}.sys.objects o ON c.object_id = o.object_id
      INNER JOIN ${quotedDatabase}.sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.type IN ('U', 'V')
      ORDER BY s.name, o.name, c.column_id
    `)

    const schemaNames = uniqueStrings([
      ...extractNames(schemasResult.recordset),
      ...extractSchemaNames(tables.recordset),
      ...extractSchemaNames(views.recordset),
    ...extractSchemaNames(indexes.recordset),
    ...extractSchemaNames(functions.recordset),
    ...extractSchemaNames(procedures.recordset),
  ])

    const schemas = schemaNames.map((schemaName) => ({
      name: schemaName,
      groups: [
        {
          label: "Tabelas",
          items: extractNamesForSchema(tables.recordset, schemaName),
          columnsByItem: extractColumnsByObjectForSchema(columns.recordset, schemaName),
        },
        {
          label: "Views",
          items: extractNamesForSchema(views.recordset, schemaName),
          columnsByItem: extractColumnsByObjectForSchema(columns.recordset, schemaName),
        },
        { label: "Índices", items: extractNamesForSchema(indexes.recordset, schemaName) },
        { label: "Funções", items: extractNamesForSchema(functions.recordset, schemaName) },
        { label: "Procedures", items: extractNamesForSchema(procedures.recordset, schemaName) },
      ],
    }))

  return {
    name: databaseName,
    schemas,
    groups: schemas[0]?.groups ?? [],
  }
}

function createGroup(
  label: string,
  items: string[],
  columnsByItem?: Record<string, string[]>
): DatabaseStructureGroup {
  return columnsByItem ? { label, items, columnsByItem } : { label, items }
}

function quoteSqlServerIdentifier(value: string) {
  return `[${value.replace(/\]/g, "]]")}]`
}

function extractNames(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => row.name ?? row.NAME ?? row.table_name ?? row.TABLE_NAME ?? row.indexname)
    .map((value) => (value === null || value === undefined ? "" : String(value)))
    .filter(Boolean)
}

function extractSchemaNames(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => row.schema_name ?? row.SCHEMA_NAME ?? row.table_schema ?? row.TABLE_SCHEMA)
    .map((value) => (value === null || value === undefined ? "" : String(value)))
    .filter(Boolean)
}

function extractNamesForSchema(rows: Array<Record<string, unknown>>, schemaName: string) {
  return rows
    .filter((row) => {
      const rowSchema = row.schema_name ?? row.SCHEMA_NAME ?? row.table_schema ?? row.TABLE_SCHEMA
      return String(rowSchema ?? "") === schemaName
    })
    .map((row) => row.name ?? row.NAME ?? row.table_name ?? row.TABLE_NAME ?? row.indexname)
    .map((value) => (value === null || value === undefined ? "" : String(value)))
    .filter(Boolean)
}

function extractColumnsByObjectForSchema(rows: Array<Record<string, unknown>>, schemaName: string) {
  const result: Record<string, string[]> = {}

  for (const row of rows) {
    const rowSchema = String(
      row.schema_name ?? row.SCHEMA_NAME ?? row.table_schema ?? row.TABLE_SCHEMA ?? ""
    )
    if (rowSchema !== schemaName) {
      continue
    }

    const objectName = String(
      row.object_name ?? row.OBJECT_NAME ?? row.table_name ?? row.TABLE_NAME ?? ""
    )
    const columnName = String(
      row.column_name ?? row.COLUMN_NAME ?? row.name ?? row.NAME ?? ""
    ).trim()

    if (!objectName || !columnName) {
      continue
    }

    if (!result[objectName]) {
      result[objectName] = []
    }

    result[objectName].push(columnName)
  }

  return result
}

async function getSqliteColumnsByItem(db: Database.Database, objectNames: string[]) {
  const result: Record<string, string[]> = {}

  for (const objectName of objectNames) {
    const pragmaRows = db.prepare(`PRAGMA table_info('${objectName.replace(/'/g, "''")}')`).all() as
      | Array<{ name?: string }>
      | undefined
    const columns = (pragmaRows ?? [])
      .map((row) => String(row.name ?? "").trim())
      .filter(Boolean)

    if (columns.length) {
      result[objectName] = columns
    }
  }

  return result
}

async function getMySqlLikeColumnsByItem(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<unknown>
  },
  databaseType: "mysql" | "mariadb",
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

async function getPostgreSqlColumnsByItem(
  client: PostgresClient,
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

function buildColumnsMap(
  rows: Array<Record<string, unknown>>,
  _schemaName: string,
  objectNames: string[],
  objectKey: string,
  columnKey: string
) {
  const allowedObjects = new Set(objectNames)
  const result: Record<string, string[]> = {}

  for (const row of rows) {
    const objectName = String(row[objectKey] ?? row[objectKey.toUpperCase()] ?? "").trim()
    const columnName = String(row[columnKey] ?? row[columnKey.toUpperCase()] ?? "").trim()

    if (!objectName || !columnName || !allowedObjects.has(objectName)) {
      continue
    }

    if (!result[objectName]) {
      result[objectName] = []
    }

    result[objectName].push(columnName)
  }

  return result
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
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
