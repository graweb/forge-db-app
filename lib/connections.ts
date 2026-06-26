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
  charset?: string
  collation?: string
  encoding?: string
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

export const EMPTY_DATABASE_STRUCTURE: DatabaseStructure = {
  databases: [],
  schemas: [],
  groups: [],
}

export type ConnectionAvailability = {
  available: boolean
  message?: string
}

export type DatabaseStructureLoadResult = {
  databaseStructure: DatabaseStructure
  connectionAvailability: ConnectionAvailability
}

export type CreateDatabaseInput = {
  databaseName: string
  charset: string
}

export type CreateDatabaseResult = {
  message: string
  details: string
  databaseName: string
}

export type UpdateDatabaseInput = {
  databaseName: string
  charset: string
}

export type UpdateDatabaseResult = {
  message: string
  details: string
  databaseName: string
}

export type DeleteDatabaseResult = {
  message: string
  details: string
  databaseName: string
}

export type CreateTableColumnInput = {
  name: string
  dataType: string
  size: string
  notNull: boolean
  primaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

export type CreateTableInput = {
  databaseName: string
  schemaName: string
  tableName: string
  comment: string
  columns: CreateTableColumnInput[]
}

export type CreateTableResult = {
  message: string
  details: string
  tableName: string
  schemaName: string
}

export type TableColumnDefinition = {
  name: string
  dataType: string
  size: string
  notNull: boolean
  primaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

export type TableDetails = {
  databaseName: string
  schemaName: string
  tableName: string
  comment: string
  columns: TableColumnDefinition[]
  foreignKeys: string[]
  indexes: string[]
  triggers: string[]
  functions: string[]
}

export type UpdateTableInput = {
  databaseName: string
  schemaName: string
  tableName: string
  nextTableName: string
  columns: Array<TableColumnDefinition & { sourceName?: string }>
  comment: string
}

export type UpdateTableResult = {
  message: string
  details: string
  tableName: string
  schemaName: string
}

export type DeleteTableResult = {
  message: string
  details: string
  tableName: string
  schemaName: string
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

function sanitizeDatabaseIdentifier(value?: string) {
  return sanitizeText(value).replace(/[`"'\[\]]/g, "")
}

function sanitizeCharset(value?: string) {
  return sanitizeText(value).replace(/[^A-Za-z0-9_:-]/g, "")
}

function quoteIdentifier(databaseType: DatabaseType, value: string) {
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

function quoteSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function sanitizeSqlType(value?: string) {
  return sanitizeText(value).toUpperCase().replace(/[^A-Z0-9_]/g, "")
}

function sanitizeSqlExpression(value?: string) {
  return sanitizeText(value)
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
        database: "master",
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

export async function createDatabase(
  connection: SavedConnection,
  input: CreateDatabaseInput
): Promise<CreateDatabaseResult> {
  const databaseName = sanitizeDatabaseIdentifier(input.databaseName)
  const charset = sanitizeCharset(input.charset) || "utf8mb4"
  const useSsl = Boolean(connection.useSsl)

  if (!databaseName) {
    throw new Error("Informe um nome válido para o banco de dados.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      const client =
        connection.databaseType === "mysql"
          ? await mysql.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              connectTimeout: 5000,
              ssl: useSsl ? { rejectUnauthorized: false } : undefined,
            })
          : await mariadb.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              connectTimeout: 5000,
              ssl: useSsl ? { rejectUnauthorized: false } : undefined,
            })

      try {
        const quotedDatabase = quoteIdentifier(connection.databaseType, databaseName)
        await client.query(
          `CREATE DATABASE IF NOT EXISTS ${quotedDatabase} CHARACTER SET ${charset}`
        )

        return {
          message: "Banco de dados criado com sucesso.",
          details: `O banco ${databaseName} foi criado com charset ${charset}.`,
          databaseName,
        }
      } finally {
        await client.end()
      }
    }

    case "postgresql": {
      const client = new PostgresClient({
        host: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 5432,
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        database: "postgres",
        connectionTimeoutMillis: 5000,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      })

      await client.connect()

      try {
        const quotedDatabase = quoteIdentifier(connection.databaseType, databaseName)
        const normalizedCharset = charset.toUpperCase() || "UTF8"
        await client.query(
          `CREATE DATABASE ${quotedDatabase} WITH TEMPLATE template0 ENCODING ${quoteSqlLiteral(normalizedCharset)}`
        )

        return {
          message: "Banco de dados criado com sucesso.",
          details: `O banco ${databaseName} foi criado com encoding ${normalizedCharset}.`,
          databaseName,
        }
      } finally {
        await client.end()
      }
    }

    case "sqlserver": {
      const pool = await sql.connect({
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        server: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 1433,
        database: "master",
        options: {
          encrypt: useSsl,
          trustServerCertificate: true,
        },
        connectionTimeout: 5000,
        requestTimeout: 5000,
      })

      try {
        const quotedDatabase = quoteIdentifier(connection.databaseType, databaseName)
        await pool.request().query(`CREATE DATABASE ${quotedDatabase}`)

        return {
          message: "Banco de dados criado com sucesso.",
          details: `O banco ${databaseName} foi criado no SQL Server.`,
          databaseName,
        }
      } finally {
        await pool.close()
      }
    }

    case "sqlite":
      throw new Error("Não é possível criar banco de dados SQLite por esta tela.")

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function updateDatabase(
  connection: SavedConnection,
  currentDatabaseName: string,
  input: UpdateDatabaseInput
): Promise<UpdateDatabaseResult> {
  const originalDatabaseName = sanitizeDatabaseIdentifier(currentDatabaseName)
  const nextDatabaseName = sanitizeDatabaseIdentifier(input.databaseName)
  const charset = sanitizeCharset(input.charset)

  if (!originalDatabaseName) {
    throw new Error("Informe um banco de dados válido para atualizar.")
  }

  if (!nextDatabaseName) {
    throw new Error("Informe um nome válido para o banco de dados.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      if (nextDatabaseName !== originalDatabaseName) {
        throw new Error("Renomear banco de dados não é suportado para MySQL/MariaDB.")
      }

      if (!charset) {
        throw new Error("Informe um charset válido para atualizar o banco de dados.")
      }

      const client =
        connection.databaseType === "mysql"
          ? await mysql.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              database: originalDatabaseName,
              connectTimeout: 5000,
              ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
            })
          : await mariadb.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              database: originalDatabaseName,
              connectTimeout: 5000,
              ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
            })

      try {
        const quotedDatabase = quoteIdentifier(connection.databaseType, originalDatabaseName)
        await client.query(`ALTER DATABASE ${quotedDatabase} CHARACTER SET ${charset}`)

        return {
          message: "Banco de dados atualizado com sucesso.",
          details: `O charset de ${originalDatabaseName} foi atualizado para ${charset}.`,
          databaseName: originalDatabaseName,
        }
      } finally {
        await client.end()
      }
    }

    case "postgresql": {
      const client = new PostgresClient({
        host: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 5432,
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        database: "postgres",
        connectionTimeoutMillis: 5000,
        ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
      })

      await client.connect()

      try {
        if (nextDatabaseName !== originalDatabaseName) {
          await client.query(
            `ALTER DATABASE ${quoteIdentifier("postgresql", originalDatabaseName)} RENAME TO ${quoteIdentifier("postgresql", nextDatabaseName)}`
          )

          if (sanitizeText(connection.databaseName) === originalDatabaseName) {
            await updateConnection(connection.id, {
              databaseType: connection.databaseType,
              connectionName: connection.connectionName,
              host: connection.host,
              port: connection.port,
              user: connection.user,
              password: connection.password,
              databaseName: nextDatabaseName,
              databaseFile: connection.databaseFile,
              additional: connection.additional,
              useSsl: connection.useSsl,
            })
          }
        }

        return {
          message: "Banco de dados atualizado com sucesso.",
          details:
            nextDatabaseName !== originalDatabaseName
              ? `O banco ${originalDatabaseName} foi renomeado para ${nextDatabaseName}.`
              : `O banco ${originalDatabaseName} permaneceu sem alterações de nome.`,
          databaseName: nextDatabaseName,
        }
      } finally {
        await client.end()
      }
    }

    case "sqlserver": {
      const pool = await sql.connect({
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        server: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 1433,
        database: "master",
        options: {
          encrypt: Boolean(connection.useSsl),
          trustServerCertificate: true,
        },
        connectionTimeout: 5000,
        requestTimeout: 5000,
      })

      try {
        if (nextDatabaseName !== originalDatabaseName) {
          await pool.request().query(
            `ALTER DATABASE ${quoteSqlServerIdentifier(originalDatabaseName)} MODIFY NAME = ${quoteSqlServerIdentifier(nextDatabaseName)}`
          )

          if (sanitizeText(connection.databaseName) === originalDatabaseName) {
            await updateConnection(connection.id, {
              databaseType: connection.databaseType,
              connectionName: connection.connectionName,
              host: connection.host,
              port: connection.port,
              user: connection.user,
              password: connection.password,
              databaseName: nextDatabaseName,
              databaseFile: connection.databaseFile,
              additional: connection.additional,
              useSsl: connection.useSsl,
            })
          }
        }

        return {
          message: "Banco de dados atualizado com sucesso.",
          details:
            nextDatabaseName !== originalDatabaseName
              ? `O banco ${originalDatabaseName} foi renomeado para ${nextDatabaseName}.`
              : `O banco ${originalDatabaseName} foi revisado sem alterações de nome.`,
          databaseName: nextDatabaseName,
        }
      } finally {
        await pool.close()
      }
    }

    case "sqlite":
      throw new Error("Não é possível editar bancos de dados SQLite por esta tela.")

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function deleteDatabase(
  connection: SavedConnection,
  databaseName: string
): Promise<DeleteDatabaseResult> {
  const normalizedDatabaseName = sanitizeDatabaseIdentifier(databaseName)

  if (!normalizedDatabaseName) {
    throw new Error("Informe um banco de dados válido para excluir.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      const client =
        connection.databaseType === "mysql"
          ? await mysql.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              connectTimeout: 5000,
              ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
            })
          : await mariadb.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              connectTimeout: 5000,
              ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
            })

      try {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(connection.databaseType, normalizedDatabaseName)}`)
        return {
          message: "Banco de dados excluído com sucesso.",
          details: `O banco ${normalizedDatabaseName} foi removido.`,
          databaseName: normalizedDatabaseName,
        }
      } finally {
        await client.end()
      }
    }

    case "postgresql": {
      const client = new PostgresClient({
        host: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 5432,
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        database: "postgres",
        connectionTimeoutMillis: 5000,
        ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
      })

      await client.connect()

      try {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier("postgresql", normalizedDatabaseName)}`)
        return {
          message: "Banco de dados excluído com sucesso.",
          details: `O banco ${normalizedDatabaseName} foi removido.`,
          databaseName: normalizedDatabaseName,
        }
      } finally {
        await client.end()
      }
    }

    case "sqlserver": {
      const pool = await sql.connect({
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        server: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 1433,
        database: "master",
        options: {
          encrypt: Boolean(connection.useSsl),
          trustServerCertificate: true,
        },
        connectionTimeout: 5000,
        requestTimeout: 5000,
      })

      try {
        await pool.request().query(`DROP DATABASE ${quoteSqlServerIdentifier(normalizedDatabaseName)}`)
        return {
          message: "Banco de dados excluído com sucesso.",
          details: `O banco ${normalizedDatabaseName} foi removido.`,
          databaseName: normalizedDatabaseName,
        }
      } finally {
        await pool.close()
      }
    }

    case "sqlite":
      throw new Error("Não é possível excluir bancos de dados SQLite por esta tela.")

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function getTableDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  tableName: string
): Promise<TableDetails> {
  const normalizedDatabase = sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim()
  const normalizedSchema = sanitizeDatabaseIdentifier(schemaName) || getFallbackSchemaName(connection)
  const normalizedTable = sanitizeDatabaseIdentifier(tableName)

  if (!normalizedTable) {
    throw new Error("Informe uma tabela válida.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb":
      return getMySqlLikeTableDetails(connection, normalizedDatabase, normalizedSchema, normalizedTable)
    case "postgresql":
      return getPostgreSqlTableDetails(connection, normalizedDatabase, normalizedSchema, normalizedTable)
    case "sqlserver":
      return getSqlServerTableDetails(connection, normalizedDatabase, normalizedSchema, normalizedTable)
    case "sqlite":
      return getSqliteTableDetails(connection, normalizedTable)
    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function updateTable(
  connection: SavedConnection,
  input: UpdateTableInput
): Promise<UpdateTableResult> {
  const normalizedDatabase = sanitizeDatabaseIdentifier(input.databaseName) || connection.databaseName.trim()
  const normalizedSchema = sanitizeDatabaseIdentifier(input.schemaName) || getFallbackSchemaName(connection)
  const originalTableName = sanitizeDatabaseIdentifier(input.tableName)
  const nextTableName = sanitizeDatabaseIdentifier(input.nextTableName)
  const normalizedColumns = input.columns
    .map((column) => ({
      sourceName: sanitizeDatabaseIdentifier(column.sourceName ?? column.name) || column.name,
      name: sanitizeDatabaseIdentifier(column.name),
      dataType: sanitizeText(column.dataType).toUpperCase(),
      size: sanitizeText(column.size),
      notNull: Boolean(column.notNull),
      primaryKey: Boolean(column.primaryKey),
      autoIncrement: Boolean(column.autoIncrement),
      defaultValue: sanitizeText(column.defaultValue),
      comment: sanitizeText(column.comment),
    }))
    .filter((column) => Boolean(column.name))

  if (!originalTableName) {
    throw new Error("Informe uma tabela válida para atualizar.")
  }

  if (!nextTableName) {
    throw new Error("Informe um novo nome válido para a tabela.")
  }

  if (!normalizedColumns.length) {
    throw new Error("Informe ao menos uma coluna válida para atualizar a tabela.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      const client =
        connection.databaseType === "mysql"
          ? await mysql.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              database: normalizedDatabase,
              connectTimeout: 5000,
              ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
            })
          : await mariadb.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              database: normalizedDatabase,
              connectTimeout: 5000,
              ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
            })

      try {
        const tempTableName = `${originalTableName}__forge_tmp_${randomUUID().replace(/-/g, "").slice(0, 10)}`
        const qualifiedOriginal = `${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
          connection.databaseType,
          originalTableName
        )}`
        const qualifiedTemp = `${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
          connection.databaseType,
          tempTableName
        )}`

        await createSqlTableLike(
          connection,
          normalizedSchema,
          tempTableName,
          input.comment,
          normalizedColumns,
          connection.databaseType
        )

        const targetColumns = normalizedColumns.map((column) =>
          quoteIdentifier(connection.databaseType, column.name)
        )
        const sourceColumns = normalizedColumns.map((column) =>
          quoteIdentifier(connection.databaseType, column.sourceName || column.name)
        )

        if (targetColumns.length) {
          await client.query(
            `INSERT INTO ${qualifiedTemp} (${targetColumns.join(", ")}) SELECT ${sourceColumns.join(
              ", "
            )} FROM ${qualifiedOriginal}`
          )
        }

        await client.query(`DROP TABLE ${qualifiedOriginal}`)

        if (tempTableName !== nextTableName) {
          await client.query(
            `RENAME TABLE ${qualifiedTemp} TO ${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
              connection.databaseType,
              nextTableName
            )}`
          )
        } else {
          await client.query(
            `RENAME TABLE ${qualifiedTemp} TO ${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
              connection.databaseType,
              originalTableName
            )}`
          )
        }

        return {
          message: "Tabela atualizada com sucesso.",
          details:
            nextTableName === originalTableName
              ? `A estrutura da tabela ${originalTableName} foi atualizada com sucesso.`
              : `A tabela ${originalTableName} foi renomeada para ${nextTableName}.`,
          tableName: nextTableName,
          schemaName: normalizedSchema,
        }
      } finally {
        await client.end()
      }
    }

    case "postgresql": {
      const client = new PostgresClient({
        host: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 5432,
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        database: normalizedDatabase || "postgres",
        connectionTimeoutMillis: 5000,
        ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
      })

      await client.connect()

      try {
        const tempTableName = `${originalTableName}__forge_tmp_${randomUUID().replace(/-/g, "").slice(0, 10)}`
        const qualifiedOriginal = `${quoteIdentifier("postgresql", normalizedSchema)}.${quoteIdentifier(
          "postgresql",
          originalTableName
        )}`
        const qualifiedTemp = `${quoteIdentifier("postgresql", normalizedSchema)}.${quoteIdentifier(
          "postgresql",
          tempTableName
        )}`

        await createPostgreSqlTable(connection, normalizedSchema, tempTableName, input.comment, normalizedColumns)

        const targetColumns = normalizedColumns.map((column) => quoteIdentifier("postgresql", column.name))
        const sourceColumns = normalizedColumns.map((column) =>
          quoteIdentifier("postgresql", column.sourceName || column.name)
        )

        if (targetColumns.length) {
          await client.query(
            `INSERT INTO ${qualifiedTemp} (${targetColumns.join(", ")}) SELECT ${sourceColumns.join(
              ", "
            )} FROM ${qualifiedOriginal}`
          )
        }

        await client.query(`DROP TABLE ${qualifiedOriginal}`)
        await client.query(
          `ALTER TABLE ${qualifiedTemp} RENAME TO ${quoteIdentifier("postgresql", nextTableName)}`
        )

        return {
          message: "Tabela atualizada com sucesso.",
          details:
            nextTableName === originalTableName
              ? `A estrutura da tabela ${originalTableName} foi atualizada com sucesso.`
              : `A tabela ${originalTableName} foi renomeada para ${nextTableName}.`,
          tableName: nextTableName,
          schemaName: normalizedSchema,
        }
      } finally {
        await client.end()
      }
    }

    case "sqlserver": {
      const pool = await sql.connect({
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        server: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 1433,
        database: normalizedDatabase || "master",
        options: {
          encrypt: Boolean(connection.useSsl),
          trustServerCertificate: true,
        },
        connectionTimeout: 5000,
        requestTimeout: 5000,
      })

      try {
        const tempTableName = `${originalTableName}__forge_tmp_${randomUUID().replace(/-/g, "").slice(0, 10)}`
        const qualifiedOriginal = `${quoteSqlServerIdentifier(normalizedSchema)}.${quoteSqlServerIdentifier(
          originalTableName
        )}`
        const qualifiedTemp = `${quoteSqlServerIdentifier(normalizedSchema)}.${quoteSqlServerIdentifier(
          tempTableName
        )}`

        await createSqlServerTable(
          connection,
          normalizedDatabase,
          normalizedSchema,
          tempTableName,
          input.comment,
          normalizedColumns
        )

        const targetColumns = normalizedColumns.map((column) => quoteSqlServerIdentifier(column.name))
        const sourceColumns = normalizedColumns.map((column) =>
          quoteSqlServerIdentifier(column.sourceName || column.name)
        )

        if (targetColumns.length) {
          const identityInsert = normalizedColumns.some((column) => column.autoIncrement)

          if (identityInsert) {
            await pool.request().query(`SET IDENTITY_INSERT ${qualifiedTemp} ON`)
          }

          try {
            await pool.request().query(
              `INSERT INTO ${qualifiedTemp} (${targetColumns.join(", ")}) SELECT ${sourceColumns.join(
                ", "
              )} FROM ${qualifiedOriginal}`
            )
          } finally {
            if (identityInsert) {
              await pool.request().query(`SET IDENTITY_INSERT ${qualifiedTemp} OFF`)
            }
          }
        }

        await pool.request().query(`DROP TABLE ${qualifiedOriginal}`)
        await pool.request().query(
          `EXEC sp_rename ${quoteSqlLiteral(`${normalizedSchema}.${tempTableName}`)}, ${quoteSqlLiteral(
            nextTableName
          )}`
        )

        return {
          message: "Tabela atualizada com sucesso.",
          details:
            nextTableName === originalTableName
              ? `A estrutura da tabela ${originalTableName} foi atualizada com sucesso.`
              : `A tabela ${originalTableName} foi renomeada para ${nextTableName}.`,
          tableName: nextTableName,
          schemaName: normalizedSchema,
        }
      } finally {
        await pool.close()
      }
    }

    case "sqlite": {
      const filePath = sanitizeText(connection.databaseFile)
      if (!filePath) {
        throw new Error("Informe o arquivo SQLite da conexão.")
      }

      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
      const db = new Database(resolvedPath)

      try {
        const tempTableName = `${originalTableName}__forge_tmp_${randomUUID().replace(/-/g, "").slice(0, 10)}`
        const qualifiedOriginal = quoteIdentifier("sqlite", originalTableName)
        const qualifiedTemp = quoteIdentifier("sqlite", tempTableName)

        await createSqliteTable(connection, tempTableName, input.comment, normalizedColumns)

        const targetColumns = normalizedColumns.map((column) => quoteIdentifier("sqlite", column.name))
        const sourceColumns = normalizedColumns.map((column) =>
          quoteIdentifier("sqlite", column.sourceName || column.name)
        )

        if (targetColumns.length) {
          db.exec(
            `INSERT INTO ${qualifiedTemp} (${targetColumns.join(", ")}) SELECT ${sourceColumns.join(
              ", "
            )} FROM ${qualifiedOriginal}`
          )
        }

        db.exec(`DROP TABLE ${qualifiedOriginal}`)
        db.exec(`ALTER TABLE ${qualifiedTemp} RENAME TO ${quoteIdentifier("sqlite", nextTableName)}`)

        return {
          message: "Tabela atualizada com sucesso.",
          details:
            nextTableName === originalTableName
              ? `A estrutura da tabela ${originalTableName} foi atualizada com sucesso.`
              : `A tabela ${originalTableName} foi renomeada para ${nextTableName}.`,
          tableName: nextTableName,
          schemaName: "main",
        }
      } finally {
        db.close()
      }
    }

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function deleteTable(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  tableName: string
): Promise<DeleteTableResult> {
  const normalizedDatabase = sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim()
  const normalizedSchema = sanitizeDatabaseIdentifier(schemaName) || getFallbackSchemaName(connection)
  const normalizedTable = sanitizeDatabaseIdentifier(tableName)

  if (!normalizedTable) {
    throw new Error("Informe uma tabela válida para excluir.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      const client =
        connection.databaseType === "mysql"
          ? await mysql.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              database: normalizedDatabase,
              connectTimeout: 5000,
              ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
            })
          : await mariadb.createConnection({
              host: sanitizeText(connection.host) || "localhost",
              port: parsePort(connection.port) ?? 3306,
              user: sanitizeText(connection.user),
              password: connection.password ?? "",
              database: normalizedDatabase,
              connectTimeout: 5000,
              ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
            })

      try {
        await client.query(
          `DROP TABLE IF EXISTS ${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
            connection.databaseType,
            normalizedTable
          )}`
        )

        return {
          message: "Tabela excluída com sucesso.",
          details: `A tabela ${normalizedTable} foi removida.`,
          tableName: normalizedTable,
          schemaName: normalizedSchema,
        }
      } finally {
        await client.end()
      }
    }

    case "postgresql": {
      const client = new PostgresClient({
        host: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 5432,
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        database: normalizedDatabase || "postgres",
        connectionTimeoutMillis: 5000,
        ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
      })

      await client.connect()

      try {
        await client.query(
          `DROP TABLE IF EXISTS ${quoteIdentifier("postgresql", normalizedSchema)}.${quoteIdentifier(
            "postgresql",
            normalizedTable
          )} CASCADE`
        )

        return {
          message: "Tabela excluída com sucesso.",
          details: `A tabela ${normalizedTable} foi removida.`,
          tableName: normalizedTable,
          schemaName: normalizedSchema,
        }
      } finally {
        await client.end()
      }
    }

    case "sqlserver": {
      const pool = await sql.connect({
        user: sanitizeText(connection.user),
        password: connection.password ?? "",
        server: sanitizeText(connection.host) || "localhost",
        port: parsePort(connection.port) ?? 1433,
        database: normalizedDatabase || "master",
        options: {
          encrypt: Boolean(connection.useSsl),
          trustServerCertificate: true,
        },
        connectionTimeout: 5000,
        requestTimeout: 5000,
      })

      try {
        await pool.request().query(
          `DROP TABLE ${quoteSqlServerIdentifier(normalizedSchema)}.${quoteSqlServerIdentifier(normalizedTable)}`
        )

        return {
          message: "Tabela excluída com sucesso.",
          details: `A tabela ${normalizedTable} foi removida.`,
          tableName: normalizedTable,
          schemaName: normalizedSchema,
        }
      } finally {
        await pool.close()
      }
    }

    case "sqlite": {
      const filePath = sanitizeText(connection.databaseFile)
      if (!filePath) {
        throw new Error("Informe o arquivo SQLite da conexão.")
      }

      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
      const db = new Database(resolvedPath)

      try {
        db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier("sqlite", normalizedTable)}`)

        return {
          message: "Tabela excluída com sucesso.",
          details: `A tabela ${normalizedTable} foi removida.`,
          tableName: normalizedTable,
          schemaName: "main",
        }
      } finally {
        db.close()
      }
    }

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function createTable(
  connection: SavedConnection,
  input: CreateTableInput
): Promise<CreateTableResult> {
  const targetDatabaseName = sanitizeDatabaseIdentifier(input.databaseName)
  const schemaName = sanitizeDatabaseIdentifier(input.schemaName) || getFallbackSchemaName(connection)
  const tableName = sanitizeDatabaseIdentifier(input.tableName)
  const comment = sanitizeSqlExpression(input.comment)
  const columns = input.columns
    .map((column) => ({
      name: sanitizeDatabaseIdentifier(column.name),
      dataType: sanitizeSqlType(column.dataType),
      size: sanitizeSqlExpression(column.size),
      notNull: Boolean(column.notNull),
      primaryKey: Boolean(column.primaryKey),
      autoIncrement: Boolean(column.autoIncrement),
      defaultValue: sanitizeSqlExpression(column.defaultValue),
      comment: sanitizeSqlExpression(column.comment),
    }))
    .filter((column) => column.name && column.dataType)

  if (!tableName) {
    throw new Error("Informe um nome válido para a tabela.")
  }

  if (!columns.length) {
    throw new Error("Adicione ao menos uma coluna para criar a tabela.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb":
      return createSqlTableLike(
        connection,
        schemaName,
        tableName,
        comment,
        columns,
        connection.databaseType
      )

    case "postgresql":
      return createPostgreSqlTable(connection, schemaName, tableName, comment, columns)

    case "sqlserver":
      return createSqlServerTable(
        connection,
        targetDatabaseName || connection.databaseName.trim() || "master",
        schemaName,
        tableName,
        comment,
        columns
      )

    case "sqlite":
      return createSqliteTable(connection, tableName, comment, columns)

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

function getFallbackSchemaName(connection: SavedConnection) {
  if (connection.databaseType === "sqlite") {
    return "main"
  }

  if (connection.databaseType === "sqlserver") {
    return "dbo"
  }

  return connection.databaseName.trim() || "public"
}

function buildCreateTableColumnDefinition(
  connection: SavedConnection,
  column: {
    name: string
    dataType: string
    size: string
    notNull: boolean
    primaryKey: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }
) {
  const columnName = quoteIdentifier(connection.databaseType, column.name)
  const parts = [columnName]
  const baseType = column.dataType
  const typeWithSize =
    column.size && /^(CHAR|NCHAR|VARCHAR|NVARCHAR|BINARY|VARBINARY|DECIMAL|NUMERIC|NUMBER)$/.test(baseType)
      ? `${baseType}(${column.size})`
      : baseType

  if (connection.databaseType === "sqlite" && column.autoIncrement && column.primaryKey) {
    return `${columnName} INTEGER PRIMARY KEY AUTOINCREMENT`
  }

  parts.push(typeWithSize)

  if (column.autoIncrement) {
    if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
      parts.push("AUTO_INCREMENT")
    } else if (connection.databaseType === "postgresql") {
      parts.push("GENERATED BY DEFAULT AS IDENTITY")
    } else if (connection.databaseType === "sqlserver") {
      parts.push("IDENTITY(1,1)")
    }
  }

  if (column.notNull) {
    parts.push("NOT NULL")
  }

  if (column.defaultValue) {
    parts.push(`DEFAULT ${normalizeDefaultValue(column.defaultValue)}`)
  }

  if (column.primaryKey && !(connection.databaseType === "sqlite" && column.autoIncrement)) {
    parts.push("PRIMARY KEY")
  }

  if (column.comment && (connection.databaseType === "mysql" || connection.databaseType === "mariadb")) {
    parts.push(`COMMENT ${quoteSqlLiteral(column.comment)}`)
  }

  return parts.join(" ")
}

function normalizeDefaultValue(value: string) {
  const trimmed = value.trim()

  if (
    /^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|NOW\(\)|TRUE|FALSE)$/i.test(trimmed) ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    return trimmed
  }

  return quoteSqlLiteral(trimmed)
}

async function createSqlTableLike(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: Array<{
    name: string
    dataType: string
    size: string
    notNull: boolean
    primaryKey: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }>,
  databaseType: "mysql" | "mariadb"
): Promise<CreateTableResult> {
  const client =
    databaseType === "mysql"
      ? await mysql.createConnection({
          host: sanitizeText(connection.host) || "localhost",
          port: parsePort(connection.port) ?? 3306,
          user: sanitizeText(connection.user),
          password: connection.password ?? "",
          database: schemaName,
          connectTimeout: 5000,
          ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
        })
      : await mariadb.createConnection({
          host: sanitizeText(connection.host) || "localhost",
          port: parsePort(connection.port) ?? 3306,
          user: sanitizeText(connection.user),
          password: connection.password ?? "",
          database: schemaName,
          connectTimeout: 5000,
          ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
        })

  try {
    const quotedSchema = quoteIdentifier(connection.databaseType, schemaName)
    const quotedTable = quoteIdentifier(connection.databaseType, tableName)
    const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))
    const tableCommentClause =
      comment && (connection.databaseType === "mysql" || connection.databaseType === "mariadb")
        ? ` COMMENT=${quoteSqlLiteral(comment)}`
        : ""

    await client.query(
      `CREATE TABLE IF NOT EXISTS ${quotedSchema}.${quotedTable} (\n  ${columnDefinitions.join(",\n  ")}\n)${tableCommentClause}`
    )

    return {
      message: "Tabela criada com sucesso.",
      details: `A tabela ${schemaName}.${tableName} foi criada com sucesso.`,
      tableName,
      schemaName,
    }
  } finally {
    await client.end()
  }
}

