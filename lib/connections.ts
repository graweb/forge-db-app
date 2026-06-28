import { randomUUID } from "node:crypto"
import { mkdirSync, access as accessCb } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

import Database from "better-sqlite3"
import mariadb from "mariadb"
import mysql from "mysql2/promise"
import { Client as PostgresClient } from "pg"
import sql from "mssql"

type QueryClient = {
  query: (queryText: string, params?: unknown[]) => Promise<unknown>
  end: () => Promise<void>
}

type SqlServerPool = {
  request: () => {
    query: (queryText: string) => Promise<{ recordset?: unknown[] }>
  }
  close: () => Promise<void>
}

import type {
  ConnectionInput,
  CreateDatabaseInput,
  CreateDatabaseResult,
  CreateTableInput,
  CreateTableResult,
  DatabaseStructure,
  DatabaseStructureDatabase,
  DatabaseStructureLoadResult,
  DatabaseType,
  DeleteDatabaseResult,
  DeleteTableResult,
  QueryExecutionResult,
  SavedConnection,
  TableDetails,
  TestConnectionResult,
  UpdateDatabaseInput,
  UpdateDatabaseResult,
  UpdateTableInput,
  UpdateTableResult,
} from "@/types/connections"
import {
  buildMySqlLikeConnectionOptions,
  buildPostgresConnectionOptions,
  buildSqlServerConnectionOptions,
  getFallbackSchemaName,
  normalizeRows,
  parsePort,
  quoteIdentifier,
  quoteSqlLiteral,
  quoteSqlServerIdentifier,
  sanitizeCharset,
  sanitizeDatabaseIdentifier,
  sanitizeSqlExpression,
  sanitizeSqlType,
  sanitizeText,
} from "@/helpers/connections"
import { buildMySqlLikeCreateTableSql } from "@/helpers/create-table/mysql"
import { buildPostgreSqlCreateTableSql } from "@/helpers/create-table/postgres"
import { buildSqlServerCreateTableSql } from "@/helpers/create-table/sqlserver"
import { buildSqliteCreateTableSql } from "@/helpers/create-table/sqlite"
import {
  buildCreateTableColumnDefinition,
  type CreateTableColumnSpec,
} from "@/helpers/create-table/shared"
import {
  createGroup,
  extractNames,
  normalizeColumnSize,
  uniqueStrings,
} from "@/helpers/metadata/shared"
import { getMySqlLikeColumnsByItem, runMySqlLikeMetadataQuery } from "@/helpers/metadata/mysql"
import { getPostgreSqlColumnsByItem } from "@/helpers/metadata/postgres"
import { getSqliteColumnsByItem } from "@/helpers/metadata/sqlite"
import {
  extractColumnsByObjectForSchema,
  extractColumnsDetailsByObjectForSchema,
  extractNamesForSchema,
  extractSchemaNames,
} from "@/helpers/metadata/sqlserver"

export const EMPTY_DATABASE_STRUCTURE: DatabaseStructure = {
  databases: [],
  schemas: [],
  groups: [],
}

const access = promisify(accessCb)
const appDataDir = path.join(process.cwd(), "data")
const databasePath = path.join(appDataDir, "forge-db.sqlite")

let sqliteDatabase: Database.Database | null = null

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

async function withMySqlLikeClient<T>(
  connection: SavedConnection,
  database: string | undefined,
  run: (client: QueryClient) => Promise<T>
) {
  const client =
    connection.databaseType === "mysql"
      ? await mysql.createConnection(buildMySqlLikeConnectionOptions(connection, database))
      : await mariadb.createConnection(buildMySqlLikeConnectionOptions(connection, database))

  try {
    return await run(client as QueryClient)
  } finally {
    await client.end()
  }
}

async function withPostgresClient<T>(
  connection: SavedConnection,
  database: string | undefined,
  run: (client: PostgresClient) => Promise<T>
) {
  const client = new PostgresClient(buildPostgresConnectionOptions(connection, database))

  await client.connect()

  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function withSqlServerPool<T>(
  connection: SavedConnection,
  database: string,
  run: (pool: SqlServerPool) => Promise<T>
) {
  const pool = await sql.connect(buildSqlServerConnectionOptions(connection, database))

  try {
    return await run(pool)
  } finally {
    await pool.close()
  }
}

async function withSqliteDatabase<T>(connection: SavedConnection, run: (db: Database.Database) => Promise<T> | T) {
  const filePath = sanitizeText(connection.databaseFile)
  if (!filePath) {
    throw new Error("Informe o arquivo SQLite da conexão.")
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const db = new Database(resolvedPath)

  try {
    return await run(db)
  } finally {
    db.close()
  }
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

  if (!databaseName) {
    throw new Error("Informe um nome válido para o banco de dados.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      return withMySqlLikeClient(connection, undefined, async (client) => {
        const quotedDatabase = quoteIdentifier(connection.databaseType, databaseName)
        await client.query(`CREATE DATABASE IF NOT EXISTS ${quotedDatabase} CHARACTER SET ${charset}`)

        return {
          message: "Banco de dados criado com sucesso.",
          details: `O banco ${databaseName} foi criado com charset ${charset}.`,
          databaseName,
        }
      })
    }

    case "postgresql": {
      return withPostgresClient(connection, "postgres", async (client) => {
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
      })
    }

    case "sqlserver": {
      return withSqlServerPool(connection, "master", async (pool) => {
        const quotedDatabase = quoteIdentifier(connection.databaseType, databaseName)
        await pool.request().query(`CREATE DATABASE ${quotedDatabase}`)

        return {
          message: "Banco de dados criado com sucesso.",
          details: `O banco ${databaseName} foi criado no SQL Server.`,
          databaseName,
        }
      })
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

      return withMySqlLikeClient(connection, originalDatabaseName, async (client) => {
        const quotedDatabase = quoteIdentifier(connection.databaseType, originalDatabaseName)
        await client.query(`ALTER DATABASE ${quotedDatabase} CHARACTER SET ${charset}`)

        return {
          message: "Banco de dados atualizado com sucesso.",
          details: `O charset de ${originalDatabaseName} foi atualizado para ${charset}.`,
          databaseName: originalDatabaseName,
        }
      })
    }

    case "postgresql": {
      return withPostgresClient(connection, "postgres", async (client) => {
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
      })
    }

    case "sqlserver": {
      return withSqlServerPool(connection, "master", async (pool) => {
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
      })
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
      return withMySqlLikeClient(connection, undefined, async (client) => {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(connection.databaseType, normalizedDatabaseName)}`)
        return {
          message: "Banco de dados excluído com sucesso.",
          details: `O banco ${normalizedDatabaseName} foi removido.`,
          databaseName: normalizedDatabaseName,
        }
      })
    }

    case "postgresql": {
      return withPostgresClient(connection, "postgres", async (client) => {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier("postgresql", normalizedDatabaseName)}`)
        return {
          message: "Banco de dados excluído com sucesso.",
          details: `O banco ${normalizedDatabaseName} foi removido.`,
          databaseName: normalizedDatabaseName,
        }
      })
    }

    case "sqlserver": {
      return withSqlServerPool(connection, "master", async (pool) => {
        await pool.request().query(`DROP DATABASE ${quoteSqlServerIdentifier(normalizedDatabaseName)}`)
        return {
          message: "Banco de dados excluído com sucesso.",
          details: `O banco ${normalizedDatabaseName} foi removido.`,
          databaseName: normalizedDatabaseName,
        }
      })
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
      sourceName: column.sourceName ? sanitizeDatabaseIdentifier(column.sourceName) || undefined : undefined,
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

  const originalTableDetails = await getTableDetails(
    connection,
    normalizedDatabase,
    normalizedSchema,
    originalTableName
  )
  const originalColumnsByName = new Map(
    originalTableDetails.columns.map((column) => [column.name.trim(), column] as const)
  )
  const seenColumns = new Set<string>()
  const changedColumns = normalizedColumns.some((column) => {
    const sourceName = (column.sourceName || "").trim()

    if (!sourceName) {
      return false
    }

    const original = originalColumnsByName.get(sourceName)
    if (!original) {
      return true
    }

    seenColumns.add(sourceName)

    return (
      column.name.trim() !== original.name.trim() ||
      column.dataType.trim().toUpperCase() !== original.dataType.trim().toUpperCase() ||
      column.size.trim() !== original.size.trim() ||
      column.notNull !== original.notNull ||
      column.primaryKey !== original.primaryKey ||
      column.autoIncrement !== original.autoIncrement ||
      column.defaultValue.trim() !== original.defaultValue.trim() ||
      column.comment.trim() !== original.comment.trim()
    )
  })
  const removedColumns = originalTableDetails.columns.filter(
    (column) => !seenColumns.has(column.name.trim())
  )
  const requiresRebuild =
    changedColumns ||
    (connection.databaseType === "sqlite" && removedColumns.length > 0)

  const hasTableNameChange = nextTableName !== originalTableName
  const hasCommentChange = input.comment.trim() !== originalTableDetails.comment.trim()
  const addedColumns = normalizedColumns.filter((column) => !column.sourceName)

  if (!requiresRebuild) {
    switch (connection.databaseType) {
      case "mysql":
      case "mariadb": {
        return withMySqlLikeClient(connection, normalizedDatabase, async (client) => {
          const qualifiedOriginal = `${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
            connection.databaseType,
            originalTableName
          )}`
          const qualifiedNext = `${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
            connection.databaseType,
            nextTableName
          )}`

          for (const column of removedColumns) {
            await client.query(
              `ALTER TABLE ${qualifiedOriginal} DROP COLUMN ${quoteIdentifier(
                connection.databaseType,
                column.name
              )}`
            )
          }

          for (const column of addedColumns) {
            await client.query(
              `ALTER TABLE ${qualifiedOriginal} ADD COLUMN ${buildCreateTableColumnDefinition(connection, column)}`
            )
          }

          if (hasCommentChange) {
            await client.query(
              `ALTER TABLE ${qualifiedOriginal} COMMENT=${quoteSqlLiteral(input.comment.trim())}`
            )
          }

          if (hasTableNameChange) {
            await client.query(`RENAME TABLE ${qualifiedOriginal} TO ${qualifiedNext}`)
          }

          return {
            message: "Tabela atualizada com sucesso.",
            details:
              hasTableNameChange && !hasCommentChange && !addedColumns.length
                ? `A tabela ${originalTableName} foi renomeada para ${nextTableName}.`
                : `A estrutura da tabela ${originalTableName} foi atualizada com sucesso.`,
            tableName: nextTableName,
            schemaName: normalizedSchema,
          }
        })
      }

      case "postgresql": {
        return withPostgresClient(connection, normalizedDatabase || "postgres", async (client) => {
          const qualifiedOriginal = `${quoteIdentifier("postgresql", normalizedSchema)}.${quoteIdentifier(
            "postgresql",
            originalTableName
          )}`
          const quotedNextTableName = quoteIdentifier("postgresql", nextTableName)

          for (const column of removedColumns) {
            await client.query(
              `ALTER TABLE ${qualifiedOriginal} DROP COLUMN ${quoteIdentifier(
                "postgresql",
                column.name
              )}`
            )
          }

          for (const column of addedColumns) {
            await client.query(
              `ALTER TABLE ${qualifiedOriginal} ADD COLUMN ${buildCreateTableColumnDefinition(
                connection,
                column
              )}`
            )
          }

          if (hasCommentChange) {
            await client.query(
              `COMMENT ON TABLE ${qualifiedOriginal} IS ${quoteSqlLiteral(input.comment.trim())}`
            )
          }

          if (hasTableNameChange) {
            await client.query(`ALTER TABLE ${qualifiedOriginal} RENAME TO ${quotedNextTableName}`)
          }

          return {
            message: "Tabela atualizada com sucesso.",
            details:
              hasTableNameChange && !hasCommentChange && !addedColumns.length
                ? `A tabela ${originalTableName} foi renomeada para ${nextTableName}.`
                : `A estrutura da tabela ${originalTableName} foi atualizada com sucesso.`,
            tableName: nextTableName,
            schemaName: normalizedSchema,
          }
        })
      }

      case "sqlserver": {
        return withSqlServerPool(connection, normalizedDatabase || "master", async (pool) => {
          const qualifiedOriginal = `${quoteSqlServerIdentifier(normalizedSchema)}.${quoteSqlServerIdentifier(
            originalTableName
          )}`

          if (removedColumns.length) {
            await pool
              .request()
              .query(
                `ALTER TABLE ${qualifiedOriginal} DROP COLUMN ${removedColumns
                  .map((column) => quoteSqlServerIdentifier(column.name))
                  .join(", ")}`
              )
          }

          for (const column of addedColumns) {
            await pool.request().query(
              `ALTER TABLE ${qualifiedOriginal} ADD ${buildCreateTableColumnDefinition(connection, column)}`
            )
          }

          if (hasTableNameChange) {
            await pool.request().query(
              `EXEC sp_rename ${quoteSqlLiteral(`${normalizedSchema}.${originalTableName}`)}, ${quoteSqlLiteral(
                nextTableName
              )}`
            )
          }

          return {
            message: "Tabela atualizada com sucesso.",
            details:
              hasTableNameChange && !addedColumns.length
                ? `A tabela ${originalTableName} foi renomeada para ${nextTableName}.`
                : `A estrutura da tabela ${originalTableName} foi atualizada com sucesso.`,
            tableName: nextTableName,
            schemaName: normalizedSchema,
          }
        })
      }

      case "sqlite": {
        return withSqliteDatabase(connection, async (db) => {
          const qualifiedOriginal = quoteIdentifier("sqlite", originalTableName)

          for (const column of addedColumns) {
            db.exec(`ALTER TABLE ${qualifiedOriginal} ADD COLUMN ${buildCreateTableColumnDefinition(connection, column)}`)
          }

          if (hasTableNameChange) {
            db.exec(`ALTER TABLE ${qualifiedOriginal} RENAME TO ${quoteIdentifier("sqlite", nextTableName)}`)
          }

          return {
            message: "Tabela atualizada com sucesso.",
            details:
              hasTableNameChange && !addedColumns.length
                ? `A tabela ${originalTableName} foi renomeada para ${nextTableName}.`
                : `A estrutura da tabela ${originalTableName} foi atualizada com sucesso.`,
            tableName: nextTableName,
            schemaName: "main",
          }
        })
      }

      default:
        throw new Error("Tipo de banco não suportado.")
    }
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      return withMySqlLikeClient(connection, normalizedDatabase, async (client) => {
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
          normalizedColumns
        )

        const copyColumns = normalizedColumns.filter((column) => Boolean(column.sourceName))
        const targetColumns = copyColumns.map((column) => quoteIdentifier(connection.databaseType, column.name))
        const sourceColumns = copyColumns.map((column) =>
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
      })
    }

    case "postgresql": {
      return withPostgresClient(connection, normalizedDatabase || "postgres", async (client) => {
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

        const copyColumns = normalizedColumns.filter((column) => Boolean(column.sourceName))
        const targetColumns = copyColumns.map((column) => quoteIdentifier("postgresql", column.name))
        const sourceColumns = copyColumns.map((column) =>
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
      })
    }

    case "sqlserver": {
      return withSqlServerPool(connection, normalizedDatabase || "master", async (pool) => {
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

        const copyColumns = normalizedColumns.filter((column) => Boolean(column.sourceName))
        const targetColumns = copyColumns.map((column) => quoteSqlServerIdentifier(column.name))
        const sourceColumns = copyColumns.map((column) =>
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
      })
    }

    case "sqlite": {
      return withSqliteDatabase(connection, async (db) => {
        const tempTableName = `${originalTableName}__forge_tmp_${randomUUID().replace(/-/g, "").slice(0, 10)}`
        const qualifiedOriginal = quoteIdentifier("sqlite", originalTableName)
        const qualifiedTemp = quoteIdentifier("sqlite", tempTableName)

        await createSqliteTable(connection, tempTableName, input.comment, normalizedColumns)

        const copyColumns = normalizedColumns.filter((column) => Boolean(column.sourceName))
        const targetColumns = copyColumns.map((column) => quoteIdentifier("sqlite", column.name))
        const sourceColumns = copyColumns.map((column) =>
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
      })
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
      return withMySqlLikeClient(connection, normalizedDatabase, async (client) => {
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
      })
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
        columns
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

async function createSqlTableLike(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: CreateTableColumnSpec[]
): Promise<CreateTableResult> {
  return withMySqlLikeClient(connection, schemaName, async (client) => {
    const createTableSql = buildMySqlLikeCreateTableSql(
      connection,
      schemaName,
      tableName,
      comment,
      columns
    )

    await client.query(createTableSql)

    return {
      message: "Tabela criada com sucesso.",
      details: `A tabela ${schemaName}.${tableName} foi criada com sucesso.`,
      tableName,
      schemaName,
    }
  })
}

async function createPostgreSqlTable(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: CreateTableColumnSpec[]
): Promise<CreateTableResult> {
  return withPostgresClient(connection, connection.databaseName.trim() || "postgres", async (client) => {
    const { createSchemaSql, createTableSql, commentSql } = buildPostgreSqlCreateTableSql(
      connection,
      schemaName,
      tableName,
      comment,
      columns
    )

    if (createSchemaSql) {
      await client.query(createSchemaSql)
    }

    await client.query(createTableSql)

    if (commentSql) {
      await client.query(commentSql)
    }

    return {
      message: "Tabela criada com sucesso.",
      details: `A tabela ${schemaName}.${tableName} foi criada com sucesso.`,
      tableName,
      schemaName,
    }
  })
}

async function createSqlServerTable(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  tableName: string,
  _comment: string,
  columns: CreateTableColumnSpec[]
): Promise<CreateTableResult> {
  return withSqlServerPool(
    connection,
    sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim() || "master",
    async (pool) => {
      const { createSchemaSql, createTableSql } = buildSqlServerCreateTableSql(
        connection,
        schemaName,
        tableName,
        columns
      )

      if (createSchemaSql) {
        await pool.request().query(createSchemaSql)
      }

      await pool.request().query(createTableSql)

      return {
        message: "Tabela criada com sucesso.",
        details: `A tabela ${schemaName}.${tableName} foi criada com sucesso.`,
        tableName,
        schemaName,
      }
    }
  )
}

async function createSqliteTable(
  connection: SavedConnection,
  tableName: string,
  _comment: string,
  columns: CreateTableColumnSpec[]
): Promise<CreateTableResult> {
  return withSqliteDatabase(connection, async (db) => {
    const { tablePath, createTableSql } = buildSqliteCreateTableSql(connection, tableName, columns)
    db.exec(createTableSql)

    return {
      message: "Tabela criada com sucesso.",
      details: `A tabela ${tablePath} foi criada com sucesso.`,
      tableName: tablePath,
      schemaName: "main",
    }
  })
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
      createGroup(
        "Tabelas",
        tables,
        tableColumnsByItem.columnsByItem,
        tableColumnsByItem.columnsDetailsByItem
      ),
      createGroup("Views", views, viewColumnsByItem.columnsByItem, viewColumnsByItem.columnsDetailsByItem),
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
    const databaseNames = database
      ? [database]
      : await listMySqlLikeDatabaseNames(client, databaseType)

    const databases: DatabaseStructureDatabase[] = []

    for (const databaseName of databaseNames) {
      databases.push(await buildMySqlLikeDatabaseStructure(client, databaseType, databaseName))
    }

    return {
      databases,
      schemas: [],
      groups: [],
    }
  } finally {
    await client.end()
  }
}

async function listMySqlLikeDatabaseNames(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<unknown>
  },
  databaseType: "mysql" | "mariadb"
) {
  const rows = await runMySqlLikeMetadataQuery(
    client,
    databaseType,
    `
      SELECT schema_name AS name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY schema_name
    `,
    []
  )

  return extractNames(rows)
}

async function buildMySqlLikeDatabaseStructure(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<unknown>
  },
  databaseType: "mysql" | "mariadb",
  databaseName: string
): Promise<DatabaseStructureDatabase> {
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
    [databaseName]
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
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
    [databaseName]
  )
  const views = await runMySqlLikeMetadataQuery(
    client,
    databaseType,
    `
      SELECT TABLE_NAME AS name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'VIEW'
      ORDER BY TABLE_NAME
    `,
    [databaseName]
  )
  const indexes = await runMySqlLikeMetadataQuery(
    client,
    databaseType,
    `
      SELECT DISTINCT INDEX_NAME AS name
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND INDEX_NAME <> 'PRIMARY'
      ORDER BY name
    `,
    [databaseName]
  )
  const procedures = await runMySqlLikeMetadataQuery(
    client,
    databaseType,
    `
      SELECT ROUTINE_NAME AS name
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_SCHEMA = ?
        AND ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ROUTINE_NAME
    `,
    [databaseName]
  )
  const functions = await runMySqlLikeMetadataQuery(
    client,
    databaseType,
    `
      SELECT ROUTINE_NAME AS name
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_SCHEMA = ?
        AND ROUTINE_TYPE = 'FUNCTION'
      ORDER BY ROUTINE_NAME
    `,
    [databaseName]
  )

  const tableNames = extractNames(tables)
  const viewNames = extractNames(views)
  const tableColumnsByItem = await getMySqlLikeColumnsByItem(client, databaseType, databaseName, tableNames)
  const viewColumnsByItem = await getMySqlLikeColumnsByItem(client, databaseType, databaseName, viewNames)
  const groups = [
    createGroup("Tabelas", tableNames, tableColumnsByItem.columnsByItem, tableColumnsByItem.columnsDetailsByItem),
    createGroup("Views", viewNames, viewColumnsByItem.columnsByItem, viewColumnsByItem.columnsDetailsByItem),
    createGroup("Índices", extractNames(indexes)),
    createGroup("Funções", extractNames(functions)),
    createGroup("Procedures", extractNames(procedures)),
  ]

  return {
    name: databaseName,
    schemas: [],
    groups,
    charset: metadata.charset,
    collation: metadata.collation,
  }
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
    const tableColumnsByItem = await getPostgreSqlColumnsByItem(client, schemaName, tableNames)
    const viewColumnsByItem = await getPostgreSqlColumnsByItem(client, schemaName, viewNames)
    const groups = [
      createGroup("Tabelas", tableNames, tableColumnsByItem.columnsByItem, tableColumnsByItem.columnsDetailsByItem),
      createGroup("Views", viewNames, viewColumnsByItem.columnsByItem, viewColumnsByItem.columnsDetailsByItem),
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
        c.name AS column_name,
        UPPER(t.name) AS data_type,
        CASE
          WHEN t.name IN ('varchar', 'nvarchar', 'char', 'nchar', 'varbinary', 'binary') AND c.max_length > 0
            THEN CAST(CASE WHEN t.name IN ('nvarchar', 'nchar') THEN c.max_length / 2 ELSE c.max_length END AS varchar(20))
          WHEN t.name IN ('decimal', 'numeric')
            THEN CAST(c.precision AS varchar(20)) + ',' + CAST(c.scale AS varchar(20))
          WHEN c.max_length > 0
            THEN CAST(c.max_length AS varchar(20))
          ELSE ''
        END AS column_size
      FROM ${quotedDatabase}.sys.columns c
      INNER JOIN ${quotedDatabase}.sys.objects o ON c.object_id = o.object_id
      INNER JOIN ${quotedDatabase}.sys.types t ON c.user_type_id = t.user_type_id
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
          columnsDetailsByItem: extractColumnsDetailsByObjectForSchema(columns.recordset, schemaName),
        },
        {
          label: "Views",
          items: extractNamesForSchema(views.recordset, schemaName),
          columnsByItem: extractColumnsByObjectForSchema(columns.recordset, schemaName),
          columnsDetailsByItem: extractColumnsDetailsByObjectForSchema(columns.recordset, schemaName),
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
          kcu.REFERENCED_COLUMN_NAME AS referenced_column,
          kcu.ORDINAL_POSITION AS ordinal_position
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        INNER JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
          ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ?
          AND kcu.TABLE_NAME = ?
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY name, ordinal_position
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
        ORDER BY name
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