async function createPostgreSqlTable(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: Array<{
    name: string
    dataType: string
    size: string
    notNull: boolean
    primaryKey: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }>
): Promise<CreateTableResult> {
  const client = new PostgresClient({
    host: sanitizeText(connection.host) || "localhost",
    port: parsePort(connection.port) ?? 5432,
    user: sanitizeText(connection.user),
    password: connection.password ?? "",
    database: connection.databaseName.trim() || "postgres",
    connectionTimeoutMillis: 5000,
    ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()

  try {
    if (schemaName && schemaName !== "public") {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier("postgresql", schemaName)}`)
    }

    const quotedSchema = quoteIdentifier("postgresql", schemaName)
    const quotedTable = quoteIdentifier("postgresql", tableName)
    const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))

    await client.query(
      `CREATE TABLE IF NOT EXISTS ${quotedSchema}.${quotedTable} (\n  ${columnDefinitions.join(",\n  ")}\n)`
    )

    if (comment) {
      await client.query(
        `COMMENT ON TABLE ${quotedSchema}.${quotedTable} IS ${quoteSqlLiteral(comment)}`
      )
    }

    return {
      message: "Tabela criada com sucesso.",
      details: `A tabela ${schemaName}.${tableName} foi criada com sucesso.`,
      tableName,
      schemaName,
    }
  } finally {
    await client.end()
  }
}

async function createSqlServerTable(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  tableName: string,
  _comment: string,
  columns: Array<{
    name: string
    dataType: string
    size: string
    notNull: boolean
    primaryKey: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }>
): Promise<CreateTableResult> {
  const pool = await sql.connect({
    user: sanitizeText(connection.user),
    password: connection.password ?? "",
    server: sanitizeText(connection.host) || "localhost",
    port: parsePort(connection.port) ?? 1433,
    database: sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim() || "master",
    options: {
      encrypt: Boolean(connection.useSsl),
      trustServerCertificate: true,
    },
    connectionTimeout: 5000,
    requestTimeout: 5000,
  })

  try {
    if (schemaName && schemaName !== "dbo") {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = ${quoteSqlLiteral(schemaName)})
        EXEC('CREATE SCHEMA ${quoteSqlServerIdentifier(schemaName)}')
      `)
    }

    const quotedSchema = quoteSqlServerIdentifier(schemaName)
    const quotedTable = quoteSqlServerIdentifier(tableName)
    const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))

    await pool.request().query(
      `CREATE TABLE ${quotedSchema}.${quotedTable} (\n  ${columnDefinitions.join(",\n  ")}\n)`
    )

    return {
      message: "Tabela criada com sucesso.",
      details: `A tabela ${schemaName}.${tableName} foi criada com sucesso.`,
      tableName,
      schemaName,
    }
  } finally {
    await pool.close()
  }
}

async function createSqliteTable(
  connection: SavedConnection,
  tableName: string,
  _comment: string,
  columns: Array<{
    name: string
    dataType: string
    size: string
    notNull: boolean
    primaryKey: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }>
): Promise<CreateTableResult> {
  const tablePath = sanitizeDatabaseIdentifier(tableName)

  if (!tablePath) {
    throw new Error("Informe um nome válido para a tabela.")
  }

  const filePath = sanitizeText(connection.databaseFile)
  if (!filePath) {
    throw new Error("Informe o arquivo SQLite da conexão.")
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const db = new Database(resolvedPath)
  const columnDefinitions = columns.map((column) => buildCreateTableColumnDefinition(connection, column))

  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${quoteIdentifier("sqlite", tablePath)} (\n  ${columnDefinitions.join(",\n  ")}\n)`
    )
  } finally {
    db.close()
  }

  return {
    message: "Tabela criada com sucesso.",
    details: `A tabela ${tablePath} foi criada com sucesso.`,
    tableName: tablePath,
    schemaName: "main",
  }
}

export async function saveConnection(input: ConnectionInput) {
  const result = await testConnection(input)
  const id = randomUUID()
  persistConnectionRecord(id, input, true)

  return { id, ...result }
}

export async function updateConnection(id: string, input: ConnectionInput) {
  const existingConnection = getConnectionById(id)

  if (!existingConnection) {
    throw new Error("Conexão não encontrada.")
  }

  const result = await testConnection(input)
  persistConnectionRecord(id, input, false)

  return { id, ...result }
}

function persistConnectionRecord(id: string, input: ConnectionInput, isNewRecord: boolean) {
  const now = new Date().toISOString()
  const db = ensureAppDatabase()

  if (isNewRecord) {
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
    return
  }

  const statement = db.prepare(`
    UPDATE connections
    SET
      connection_name = @connection_name,
      database_type = @database_type,
      host = @host,
      port = @port,
      user = @user,
      password = @password,
      database_name = @database_name,
      database_file = @database_file,
      additional = @additional,
      use_ssl = @use_ssl,
      updated_at = @updated_at
    WHERE id = @id
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
    updated_at: now,
  })
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
      return EMPTY_DATABASE_STRUCTURE
  }
}

export async function getDatabaseStructureLoadResult(
  connection: SavedConnection
): Promise<DatabaseStructureLoadResult> {
  try {
    const databaseStructure = await getDatabaseStructure(connection)

    return {
      databaseStructure,
      connectionAvailability: {
        available: true,
      },
    }
  } catch (error) {
    return {
      databaseStructure: EMPTY_DATABASE_STRUCTURE,
      connectionAvailability: {
        available: false,
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível acessar a conexão no momento.",
      },
    }
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
          charset: "UTF-8",
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
    const metadataRows = await runMySqlLikeMetadataQuery(
      client,
      databaseType,
      `
        SELECT
          DEFAULT_CHARACTER_SET_NAME AS charset,
          DEFAULT_COLLATION_NAME AS collation
        FROM INFORMATION_SCHEMA.SCHEMATA
        WHERE SCHEMA_NAME = ?
        LIMIT 1
      `,
      [schemaName]
    )
    const metadataRow = metadataRows[0] ?? {}
    const metadata = {
      charset:
        String(
          metadataRow.charset ??
            metadataRow.CHARSET ??
            metadataRow.default_character_set_name ??
            ""
        ).trim() || undefined,
      collation:
        String(metadataRow.collation ?? metadataRow.COLLATION ?? metadataRow.default_collation_name ?? "")
          .trim() || undefined,
    }
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
          charset: metadata.charset,
          collation: metadata.collation,
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
    const encodingResult = await client.query(`
      SELECT pg_encoding_to_char(encoding) AS encoding
      FROM pg_database
      WHERE datname = current_database()
      LIMIT 1
    `)
    const encoding =
      String(encodingResult.rows[0]?.encoding ?? encodingResult.rows[0]?.ENCODING ?? "").trim() ||
      undefined

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
          encoding,
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

  const pool = await sql.connect({
    user,
    password,
    server: host,
    port: port ?? 1433,
    database: "master",
    options: {
      encrypt: useSsl,
      trustServerCertificate: true,
    },
    connectionTimeout: 5000,
    requestTimeout: 5000,
  })

  try {
    const databaseRows = (await pool.request().query(`
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
  const collationResult = await pool.request().query(`
    SELECT collation_name AS collation
    FROM sys.databases
    WHERE name = ${quoteSqlLiteral(databaseName)}
  `)
  const collation =
    String(collationResult.recordset[0]?.collation ?? collationResult.recordset[0]?.COLLATION ?? "")
      .trim() || undefined

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
    collation,
  }
}

async function getMySqlLikeTableDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  tableName: string
): Promise<TableDetails> {
  const client =
    connection.databaseType === "mysql"
      ? await mysql.createConnection({
          host: sanitizeText(connection.host) || "localhost",
          port: parsePort(connection.port) ?? 3306,
          user: sanitizeText(connection.user),
          password: connection.password ?? "",
          database: databaseName,
          connectTimeout: 5000,
          ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
        })
      : await mariadb.createConnection({
          host: sanitizeText(connection.host) || "localhost",
          port: parsePort(connection.port) ?? 3306,
          user: sanitizeText(connection.user),
          password: connection.password ?? "",
          database: databaseName,
          connectTimeout: 5000,
          ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
        })

  try {
    const rows = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `
        SELECT
          COLUMN_NAME AS name,
          DATA_TYPE AS data_type,
          CHARACTER_MAXIMUM_LENGTH AS char_length,
          NUMERIC_PRECISION AS numeric_precision,
          NUMERIC_SCALE AS numeric_scale,
          IS_NULLABLE AS is_nullable,
          COLUMN_DEFAULT AS default_value,
          COLUMN_KEY AS column_key,
          EXTRA AS extra,
          COLUMN_COMMENT AS comment
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `,
      [schemaName, tableName]
    )

    const tableRows = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `
        SELECT TABLE_COMMENT AS comment
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        LIMIT 1
      `,
      [schemaName, tableName]
    )
    const foreignKeys = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `
        SELECT DISTINCT
          rc.CONSTRAINT_NAME AS name,
          kcu.COLUMN_NAME AS column_name,
          kcu.REFERENCED_TABLE_NAME AS referenced_table,
          kcu.REFERENCED_COLUMN_NAME AS referenced_column
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        INNER JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
          ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ?
          AND kcu.TABLE_NAME = ?
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY rc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
      `,
      [schemaName, tableName]
    )
    const indexes = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `
        SELECT DISTINCT INDEX_NAME AS name
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND INDEX_NAME <> 'PRIMARY'
        ORDER BY INDEX_NAME
      `,
      [schemaName, tableName]
    )
    const triggers = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `
        SELECT TRIGGER_NAME AS name
        FROM INFORMATION_SCHEMA.TRIGGERS
        WHERE TRIGGER_SCHEMA = ?
          AND EVENT_OBJECT_TABLE = ?
        ORDER BY TRIGGER_NAME
      `,
      [schemaName, tableName]
    )
    const functions = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `
        SELECT ROUTINE_NAME AS name
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = ?
          AND ROUTINE_TYPE = 'FUNCTION'
        ORDER BY ROUTINE_NAME
      `,
      [schemaName]
    )

    return {
      databaseName,
      schemaName,
      tableName,
      comment: String(tableRows[0]?.comment ?? tableRows[0]?.COMMENT ?? "").trim(),
      columns: rows.map((row) => ({
        name: String(row.name ?? row.COLUMN_NAME ?? "").trim(),
        dataType: String(row.data_type ?? row.DATA_TYPE ?? "").trim().toUpperCase(),
        size: normalizeColumnSize(row.char_length, row.numeric_precision, row.numeric_scale),
        notNull: String(row.is_nullable ?? row.IS_NULLABLE ?? "").toUpperCase() === "NO",
        primaryKey: String(row.column_key ?? row.COLUMN_KEY ?? "").toUpperCase() === "PRI",
        autoIncrement: String(row.extra ?? row.EXTRA ?? "").toLowerCase().includes("auto_increment"),
        defaultValue: String(row.default_value ?? row.COLUMN_DEFAULT ?? "").trim(),
        comment: String(row.comment ?? row.COLUMN_COMMENT ?? "").trim(),
      })),
      foreignKeys: foreignKeys.map((row) => {
        const constraintName = String(row.name ?? row.CONSTRAINT_NAME ?? "").trim()
        const columnName = String(row.column_name ?? row.COLUMN_NAME ?? "").trim()
        const referencedTable = String(row.referenced_table ?? row.REFERENCED_TABLE_NAME ?? "").trim()
        const referencedColumn = String(row.referenced_column ?? row.REFERENCED_COLUMN_NAME ?? "").trim()
        return `${constraintName}: ${columnName} -> ${referencedTable}.${referencedColumn}`
      }),
      indexes: extractNames(indexes),
      triggers: extractNames(triggers),
      functions: extractNames(functions),
    }
  } finally {
    await client.end()
  }
}

async function getPostgreSqlTableDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  tableName: string
): Promise<TableDetails> {
  const client = new PostgresClient({
    host: sanitizeText(connection.host) || "localhost",
    port: parsePort(connection.port) ?? 5432,
    user: sanitizeText(connection.user),
    password: connection.password ?? "",
    database: databaseName || undefined,
    connectionTimeoutMillis: 5000,
    ssl: Boolean(connection.useSsl) ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()

  try {
    const columnsResult = await client.query(
      `
        SELECT
          column_name AS name,
          data_type,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
        ORDER BY ordinal_position
      `,
      [schemaName, tableName]
    )

    const pkResult = await client.query(
      `
        SELECT kcu.column_name AS name
        FROM information_schema.table_constraints tc
        INNER JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      `,
      [schemaName, tableName]
    )

    const commentResult = await client.query(
      `
        SELECT COALESCE(obj_description(($1 || '.' || $2)::regclass), '') AS comment
      `,
      [schemaName, tableName]
    )
    const fkResult = await client.query(
      `
        SELECT
          tc.constraint_name AS name,
          kcu.column_name AS column_name,
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column
        FROM information_schema.table_constraints tc
        INNER JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        INNER JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `,
      [schemaName, tableName]
    )
    const indexResult = await client.query(
      `
        SELECT indexname AS name
        FROM pg_indexes
        WHERE schemaname = $1
          AND tablename = $2
          AND indexname NOT LIKE '%_pkey'
        ORDER BY indexname
      `,
      [schemaName, tableName]
    )
    const triggerResult = await client.query(
      `
        SELECT trigger_name AS name
        FROM information_schema.triggers
        WHERE trigger_schema = $1
          AND event_object_table = $2
        ORDER BY trigger_name
      `,
      [schemaName, tableName]
    )
    const functionResult = await client.query(
      `
        SELECT routine_name AS name
        FROM information_schema.routines
        WHERE routine_schema = $1
          AND routine_type = 'FUNCTION'
        ORDER BY routine_name
      `,
      [schemaName]
    )

    const primaryKeys = new Set(extractNames(pkResult.rows))

    return {
      databaseName,
      schemaName,
      tableName,
      comment: String(commentResult.rows[0]?.comment ?? commentResult.rows[0]?.COMMENT ?? "").trim(),
      columns: columnsResult.rows.map((row) => ({
        name: String(row.name ?? "").trim(),
        dataType: String(row.data_type ?? "").trim().toUpperCase(),
        size: normalizeColumnSize(row.character_maximum_length, row.numeric_precision, row.numeric_scale),
        notNull: String(row.is_nullable ?? "").toUpperCase() === "NO",
        primaryKey: primaryKeys.has(String(row.name ?? "").trim()),
        autoIncrement: String(row.column_default ?? "").toLowerCase().includes("nextval("),
        defaultValue: String(row.column_default ?? "").trim(),
        comment: "",
      })),
      foreignKeys: fkResult.rows.map((row) => {
        const name = String(row.name ?? "").trim()
        const column = String(row.column_name ?? "").trim()
        const referencedTable = String(row.referenced_table ?? "").trim()
        const referencedColumn = String(row.referenced_column ?? "").trim()
        return `${name}: ${column} -> ${referencedTable}.${referencedColumn}`
      }),
      indexes: extractNames(indexResult.rows),
      triggers: extractNames(triggerResult.rows),
      functions: extractNames(functionResult.rows),
    }
  } finally {
    await client.end()
  }
}

async function getSqlServerTableDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  tableName: string
): Promise<TableDetails> {
  const pool = await sql.connect({
    user: sanitizeText(connection.user),
    password: connection.password ?? "",
    server: sanitizeText(connection.host) || "localhost",
    port: parsePort(connection.port) ?? 1433,
    database: databaseName || "master",
    options: {
      encrypt: Boolean(connection.useSsl),
      trustServerCertificate: true,
    },
    connectionTimeout: 5000,
    requestTimeout: 5000,
  })

  try {
    const fullObjectName = `${schemaName}.${tableName}`
    const columnsResult = await pool.request().query(`
      SELECT
        c.name AS name,
        t.name AS data_type,
        c.max_length AS max_length,
        c.precision AS precision,
        c.scale AS scale,
        c.is_nullable AS is_nullable,
        c.is_identity AS is_identity,
        dc.definition AS default_value,
        CAST(ep.value AS nvarchar(4000)) AS comment
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
      LEFT JOIN sys.extended_properties ep
        ON ep.major_id = c.object_id
       AND ep.minor_id = c.column_id
       AND ep.name = 'MS_Description'
      WHERE c.object_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
      ORDER BY c.column_id
    `)

    const pkResult = await pool.request().query(`
      SELECT c.name AS name
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.is_primary_key = 1
        AND i.object_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
    `)

    const commentResult = await pool.request().query(`
      SELECT CAST(ep.value AS nvarchar(4000)) AS comment
      FROM sys.extended_properties ep
      WHERE ep.major_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
        AND ep.minor_id = 0
        AND ep.name = 'MS_Description'
    `)
    const fkResult = await pool.request().query(`
      SELECT
        fk.name AS name,
        pc.name AS column_name,
        rt.name AS referenced_table,
        rc.name AS referenced_column
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
      INNER JOIN sys.tables rtbl ON fkc.referenced_object_id = rtbl.object_id
      INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
      INNER JOIN sys.tables rt ON rtbl.object_id = rt.object_id
      WHERE fk.parent_object_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
      ORDER BY fk.name, fkc.constraint_column_id
    `)
    const indexResult = await pool.request().query(`
      SELECT name
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
        AND name IS NOT NULL
        AND is_primary_key = 0
      ORDER BY name
    `)
    const triggerResult = await pool.request().query(`
      SELECT name
      FROM sys.triggers
      WHERE parent_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
      ORDER BY name
    `)
    const functionResult = await pool.request().query(`
      SELECT o.name AS name
      FROM sys.objects o
      INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE s.name = ${quoteSqlLiteral(schemaName)}
        AND o.type IN ('FN', 'IF', 'TF')
      ORDER BY o.name
    `)

    const primaryKeys = new Set(extractNames(pkResult.recordset as Array<Record<string, unknown>>))

    return {
      databaseName,
      schemaName,
      tableName,
      comment: String(commentResult.recordset[0]?.comment ?? commentResult.recordset[0]?.COMMENT ?? "").trim(),
      columns: (columnsResult.recordset as Array<Record<string, unknown>>).map((row) => ({
        name: String(row.name ?? "").trim(),
        dataType: String(row.data_type ?? "").trim().toUpperCase(),
        size: normalizeColumnSize(row.max_length, row.precision, row.scale),
        notNull: Boolean(row.is_nullable) === false,
        primaryKey: primaryKeys.has(String(row.name ?? "").trim()),
        autoIncrement: Boolean(row.is_identity),
        defaultValue: String(row.default_value ?? "").trim(),
        comment: String(row.comment ?? "").trim(),
      })),
      foreignKeys: extractNames(fkResult.recordset as Array<Record<string, unknown>>).map((name) => name),
      indexes: extractNames(indexResult.recordset as Array<Record<string, unknown>>),
      triggers: extractNames(triggerResult.recordset as Array<Record<string, unknown>>),
      functions: extractNames(functionResult.recordset as Array<Record<string, unknown>>),
    }
  } finally {
    await pool.close()
  }
}

async function getSqliteTableDetails(
  connection: SavedConnection,
  tableName: string
): Promise<TableDetails> {
  const filePath = sanitizeText(connection.databaseFile)
  if (!filePath) {
    throw new Error("Informe o arquivo SQLite da conexão.")
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const db = new Database(resolvedPath)

  try {
    const pragmaRows = db.prepare(`PRAGMA table_info(${quoteSqlLiteral(tableName)})`).all() as Array<{
      name?: string
      type?: string
      notnull?: number
      dflt_value?: string | null
      pk?: number
    }>
    const foreignKeyRows = db
      .prepare(`PRAGMA foreign_key_list(${quoteSqlLiteral(tableName)})`)
      .all() as Array<{ id?: number; from?: string; table?: string; to?: string }>
    const indexRows = db
      .prepare(`PRAGMA index_list(${quoteSqlLiteral(tableName)})`)
      .all() as Array<{ name?: string }>
    const triggerRows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ${quoteSqlLiteral(tableName)} ORDER BY name`
      )
      .all() as Array<{ name?: string }>

    return {
      databaseName: connection.databaseFile || "main",
      schemaName: "main",
      tableName,
      comment: "",
      columns: pragmaRows.map((row) => ({
        name: String(row.name ?? "").trim(),
        dataType: String(row.type ?? "").trim().toUpperCase(),
        size: "",
        notNull: Boolean(row.notnull),
        primaryKey: Boolean(row.pk),
        autoIncrement: false,
        defaultValue: String(row.dflt_value ?? "").trim(),
        comment: "",
      })),
      foreignKeys: foreignKeyRows.map((row) => {
        const from = String(row.from ?? "").trim()
        const refTable = String(row.table ?? "").trim()
        const to = String(row.to ?? "").trim()
        return `${from} -> ${refTable}.${to}`
      }),
      indexes: extractNames(indexRows),
      triggers: extractNames(triggerRows),
      functions: [],
    }
  } finally {
    db.close()
  }
}

function normalizeColumnSize(
  length?: unknown,
  precision?: unknown,
  scale?: unknown
) {
  const normalizedLength = Number(length)
  const normalizedPrecision = Number(precision)
  const normalizedScale = Number(scale)

  if (Number.isFinite(normalizedLength) && normalizedLength > 0) {
    return String(normalizedLength)
  }

  if (Number.isFinite(normalizedPrecision) && normalizedPrecision > 0) {
    return Number.isFinite(normalizedScale) && normalizedScale > 0
      ? `${normalizedPrecision},${normalizedScale}`
      : String(normalizedPrecision)
  }

  return ""
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
