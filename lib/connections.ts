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
  CreateSequenceInput,
  CreateSequenceResult,
  CreateUserInput,
  CreateUserResult,
  CreateTableInput,
  CreateTableFunctionInput,
  CreateTableIndexInput,
  CreateTableTriggerInput,
  CreateTableResult,
  CreateTableForeignKeyInput,
  DatabaseStructure,
  DatabaseStructureDatabase,
  DatabaseStructureLoadResult,
  DatabaseType,
  DeleteDatabaseResult,
  DeleteRoutineResult,
  DeleteTableResult,
  DeleteViewResult,
  QueryExecutionResult,
  RoutineDetails,
  RoutineKind,
  SavedConnection,
  TableDetails,
  TableIndexDefinition,
  TestConnectionResult,
  UpdateDatabaseInput,
  UpdateDatabaseResult,
  UpdateTableInput,
  UpdateTableResult,
  ViewDetails,
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
  normalizePostgreSqlDataType,
  sanitizeCharset,
  sanitizeDatabaseIdentifier,
  sanitizeSqlExpression,
  sanitizeSqlType,
  sanitizeText,
} from "@/helpers/connections"
import {
  buildMySqlLikeAddForeignKeySql,
  buildMySqlLikeDropForeignKeySql,
  buildMySqlLikeCreateTableSql,
} from "@/helpers/create-table/mysql"
import { buildPostgreSqlCreateTableSql, buildPostgreSqlSequenceName } from "@/helpers/create-table/postgres"
import { buildSqlServerCreateTableSql } from "@/helpers/create-table/sqlserver"
import { buildSqliteCreateTableSql } from "@/helpers/create-table/sqlite"
import {
  buildCreateTableColumnDefinition,
  buildCreateTableForeignKeyDefinition,
  buildCreateTableFunctionDefinition,
  buildCreateTableIndexDefinition,
  buildCreateTableTriggerDefinition,
  buildDropTableIndexSql,
  buildDropTableTriggerSql,
  buildForeignKeyConstraintName,
  buildTableIndexName,
  type CreateTableColumnSpec,
  type CreateTableForeignKeySpec,
  type CreateTableFunctionSpec,
  type CreateTableIndexSpec,
  type CreateTableTriggerSpec,
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
  users: [],
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

export async function createUser(
  connection: SavedConnection,
  input: CreateUserInput
): Promise<CreateUserResult> {
  const userName = sanitizeDatabaseIdentifier(input.userName)
  const password = sanitizeText(input.password)
  const host = sanitizeText(input.host || "%") || "%"
  const permissions = Array.from(
    new Set((input.permissions ?? []).map((permission) => sanitizeText(permission).toUpperCase()).filter(Boolean))
  )
  const targetDatabaseName = sanitizeDatabaseIdentifier(input.databaseName) || connection.databaseName.trim()
  const targetSchemaName = sanitizeDatabaseIdentifier(input.schemaName) || getFallbackSchemaName(connection)

  if (!userName) {
    throw new Error("Informe o nome do usuário.")
  }

  if (!password) {
    throw new Error("Informe a senha do usuário.")
  }

  if (!targetDatabaseName) {
    throw new Error("Informe o banco de dados de destino.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      return withMySqlLikeClient(connection, targetDatabaseName || undefined, async (client) => {
        const qualifiedUser = `${quoteSqlLiteral(userName)}@${quoteSqlLiteral(host)}`
        const statements = [
          `CREATE USER IF NOT EXISTS ${qualifiedUser} IDENTIFIED BY ${quoteSqlLiteral(password)}`,
          `ALTER USER ${qualifiedUser} IDENTIFIED BY ${quoteSqlLiteral(password)}`,
        ]

        if (permissions.length) {
          const allowedPermissions = permissions
            .filter((permission) =>
              [
                "SELECT",
                "INSERT",
                "UPDATE",
                "DELETE",
                "CREATE",
                "ALTER",
                "DROP",
                "INDEX",
                "EXECUTE",
                "TRIGGER",
                "REFERENCES",
              ].includes(permission)
            )
          if (allowedPermissions.length) {
            statements.push(
              `GRANT ${allowedPermissions.join(", ")} ON ${quoteIdentifier(
                connection.databaseType,
                targetDatabaseName
              )}.* TO ${qualifiedUser}`
            )
          }
        }

        for (const statement of statements) {
          await client.query(statement)
        }

        return {
          message: "Usuário criado com sucesso.",
          details: `O usuário ${userName} foi criado com permissões definidas.`,
          userName,
          databaseName: targetDatabaseName,
        }
      })
    }

    case "postgresql": {
      return withPostgresClient(connection, targetDatabaseName || undefined, async (client) => {
        await client.query(
          `CREATE ROLE ${quoteIdentifier(connection.databaseType, userName)} LOGIN PASSWORD ${quoteSqlLiteral(password)}`
        )

        if (permissions.length) {
          const grantedTablePrivileges = permissions.filter((permission) =>
            ["SELECT", "INSERT", "UPDATE", "DELETE", "REFERENCES", "TRIGGER"].includes(permission)
          )

          if (permissions.includes("CONNECT")) {
            await client.query(
              `GRANT CONNECT ON DATABASE ${quoteIdentifier(
                connection.databaseType,
                targetDatabaseName
              )} TO ${quoteIdentifier(connection.databaseType, userName)}`
            )
          }

          if (permissions.includes("USAGE") || permissions.includes("CREATE")) {
            const schemaPrivileges = [
              permissions.includes("USAGE") ? "USAGE" : "",
              permissions.includes("CREATE") ? "CREATE" : "",
            ].filter(Boolean)

            if (schemaPrivileges.length) {
              await client.query(
                `GRANT ${schemaPrivileges.join(", ")} ON SCHEMA ${quoteIdentifier(
                  connection.databaseType,
                  targetSchemaName
                )} TO ${quoteIdentifier(connection.databaseType, userName)}`
              )
            }
          }

          if (grantedTablePrivileges.length) {
            const privilegeList = grantedTablePrivileges.join(", ")
            await client.query(
              `GRANT ${privilegeList} ON ALL TABLES IN SCHEMA ${quoteIdentifier(
                connection.databaseType,
                targetSchemaName
              )} TO ${quoteIdentifier(connection.databaseType, userName)}`
            )
            await client.query(
              `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quoteIdentifier(
                connection.databaseType,
                targetSchemaName
              )} GRANT ${privilegeList} ON TABLES TO ${quoteIdentifier(connection.databaseType, userName)}`
            )
          }
        }

        return {
          message: "Usuário criado com sucesso.",
          details: `O usuário ${userName} foi criado com permissões definidas.`,
          userName,
          databaseName: targetDatabaseName,
          schemaName: targetSchemaName,
        }
      })
    }

    case "sqlserver": {
      return withSqlServerPool(
        connection,
        targetDatabaseName || "master",
        async (pool) => {
          await pool.request().query(
            `CREATE LOGIN ${quoteSqlServerIdentifier(userName)} WITH PASSWORD = ${quoteSqlLiteral(password)}`
          )
          await pool.request().query(
            `USE ${quoteSqlServerIdentifier(targetDatabaseName || connection.databaseName.trim() || "master")}`
          )
          await pool.request().query(
            `CREATE USER ${quoteSqlServerIdentifier(userName)} FOR LOGIN ${quoteSqlServerIdentifier(userName)}`
          )

          const roleMap = new Map<string, string>([
            ["DB_DATAREADER", "db_datareader"],
            ["DB_DATAWRITER", "db_datawriter"],
            ["DB_DDLADMIN", "db_ddladmin"],
            ["DB_OWNER", "db_owner"],
          ])

          for (const permission of permissions) {
            const roleName = roleMap.get(permission)
            if (!roleName) {
              continue
            }

            await pool.request().query(
              `ALTER ROLE ${quoteSqlServerIdentifier(roleName)} ADD MEMBER ${quoteSqlServerIdentifier(userName)}`
            )
          }

          return {
            message: "Usuário criado com sucesso.",
            details: `O usuário ${userName} foi criado com permissões definidas.`,
            userName,
            databaseName: targetDatabaseName,
          }
        }
      )
    }

    case "sqlite":
      throw new Error("SQLite não suporta criação de usuários neste fluxo.")

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function createSequence(
  connection: SavedConnection,
  input: CreateSequenceInput
): Promise<CreateSequenceResult> {
  if (connection.databaseType !== "postgresql") {
    throw new Error("Sequences estão disponíveis apenas em conexões PostgreSQL.")
  }

  const databaseName = sanitizeDatabaseIdentifier(input.databaseName) || connection.databaseName.trim() || "postgres"
  const schemaName = sanitizeDatabaseIdentifier(input.schemaName) || getFallbackSchemaName(connection)
  const sequenceName = sanitizeDatabaseIdentifier(input.sequenceName)

  if (!sequenceName) {
    throw new Error("Informe um nome válido para a sequence.")
  }

  return withPostgresClient(connection, databaseName, async (client) => {
    const qualifiedSequence = `${quoteIdentifier("postgresql", schemaName)}.${quoteIdentifier(
      "postgresql",
      sequenceName
    )}`
    const options = [
      `START WITH ${normalizeSequenceInteger(input.startValue, "1")}`,
      `INCREMENT BY ${normalizeSequenceInteger(input.incrementBy, "1")}`,
      input.minValue?.trim() ? `MINVALUE ${normalizeSequenceInteger(input.minValue, "1")}` : "NO MINVALUE",
      input.maxValue?.trim() ? `MAXVALUE ${normalizeSequenceInteger(input.maxValue, "1")}` : "NO MAXVALUE",
      `CACHE ${normalizeSequenceInteger(input.cacheValue, "1")}`,
      input.cycle ? "CYCLE" : "NO CYCLE",
    ]

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier("postgresql", schemaName)}`)
    await client.query(`CREATE SEQUENCE IF NOT EXISTS ${qualifiedSequence}\n  ${options.join("\n  ")}`)

    return {
      message: "Sequence criada com sucesso.",
      details: `A sequence ${schemaName}.${sequenceName} foi criada no banco ${databaseName}.`,
      sequenceName,
      databaseName,
      schemaName,
    }
  })
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

export async function getViewDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  viewName: string
): Promise<ViewDetails> {
  const normalizedDatabase = sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim()
  const normalizedSchema = sanitizeDatabaseIdentifier(schemaName) || getFallbackSchemaName(connection)
  const normalizedView = sanitizeDatabaseIdentifier(viewName)

  if (!normalizedView) {
    throw new Error("Informe uma view válida.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb":
      return getMySqlLikeViewDetails(connection, normalizedDatabase, normalizedSchema, normalizedView)
    case "postgresql":
      return getPostgreSqlViewDetails(connection, normalizedDatabase, normalizedSchema, normalizedView)
    case "sqlserver":
      return getSqlServerViewDetails(connection, normalizedDatabase, normalizedSchema, normalizedView)
    case "sqlite":
      return getSqliteViewDetails(connection, normalizedView)
    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

export async function deleteView(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  viewName: string
): Promise<DeleteViewResult> {
  const normalizedDatabase = sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim()
  const normalizedSchema = sanitizeDatabaseIdentifier(schemaName) || getFallbackSchemaName(connection)
  const normalizedView = sanitizeDatabaseIdentifier(viewName)

  if (!normalizedView) {
    throw new Error("Informe uma view válida para excluir.")
  }

  switch (connection.databaseType) {
    case "mysql":
    case "mariadb": {
      return withMySqlLikeClient(connection, normalizedDatabase, async (client) => {
        await client.query(
          `DROP VIEW IF EXISTS ${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
            connection.databaseType,
            normalizedView
          )}`
        )

        return {
          message: "View excluída com sucesso.",
          details: `A view ${normalizedView} foi removida.`,
          viewName: normalizedView,
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
          `DROP VIEW IF EXISTS ${quoteIdentifier("postgresql", normalizedSchema)}.${quoteIdentifier(
            "postgresql",
            normalizedView
          )} CASCADE`
        )

        return {
          message: "View excluída com sucesso.",
          details: `A view ${normalizedView} foi removida.`,
          viewName: normalizedView,
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
          `DROP VIEW IF EXISTS ${quoteSqlServerIdentifier(normalizedSchema)}.${quoteSqlServerIdentifier(
            normalizedView
          )}`
        )

        return {
          message: "View excluída com sucesso.",
          details: `A view ${normalizedView} foi removida.`,
          viewName: normalizedView,
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
        db.exec(`DROP VIEW IF EXISTS ${quoteIdentifier("sqlite", normalizedView)}`)

        return {
          message: "View excluída com sucesso.",
          details: `A view ${normalizedView} foi removida.`,
          viewName: normalizedView,
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

export async function getRoutineDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  routineName: string,
  kind: RoutineKind
): Promise<RoutineDetails> {
  const normalizedDatabase = sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim()
  const normalizedSchema = sanitizeDatabaseIdentifier(schemaName) || getFallbackSchemaName(connection)
  const normalizedRoutine = sanitizeDatabaseIdentifier(routineName)

  if (!normalizedRoutine) {
    throw new Error("Informe uma rotina válida.")
  }

  if (connection.databaseType === "sqlite") {
    throw new Error("SQLite não oferece procedures ou funções armazenadas.")
  }

  if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
    return withMySqlLikeClient(connection, normalizedDatabase, async (client) => {
      const routineType = kind === "procedure" ? "PROCEDURE" : "FUNCTION"
      const rows = await runMySqlLikeMetadataQuery(
        client,
        connection.databaseType,
        `SHOW CREATE ${routineType} ${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
          connection.databaseType,
          normalizedRoutine
        )}`,
        []
      )
      const row = rows[0] ?? {}
      const sqlText = String(
        row[`Create ${kind === "procedure" ? "Procedure" : "Function"}`] ??
          row[`Create ${routineType}`] ??
          row["Create Procedure"] ??
          row["Create Function"] ??
          ""
      ).trim()

      if (!sqlText) {
        throw new Error("Não foi possível carregar a definição da rotina.")
      }

      return {
        databaseName: normalizedDatabase,
        schemaName: normalizedSchema,
        routineName: normalizedRoutine,
        kind,
        sqlText,
      }
    })
  }

  if (connection.databaseType === "postgresql") {
    return withPostgresClient(connection, normalizedDatabase || "postgres", async (client) => {
      const result = await client.query(
        `
          SELECT pg_get_functiondef(p.oid) AS definition
          FROM pg_proc p
          INNER JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = $1
            AND p.proname = $2
            AND p.prokind = $3
          ORDER BY p.oid
          LIMIT 1
        `,
        [normalizedSchema, normalizedRoutine, kind === "procedure" ? "p" : "f"]
      )
      const sqlText = String(result.rows[0]?.definition ?? "").trim()

      if (!sqlText) {
        throw new Error("Não foi possível carregar a definição da rotina.")
      }

      return {
        databaseName: normalizedDatabase,
        schemaName: normalizedSchema,
        routineName: normalizedRoutine,
        kind,
        sqlText,
      }
    })
  }

  if (connection.databaseType === "sqlserver") {
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
      const result = await pool.request().query(`
        SELECT OBJECT_DEFINITION(OBJECT_ID(${quoteSqlLiteral(
          `${normalizedSchema}.${normalizedRoutine}`
        )})) AS definition
      `)
      const sqlText = String(result.recordset?.[0]?.definition ?? "").trim()

      if (!sqlText) {
        throw new Error("Não foi possível carregar a definição da rotina.")
      }

      return {
        databaseName: normalizedDatabase,
        schemaName: normalizedSchema,
        routineName: normalizedRoutine,
        kind,
        sqlText,
      }
    } finally {
      await pool.close()
    }
  }

  throw new Error("Tipo de banco não suportado.")
}

export async function updateRoutine(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  routineName: string,
  kind: RoutineKind,
  sqlText: string
): Promise<RoutineDetails> {
  const normalizedDatabase = sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim()
  const normalizedSchema = sanitizeDatabaseIdentifier(schemaName) || getFallbackSchemaName(connection)
  const normalizedRoutine = sanitizeDatabaseIdentifier(routineName)
  const normalizedSql = sanitizeText(sqlText)

  if (!normalizedRoutine || !normalizedSql) {
    throw new Error("Informe a rotina e o SQL para salvar.")
  }

  if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
    return withMySqlLikeClient(connection, normalizedDatabase, async (client) => {
      await client.query(buildDropRoutineSql(connection.databaseType, normalizedSchema, normalizedRoutine, kind))
      await client.query(normalizedSql)
      return {
        databaseName: normalizedDatabase,
        schemaName: normalizedSchema,
        routineName: normalizedRoutine,
        kind,
        sqlText: normalizedSql,
      }
    })
  }

  await executeQuery(connection, normalizedSql, normalizedDatabase)

  return {
    databaseName: normalizedDatabase,
    schemaName: normalizedSchema,
    routineName: normalizedRoutine,
    kind,
    sqlText: normalizedSql,
  }
}

export async function deleteRoutine(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  routineName: string,
  kind: RoutineKind
): Promise<DeleteRoutineResult> {
  const normalizedDatabase = sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim()
  const normalizedSchema = sanitizeDatabaseIdentifier(schemaName) || getFallbackSchemaName(connection)
  const normalizedRoutine = sanitizeDatabaseIdentifier(routineName)

  if (!normalizedRoutine) {
    throw new Error("Informe uma rotina válida para excluir.")
  }

  if (connection.databaseType === "sqlite") {
    throw new Error("SQLite não oferece procedures ou funções armazenadas.")
  }

  await executeQuery(
    connection,
    buildDropRoutineSql(connection.databaseType, normalizedSchema, normalizedRoutine, kind),
    normalizedDatabase
  )

  return {
    message: `${kind === "procedure" ? "Procedure" : "Função"} excluída com sucesso.`,
    details: `A rotina ${normalizedRoutine} foi removida.`,
    routineName: normalizedRoutine,
    schemaName: normalizedSchema,
    kind,
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
  const normalizedForeignKeys = normalizeForeignKeysInput(input.foreignKeys, normalizedSchema)
  const normalizedColumns = input.columns
    .map((column) => ({
      sourceName: column.sourceName ? sanitizeDatabaseIdentifier(column.sourceName) || undefined : undefined,
      name: sanitizeDatabaseIdentifier(column.name),
      dataType: sanitizeText(column.dataType).toUpperCase(),
      size: sanitizeText(column.size),
      unsigned: Boolean((column as { unsigned?: boolean }).unsigned),
      notNull: Boolean(column.notNull || column.primaryKey),
      primaryKey: Boolean(column.primaryKey),
      unique: Boolean((column as { unique?: boolean }).unique),
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

  if (
    (connection.databaseType === "mysql" || connection.databaseType === "mariadb") &&
    normalizedForeignKeys.length
  ) {
    await assertMySqlForeignKeyCompatibility(
      connection,
      normalizedDatabase || connection.databaseName,
      normalizedSchema,
      normalizedColumns,
      normalizedForeignKeys
    )
  }

  const originalTableDetails = await getTableDetails(
    connection,
    normalizedDatabase,
    normalizedSchema,
    originalTableName
  )
  const normalizedIndexes = normalizeTableIndexesInput(
    input.indexes,
    nextTableName || originalTableName,
    originalTableDetails.indexes.map((index) => index.name)
  )
  const normalizedTriggers = normalizeTableTriggersInput(input.triggers)
  const normalizedFunctions = normalizeTableFunctionsInput(input.functions)
  const removedSequences = (input.removedSequences ?? [])
    .map((sequenceName) => sanitizeDatabaseIdentifier(sequenceName))
    .filter(Boolean)
  const originalPrimaryKey = originalTableDetails.indexes.find((index) => index.primaryKey)
  const desiredPrimaryKeyColumns = normalizedColumns
    .filter((column) => column.primaryKey)
    .map((column) => column.name.trim())
    .filter(Boolean)
  const primaryKeyChanged =
    !sameDbObjectList(originalPrimaryKey?.columns ?? [], desiredPrimaryKeyColumns)
  const originalIndexes = originalTableDetails.indexes.filter((index) => !index.primaryKey)
  const originalIndexMap = new Map(
    originalIndexes.map((index) => [index.name.trim().toLowerCase(), index] as const)
  )
  const indexesToAdd = normalizedIndexes.filter((index) => {
    const originalIndex = originalIndexMap.get(index.name.trim().toLowerCase())

    if (!originalIndex) {
      return true
    }

    return (
      originalIndex.unique !== index.unique ||
      JSON.stringify(originalIndex.columns.map((column) => column.trim().toLowerCase())) !==
        JSON.stringify(index.columns.map((column) => column.trim().toLowerCase()))
    )
  })
  const indexesToDrop = originalTableDetails.indexes.filter(
    (index) =>
      !index.primaryKey &&
      !normalizedIndexes.some((nextIndex) => {
        if (nextIndex.name.trim().toLowerCase() !== index.name.trim().toLowerCase()) {
          return false
        }

        return (
          nextIndex.unique === index.unique &&
          JSON.stringify(nextIndex.columns.map((column) => column.trim().toLowerCase())) ===
            JSON.stringify(index.columns.map((column) => column.trim().toLowerCase()))
        )
      })
  )
  const originalColumnsByName = new Map(
    originalTableDetails.columns.map((column) => [normalizeDbObjectKey(column.name), column] as const)
  )
  const seenColumns = new Set<string>()
  const originalForeignKeys = originalTableDetails.foreignKeys
    .map((foreignKey) => parseForeignKeySummary(foreignKey, normalizedSchema))
    .filter(
      (
        foreignKey
      ): foreignKey is CreateTableForeignKeySpec & {
        constraintName?: string
      } => Boolean(foreignKey)
    )
  const originalForeignKeyKeys = buildForeignKeyComparisonKeys(originalForeignKeys, normalizedSchema)
  const nextForeignKeyKeys = buildForeignKeyComparisonKeys(normalizedForeignKeys, normalizedSchema)
  const originalForeignKeyKeySet = new Set(originalForeignKeyKeys)
  const nextForeignKeyKeySet = new Set(nextForeignKeyKeys)
  const foreignKeysToDrop = originalForeignKeys.filter(
    (foreignKey) => !nextForeignKeyKeySet.has(buildForeignKeyComparisonKey(foreignKey, normalizedSchema))
  )
  const foreignKeysToAdd = normalizedForeignKeys
    .map((foreignKey, index) => ({ foreignKey, index }))
    .filter(
      ({ foreignKey }) =>
        !originalForeignKeyKeySet.has(buildForeignKeyComparisonKey(foreignKey, normalizedSchema))
    )
  const modifiedColumns = normalizedColumns.filter((column) => {
    const sourceName = (column.sourceName || "").trim()

    if (!sourceName) {
      return false
    }

    const original = originalColumnsByName.get(normalizeDbObjectKey(sourceName))
    if (!original) {
      return false
    }

    seenColumns.add(normalizeDbObjectKey(sourceName))

    return (
      column.name.trim() !== original.name.trim() ||
      column.dataType.trim().toUpperCase() !== original.dataType.trim().toUpperCase() ||
      column.size.trim() !== original.size.trim() ||
      Boolean(column.unsigned) !== Boolean(original.unsigned) ||
      column.notNull !== original.notNull ||
      column.primaryKey !== original.primaryKey ||
      Boolean(column.unique) !== Boolean(original.unique) ||
      column.autoIncrement !== original.autoIncrement ||
      column.defaultValue.trim() !== original.defaultValue.trim() ||
      column.comment.trim() !== original.comment.trim()
    )
  })
  const removedColumns = originalTableDetails.columns.filter(
    (column) => !seenColumns.has(normalizeDbObjectKey(column.name))
  )
  const foreignKeyChanged =
    originalForeignKeyKeys.length !== nextForeignKeyKeys.length ||
    originalForeignKeyKeys.some((key, index) => key !== nextForeignKeyKeys[index])
  const isMySqlLike = connection.databaseType === "mysql" || connection.databaseType === "mariadb"
  const foreignKeyCanAlter = isMySqlLike && removedColumns.length === 0
  const sqlServerModifiedColumnsRequireRebuild =
    connection.databaseType === "sqlserver" &&
    modifiedColumns.some((column) => {
      const original = originalColumnsByName.get(normalizeDbObjectKey(column.sourceName || ""))
      return !original || !isSqlServerColumnAlterInPlaceSupported(column, original)
    })
  const postgreSqlModifiedColumnsRequireRebuild =
    connection.databaseType === "postgresql" &&
    modifiedColumns.some((column) => {
      const original = originalColumnsByName.get(normalizeDbObjectKey(column.sourceName || ""))
      return !original || !isPostgreSqlColumnAlterInPlaceSupported(column, original)
    })
  const requiresRebuild =
    !isMySqlLike &&
    connection.databaseType !== "sqlserver" &&
    ((connection.databaseType === "sqlite" && removedColumns.length > 0) ||
      postgreSqlModifiedColumnsRequireRebuild ||
      sqlServerModifiedColumnsRequireRebuild ||
      (foreignKeyChanged && !foreignKeyCanAlter))

  const hasTableNameChange = nextTableName !== originalTableName
  const hasCommentChange = input.comment.trim() !== originalTableDetails.comment.trim()
  const addedColumns = normalizedColumns.filter((column) => !column.sourceName)
  const triggerTargetTableName = hasTableNameChange ? nextTableName : originalTableName

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

          if ((foreignKeyChanged || modifiedColumns.length) && originalForeignKeys.length) {
            for (const foreignKey of originalForeignKeys) {
              const constraintName =
                foreignKey.constraintName ||
                buildForeignKeyConstraintName(connection, originalTableName, foreignKey, 0)
              await client.query(
                buildMySqlLikeDropForeignKeySql(
                  connection,
                  normalizedSchema,
                  originalTableName,
                  constraintName
                )
              )
            }
          }

          for (const column of removedColumns) {
            await client.query(
              `ALTER TABLE ${qualifiedOriginal} DROP COLUMN ${quoteIdentifier(
                connection.databaseType,
                column.name
              )}`
            )
          }

          for (const column of modifiedColumns) {
            const sourceName = (column.sourceName || "").trim()
            const definition = buildCreateTableColumnDefinition(connection, column)

            if (sourceName && sourceName !== column.name.trim()) {
              await client.query(
                `ALTER TABLE ${qualifiedOriginal} CHANGE COLUMN ${quoteIdentifier(
                  connection.databaseType,
                  sourceName
                )} ${definition}`
              )
            } else {
              await client.query(`ALTER TABLE ${qualifiedOriginal} MODIFY COLUMN ${definition}`)
            }
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

          for (const index of indexesToDrop) {
            await client.query(
              buildDropTableIndexSql(connection, normalizedSchema, originalTableName, index.name)
            )
          }

          for (const sequenceName of removedSequences) {
            const sequence = originalTableDetails.sequences.find(
              (item) => item.name.trim().toLowerCase() === sequenceName.trim().toLowerCase()
            )

            if (sequence?.columnName) {
              await client.query(
                `ALTER TABLE ${qualifiedOriginal} ALTER COLUMN ${quoteIdentifier(
                  "postgresql",
                  sequence.columnName
                )} DROP DEFAULT`
              )
            }

            await client.query(
              `DROP SEQUENCE IF EXISTS ${quoteIdentifier("postgresql", normalizedSchema)}.${quoteIdentifier(
                "postgresql",
                sequenceName
              )}`
            )
          }

          for (const index of indexesToAdd) {
            await client.query(
              buildCreateTableIndexDefinition(connection, originalTableName, index, 0, normalizedSchema)
            )
          }

          for (const trigger of originalTableDetails.triggers) {
            await client.query(
              buildDropTableTriggerSql(
                connection,
                normalizedSchema,
                originalTableName,
                trigger.name
              )
            )
          }

          if (
            foreignKeyCanAlter &&
            normalizedForeignKeys.length &&
            (foreignKeyChanged || modifiedColumns.length)
          ) {
            for (let index = 0; index < normalizedForeignKeys.length; index += 1) {
              const foreignKey = normalizedForeignKeys[index]
              await client.query(
                `ALTER TABLE ${qualifiedOriginal} ADD ${buildCreateTableForeignKeyDefinition(
                  connection,
                  originalTableName,
                  foreignKey,
                  index,
                  normalizedSchema
                )}`
              )
            }
          }

          if (hasTableNameChange) {
            await client.query(`RENAME TABLE ${qualifiedOriginal} TO ${qualifiedNext}`)
          }

          for (const trigger of normalizedTriggers) {
            await client.query(
              buildCreateTableTriggerDefinition(
                connection,
                triggerTargetTableName,
                trigger,
                normalizedSchema
              )
            )
          }

          for (const item of normalizedFunctions) {
            await client.query(buildCreateTableFunctionDefinition(connection, normalizedSchema, item))
          }

          return {
            message: "Tabela atualizada com sucesso.",
            details:
              hasTableNameChange && !hasCommentChange && !addedColumns.length && !modifiedColumns.length
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

          for (const column of modifiedColumns) {
            if ((column.sourceName || "").trim() && column.name.trim() !== (column.sourceName || "").trim()) {
              await client.query(
                `ALTER TABLE ${qualifiedOriginal} RENAME COLUMN ${quoteIdentifier(
                  "postgresql",
                  column.sourceName || column.name
                )} TO ${quoteIdentifier("postgresql", column.name)}`
              )
            }

            const original = originalColumnsByName.get(normalizeDbObjectKey(column.sourceName || column.name))

            if (!original) {
              continue
            }

            for (const statement of buildPostgreSqlAlterColumnStatements(
              qualifiedOriginal,
              normalizedSchema,
              originalTableName,
              column,
              original
            )) {
              await client.query(statement)
            }
          }

          for (const column of addedColumns) {
            if (column.autoIncrement) {
              for (const statement of buildPostgreSqlAddAutoIncrementColumnStatements(
                connection,
                qualifiedOriginal,
                normalizedSchema,
                originalTableName,
                column
              )) {
                await client.query(statement)
              }
              continue
            }

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

          for (const index of indexesToDrop) {
            await client.query(
              buildDropTableIndexSql(connection, normalizedSchema, originalTableName, index.name)
            )
          }

          for (const index of indexesToAdd) {
            await client.query(
              buildCreateTableIndexDefinition(connection, originalTableName, index, 0, normalizedSchema)
            )
          }

          for (const trigger of originalTableDetails.triggers) {
            await client.query(
              buildDropTableTriggerSql(
                connection,
                normalizedSchema,
                originalTableName,
                trigger.name
              )
            )
          }

          if (hasTableNameChange) {
            await client.query(`ALTER TABLE ${qualifiedOriginal} RENAME TO ${quotedNextTableName}`)
          }

          for (const trigger of normalizedTriggers) {
            await client.query(
              buildCreateTableTriggerDefinition(
                connection,
                triggerTargetTableName,
                trigger,
                normalizedSchema
              )
            )
          }

          for (const item of normalizedFunctions) {
            await client.query(buildCreateTableFunctionDefinition(connection, normalizedSchema, item))
          }

          return {
            message: "Tabela atualizada com sucesso.",
            details:
              hasTableNameChange && !hasCommentChange && !addedColumns.length && !modifiedColumns.length
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
          const modifiedColumnNameMap = new Map(
            modifiedColumns
              .map((column) => [normalizeDbObjectKey(column.sourceName || ""), column.name.trim()] as const)
              .filter(([sourceName, nextName]) => Boolean(sourceName && nextName))
          )
          const modifiedSourceColumnNames = new Set(modifiedColumnNameMap.keys())
          const affectedOriginalIndexes = originalTableDetails.indexes.filter((index) =>
            (!index.primaryKey || !primaryKeyChanged) &&
            index.columns.some((columnName) => modifiedSourceColumnNames.has(normalizeDbObjectKey(columnName)))
          )
          const affectedOriginalIndexNames = new Set(
            affectedOriginalIndexes.map((index) => index.name.trim().toLowerCase())
          )
          const affectedOriginalForeignKeys = originalForeignKeys.filter((foreignKey) =>
            modifiedSourceColumnNames.has(normalizeDbObjectKey(foreignKey.sourceColumn))
          )
          const foreignKeysToDropByKey = new Map<
            string,
            CreateTableForeignKeySpec & { constraintName?: string }
          >()

          for (const foreignKey of [...foreignKeysToDrop, ...affectedOriginalForeignKeys]) {
            const key =
              foreignKey.constraintName?.trim() ||
              buildForeignKeyComparisonKey(foreignKey, normalizedSchema)
            foreignKeysToDropByKey.set(key, foreignKey)
          }

          for (const foreignKey of foreignKeysToDropByKey.values()) {
            const constraintName =
              foreignKey.constraintName ||
              buildForeignKeyConstraintName(connection, originalTableName, foreignKey, 0)

            await pool.request().query(
              `ALTER TABLE ${qualifiedOriginal} DROP CONSTRAINT ${quoteSqlServerConstraintIdentifier(
                constraintName
              )}`
            )
          }

          if (primaryKeyChanged && originalPrimaryKey) {
            await pool.request().query(
              `ALTER TABLE ${qualifiedOriginal} DROP CONSTRAINT ${quoteSqlServerIdentifier(
                originalPrimaryKey.name
              )}`
            )
          }

          for (const index of affectedOriginalIndexes) {
            if (index.primaryKey) {
              await pool.request().query(
                `ALTER TABLE ${qualifiedOriginal} DROP CONSTRAINT ${quoteSqlServerIdentifier(index.name)}`
              )
            } else {
              await pool.request().query(
                buildDropTableIndexSql(connection, normalizedSchema, originalTableName, index.name)
              )
            }
          }

          if (removedColumns.length) {
            await pool
              .request()
              .query(
                `ALTER TABLE ${qualifiedOriginal} DROP COLUMN ${removedColumns
                  .map((column) => quoteSqlServerIdentifier(column.name))
                  .join(", ")}`
              )
          }

          for (const column of modifiedColumns) {
            const sourceName = (column.sourceName || "").trim()

            if (sourceName && sourceName !== column.name.trim()) {
              await pool.request().query(
                `EXEC sp_rename ${quoteSqlLiteral(
                  `${normalizedSchema}.${originalTableName}.${sourceName}`
                )}, ${quoteSqlLiteral(column.name.trim())}, 'COLUMN'`
              )
            }

            await pool.request().query(
              buildSqlServerDropDefaultConstraintSql(qualifiedOriginal, sourceName || column.name.trim())
            )

            await pool.request().query(
              `ALTER TABLE ${qualifiedOriginal} ALTER COLUMN ${buildSqlServerAlterColumnDefinition(connection, column)}`
            )
          }

          for (const column of addedColumns) {
            await pool.request().query(
              `ALTER TABLE ${qualifiedOriginal} ADD ${buildCreateTableColumnDefinition(connection, column)}`
            )
          }

          for (const index of indexesToDrop) {
            if (affectedOriginalIndexNames.has(index.name.trim().toLowerCase())) {
              continue
            }

            await pool.request().query(
              buildDropTableIndexSql(connection, normalizedSchema, originalTableName, index.name)
            )
          }

          for (const foreignKey of affectedOriginalForeignKeys) {
            const nextSourceColumn =
              modifiedColumnNameMap.get(normalizeDbObjectKey(foreignKey.sourceColumn)) ??
              foreignKey.sourceColumn
            const nextForeignKey = normalizedForeignKeys.find(
              (item) =>
                item.sourceColumn.trim().toLowerCase() === nextSourceColumn.trim().toLowerCase() &&
                item.referencedSchemaName?.trim().toLowerCase() ===
                  foreignKey.referencedSchemaName?.trim().toLowerCase() &&
                item.referencedTableName.trim().toLowerCase() ===
                  foreignKey.referencedTableName.trim().toLowerCase() &&
                item.referencedColumnName.trim().toLowerCase() ===
                  foreignKey.referencedColumnName.trim().toLowerCase()
            )

            if (nextForeignKey) {
              await pool.request().query(
                `ALTER TABLE ${qualifiedOriginal} ADD ${buildCreateTableForeignKeyDefinition(
                  connection,
                  originalTableName,
                  nextForeignKey,
                  0,
                  normalizedSchema
                )}`
              )
            }
          }

          const addedForeignKeyKeys = new Set(
            affectedOriginalForeignKeys.map((foreignKey) => {
              const nextSourceColumn =
                modifiedColumnNameMap.get(normalizeDbObjectKey(foreignKey.sourceColumn)) ??
                foreignKey.sourceColumn
              const nextForeignKey = normalizedForeignKeys.find(
                (item) =>
                  item.sourceColumn.trim().toLowerCase() === nextSourceColumn.trim().toLowerCase() &&
                  item.referencedSchemaName?.trim().toLowerCase() ===
                    foreignKey.referencedSchemaName?.trim().toLowerCase() &&
                  item.referencedTableName.trim().toLowerCase() ===
                    foreignKey.referencedTableName.trim().toLowerCase() &&
                  item.referencedColumnName.trim().toLowerCase() ===
                    foreignKey.referencedColumnName.trim().toLowerCase()
              )

              return nextForeignKey ? buildForeignKeyComparisonKey(nextForeignKey, normalizedSchema) : ""
            })
          )

          for (const { foreignKey, index } of foreignKeysToAdd) {
            const key = buildForeignKeyComparisonKey(foreignKey, normalizedSchema)

            if (addedForeignKeyKeys.has(key)) {
              continue
            }

            await pool.request().query(
              `ALTER TABLE ${qualifiedOriginal} ADD ${buildCreateTableForeignKeyDefinition(
                connection,
                originalTableName,
                foreignKey,
                index,
                normalizedSchema
              )}`
            )
            addedForeignKeyKeys.add(key)
          }

          for (const index of affectedOriginalIndexes) {
            const indexName = index.name.trim().toLowerCase()

            if (indexesToDrop.some((item) => item.name.trim().toLowerCase() === indexName)) {
              continue
            }

            if (indexesToAdd.some((item) => item.name.trim().toLowerCase() === indexName)) {
              continue
            }

            const nextColumns = index.columns.map(
              (columnName) => modifiedColumnNameMap.get(normalizeDbObjectKey(columnName)) ?? columnName
            )

            if (index.primaryKey) {
              await pool.request().query(
                buildSqlServerPrimaryKeyConstraintSql(
                  index.name,
                  qualifiedOriginal,
                  nextColumns,
                  index.sqlServerIndexType
                )
              )
            } else {
              await pool.request().query(
                buildCreateTableIndexDefinition(
                  connection,
                  originalTableName,
                  {
                    name: index.name,
                    columns: nextColumns,
                    unique: index.unique,
                    sqlServerIndexType: index.sqlServerIndexType,
                  },
                  0,
                  normalizedSchema
                )
              )
            }
          }

          if (primaryKeyChanged && desiredPrimaryKeyColumns.length) {
            await pool.request().query(
              buildSqlServerPrimaryKeyConstraintSql(
                originalPrimaryKey?.name || buildPrimaryKeyConstraintName(originalTableName),
                qualifiedOriginal,
                desiredPrimaryKeyColumns,
                originalPrimaryKey?.sqlServerIndexType || "CLUSTERED"
              )
            )
          }

          for (const index of indexesToAdd) {
            await pool.request().query(
              buildCreateTableIndexDefinition(connection, originalTableName, index, 0, normalizedSchema)
            )
          }

          for (const trigger of originalTableDetails.triggers) {
            await pool.request().query(
              buildDropTableTriggerSql(
                connection,
                normalizedSchema,
                originalTableName,
                trigger.name
              )
            )
          }

          if (hasTableNameChange) {
            await pool.request().query(
              `EXEC sp_rename ${quoteSqlLiteral(`${normalizedSchema}.${originalTableName}`)}, ${quoteSqlLiteral(
                nextTableName
              )}`
            )
          }

          for (const trigger of normalizedTriggers) {
            await pool.request().query(
              buildCreateTableTriggerDefinition(
                connection,
                triggerTargetTableName,
                trigger,
                normalizedSchema
              )
            )
          }

          for (const item of normalizedFunctions) {
            await pool.request().query(buildCreateTableFunctionDefinition(connection, normalizedSchema, item))
          }

          return {
            message: "Tabela atualizada com sucesso.",
            details:
              hasTableNameChange && !addedColumns.length && !modifiedColumns.length
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

          for (const index of indexesToDrop) {
            db.exec(buildDropTableIndexSql(connection, "main", originalTableName, index.name))
          }

          for (const index of indexesToAdd) {
            db.exec(buildCreateTableIndexDefinition(connection, originalTableName, index, 0, "main"))
          }

          for (const trigger of originalTableDetails.triggers) {
            db.exec(buildDropTableTriggerSql(connection, "main", originalTableName, trigger.name))
          }

          if (hasTableNameChange) {
            db.exec(`ALTER TABLE ${qualifiedOriginal} RENAME TO ${quoteIdentifier("sqlite", nextTableName)}`)
          }

          for (const trigger of normalizedTriggers) {
            db.exec(buildCreateTableTriggerDefinition(connection, triggerTargetTableName, trigger, "main"))
          }

          for (const item of normalizedFunctions) {
            db.exec(buildCreateTableFunctionDefinition(connection, "main", item))
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
          normalizedColumns,
          normalizedForeignKeys,
          normalizedIndexes,
          normalizedTriggers,
          normalizedFunctions
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

        for (const statement of buildMySqlLikeAddForeignKeySql(
          connection,
          normalizedSchema,
          tempTableName,
          normalizedForeignKeys
        )) {
          await client.query(statement)
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

        for (const trigger of normalizedTriggers) {
          await client.query(
            buildCreateTableTriggerDefinition(
              connection,
              triggerTargetTableName,
              trigger,
              normalizedSchema
            )
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

        await createPostgreSqlTable(
          connection,
          normalizedDatabase || connection.databaseName.trim() || "postgres",
          normalizedSchema,
          tempTableName,
          input.comment,
          normalizedColumns,
          normalizedForeignKeys,
          normalizedIndexes,
          normalizedTriggers,
          normalizedFunctions
        )

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

        for (const sequenceName of removedSequences) {
          await client.query(
            `DROP SEQUENCE IF EXISTS ${quoteIdentifier("postgresql", normalizedSchema)}.${quoteIdentifier(
              "postgresql",
              sequenceName
            )}`
          )
        }

        await client.query(
          `ALTER TABLE ${qualifiedTemp} RENAME TO ${quoteIdentifier("postgresql", nextTableName)}`
        )

        for (const trigger of normalizedTriggers) {
          await client.query(
            buildCreateTableTriggerDefinition(connection, triggerTargetTableName, trigger, normalizedSchema)
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
          normalizedColumns,
          normalizedForeignKeys,
          normalizedIndexes,
          normalizedTriggers,
          normalizedFunctions
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

        for (const trigger of normalizedTriggers) {
          await pool.request().query(
            buildCreateTableTriggerDefinition(connection, triggerTargetTableName, trigger, normalizedSchema)
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

    case "sqlite": {
      return withSqliteDatabase(connection, async (db) => {
        const tempTableName = `${originalTableName}__forge_tmp_${randomUUID().replace(/-/g, "").slice(0, 10)}`
        const qualifiedOriginal = quoteIdentifier("sqlite", originalTableName)
        const qualifiedTemp = quoteIdentifier("sqlite", tempTableName)

        await createSqliteTable(
          connection,
          tempTableName,
          input.comment,
          normalizedColumns,
          normalizedForeignKeys,
          normalizedIndexes,
          normalizedTriggers,
          normalizedFunctions
        )

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

        for (const trigger of normalizedTriggers) {
          db.exec(buildCreateTableTriggerDefinition(connection, triggerTargetTableName, trigger, "main"))
        }

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
        const sequenceResult = await client.query(
          `
            SELECT DISTINCT sequence_schema AS schema_name, sequence_name AS name
            FROM (
              SELECT seq_ns.nspname AS sequence_schema, seq.relname AS sequence_name
              FROM pg_class tbl
              INNER JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
              INNER JOIN pg_attribute col ON col.attrelid = tbl.oid
              INNER JOIN pg_depend dep
                ON dep.refobjid = tbl.oid
               AND dep.refobjsubid = col.attnum
               AND dep.deptype IN ('a', 'i')
              INNER JOIN pg_class seq
                ON seq.oid = dep.objid
               AND seq.relkind = 'S'
              INNER JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
              WHERE ns.nspname = $1
                AND tbl.relname = $2
              UNION
              SELECT seq_ns.nspname AS sequence_schema, seq.relname AS sequence_name
              FROM pg_class tbl
              INNER JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
              INNER JOIN pg_attribute col ON col.attrelid = tbl.oid
              INNER JOIN pg_attrdef def ON def.adrelid = tbl.oid AND def.adnum = col.attnum
              INNER JOIN pg_depend dep
                ON dep.classid = 'pg_attrdef'::regclass
               AND dep.objid = def.oid
               AND dep.refclassid = 'pg_class'::regclass
              INNER JOIN pg_class seq
                ON seq.oid = dep.refobjid
               AND seq.relkind = 'S'
              INNER JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
              WHERE ns.nspname = $1
                AND tbl.relname = $2
                AND col.attnum > 0
                AND NOT col.attisdropped
              UNION
              SELECT ns.nspname AS sequence_schema, seq.relname AS sequence_name
              FROM pg_class seq
              INNER JOIN pg_namespace ns ON ns.oid = seq.relnamespace
              WHERE ns.nspname = $1
                AND seq.relkind = 'S'
                AND seq.relname LIKE $2 || '\\_%\\_seq' ESCAPE '\\'
            ) sequences
            WHERE sequence_name IS NOT NULL
              AND sequence_name <> ''
          `,
          [normalizedSchema, normalizedTable]
        )
        const sequences = (sequenceResult.rows as Array<Record<string, unknown>>)
          .map((row) => ({
            schemaName: String(row.schema_name ?? "").trim() || normalizedSchema,
            name: String(row.name ?? "").trim(),
          }))
          .filter((sequence) => sequence.name)

        await client.query(
          `DROP TABLE IF EXISTS ${quoteIdentifier("postgresql", normalizedSchema)}.${quoteIdentifier(
            "postgresql",
            normalizedTable
          )} CASCADE`
        )

        for (const sequence of sequences) {
          await client.query(
            `DROP SEQUENCE IF EXISTS ${quoteIdentifier("postgresql", sequence.schemaName)}.${quoteIdentifier(
              "postgresql",
              sequence.name
            )}`
          )
        }

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

function normalizeForeignKeysInput(
  foreignKeys: Array<CreateTableForeignKeyInput | undefined> | undefined,
  defaultSchemaName: string
): CreateTableForeignKeySpec[] {
  return (foreignKeys ?? [])
    .map((foreignKey) => ({
      sourceColumn: sanitizeDatabaseIdentifier(foreignKey?.sourceColumn),
      referencedSchemaName:
        sanitizeDatabaseIdentifier(foreignKey?.referencedSchemaName) || defaultSchemaName,
      referencedTableName: sanitizeDatabaseIdentifier(foreignKey?.referencedTableName),
      referencedColumnName: sanitizeDatabaseIdentifier(foreignKey?.referencedColumnName),
      onDelete: normalizeForeignKeyAction(foreignKey?.onDelete),
      onUpdate: normalizeForeignKeyAction(foreignKey?.onUpdate),
    }))
    .filter(
      (foreignKey) =>
        foreignKey.sourceColumn && foreignKey.referencedTableName && foreignKey.referencedColumnName
    )
}

function normalizeTableIndexesInput(
  indexes: Array<CreateTableIndexInput | undefined> | undefined,
  tableName: string,
  existingIndexNames: Array<string> = []
): CreateTableIndexSpec[] {
  const usedNames = new Set(existingIndexNames.map((name) => name.trim().toLowerCase()).filter(Boolean))
  const normalized: CreateTableIndexSpec[] = []

  for (const [indexNumber, index] of (indexes ?? []).entries()) {
    const columns = (index?.columns ?? [])
      .map((columnName) => sanitizeDatabaseIdentifier(columnName))
      .filter(Boolean)

    if (!columns.length || index?.primaryKey) {
      continue
    }

    const providedName = sanitizeDatabaseIdentifier(index?.name)
    const generatedName = buildTableIndexName(tableName, columns, indexNumber)
    let name = providedName || generatedName

    if (!providedName) {
      let suffix = 2
      while (usedNames.has(name.trim().toLowerCase())) {
        name = `${generatedName}_${suffix}`
        suffix += 1
      }
    }

    usedNames.add(name.trim().toLowerCase())
    normalized.push({
      name,
      columns,
      unique: Boolean(index?.unique),
    })
  }

  return normalized
}

function normalizeTableTriggersInput(
  triggers: Array<CreateTableTriggerInput | undefined> | undefined
): CreateTableTriggerSpec[] {
  return (triggers ?? [])
    .map((trigger) => ({
      name: sanitizeDatabaseIdentifier(trigger?.name),
      description: sanitizeSqlExpression(trigger?.description),
      timing: sanitizeText(trigger?.timing).trim().toUpperCase(),
      event: sanitizeText(trigger?.event).trim().toUpperCase(),
      body: sanitizeSqlExpression(trigger?.body),
    }))
    .filter(
      (trigger) =>
        trigger.name && trigger.description !== undefined && trigger.timing && trigger.event && trigger.body
    )
}

function normalizeTableFunctionsInput(
  functions: Array<CreateTableFunctionInput | undefined> | undefined
): CreateTableFunctionSpec[] {
  return (functions ?? [])
    .map((item) => ({
      name: sanitizeDatabaseIdentifier(item?.name),
      description: sanitizeSqlExpression(item?.description),
      parameters: sanitizeSqlExpression(item?.parameters),
      returnType: sanitizeSqlType(item?.returnType),
      body: sanitizeSqlExpression(item?.body),
    }))
    .filter((item) => item.name && item.returnType && item.body)
}

function extractTriggerPayloadFromDefinition(
  definition: string,
  functionDefinition?: string
): {
  description: string
  body: string
  timing: string
  event: string
} {
  const source = `${functionDefinition ?? ""}\n${definition}`.trim()
  const timingEventMatch = source.match(/\b(BEFORE|AFTER|INSTEAD OF)\s+(INSERT|UPDATE|DELETE)\b/i)
  const bodyMatch =
    source.match(/\bBEGIN\b([\s\S]*?)\bRETURN\s+(?:NEW|OLD);\s*\bEND\b/i) ??
    source.match(/\bBEGIN\b([\s\S]*?)\bEND\b/i)
  const rawBody = (bodyMatch?.[1] ?? "").trim()
  const lines = rawBody.split(/\r?\n/)
  const firstLine = lines[0]?.trim() ?? ""
  let description = ""
  let bodyLines = lines

  if (firstLine.startsWith("--")) {
    description = firstLine.replace(/^--\s*/, "").trim()
    bodyLines = lines.slice(1)
  }

  const body = bodyLines.map((line) => line.trimEnd()).join("\n").trim()

  return {
    description,
    body,
    timing: timingEventMatch?.[1]?.trim().toUpperCase() ?? "",
    event: timingEventMatch?.[2]?.trim().toUpperCase() ?? "",
  }
}

function normalizeForeignKeyAction(value?: string) {
  const normalized = sanitizeText(value).toUpperCase()
  return ["CASCADE", "RESTRICT", "NO ACTION", "SET NULL", "SET DEFAULT"].includes(normalized)
    ? normalized
    : ""
}

function normalizeMySqlForeignKeyType(dataType: string) {
  switch (sanitizeText(dataType).trim().toUpperCase()) {
    case "INTEGER":
      return "INT"
    case "NUMERIC":
      return "DECIMAL"
    default:
      return sanitizeText(dataType).trim().toUpperCase()
  }
}

function formatColumnTypeForError(column: { dataType: string; size: string; unsigned?: boolean }) {
  const dataType = normalizeMySqlForeignKeyType(column.dataType)
  const size = sanitizeText(column.size).trim()
  const unsigned = Boolean(column.unsigned)

  return `${size ? `${dataType}(${size})` : dataType}${unsigned ? " UNSIGNED" : ""}`
}

function normalizeSqlServerReferentialAction(value: unknown) {
  const action = String(value ?? "").trim().replace(/_/g, " ").toUpperCase()

  if (!action || action === "NO ACTION") {
    return ""
  }

  return normalizeForeignKeyAction(action)
}

async function assertMySqlForeignKeyCompatibility(
  connection: SavedConnection,
  databaseName: string,
  defaultSchemaName: string,
  sourceColumns: Array<{ name: string; dataType: string; size: string; unsigned?: boolean }>,
  foreignKeys: CreateTableForeignKeySpec[]
) {
  const sourceColumnsByName = new Map(
    sourceColumns.map((column) => [column.name.trim().toLowerCase(), column] as const)
  )
  const referencedTableCache = new Map<string, TableDetails>()

  for (const foreignKey of foreignKeys) {
    const sourceColumn = sourceColumnsByName.get(foreignKey.sourceColumn.trim().toLowerCase())

    if (!sourceColumn) {
      continue
    }

    const referencedSchemaName = foreignKey.referencedSchemaName?.trim() || defaultSchemaName
    const cacheKey = `${referencedSchemaName.toLowerCase()}::${foreignKey.referencedTableName.trim().toLowerCase()}`

    let referencedTable = referencedTableCache.get(cacheKey)
    if (!referencedTable) {
      referencedTable = await getTableDetails(
        connection,
        databaseName,
        referencedSchemaName,
        foreignKey.referencedTableName
      )
      referencedTableCache.set(cacheKey, referencedTable)
    }

    const referencedColumn = referencedTable.columns.find(
      (column) => column.name.trim().toLowerCase() === foreignKey.referencedColumnName.trim().toLowerCase()
    )

    if (!referencedColumn) {
      continue
    }

    const sourceType = normalizeMySqlForeignKeyType(sourceColumn.dataType)
    const referencedType = normalizeMySqlForeignKeyType(referencedColumn.dataType)
    const sourceUnsigned = Boolean(sourceColumn.unsigned)
    const referencedUnsigned = Boolean(referencedColumn.unsigned)

    if (sourceType !== referencedType || sourceUnsigned !== referencedUnsigned) {
      throw new Error(
        `A chave estrangeira ${sourceColumn.name} -> ${referencedTable.tableName}.${referencedColumn.name} não pode ser criada porque ${formatColumnTypeForError(sourceColumn)} é incompatível com ${formatColumnTypeForError(referencedColumn)}.`
      )
    }
  }
}

function parseForeignKeySummary(
  value: string,
  defaultSchemaName: string
): (CreateTableForeignKeySpec & { constraintName?: string }) | null {
  const match = value.trim().match(/^(?:(.+?):\s*)?(.+?)\s*->\s*(.+)$/)

  if (!match) {
    return null
  }

  const referencedWithActions = match[3].trim()
  const actionIndex = referencedWithActions.search(/\s+ON\s+(DELETE|UPDATE)\s+/i)
  const referenced = (actionIndex >= 0 ? referencedWithActions.slice(0, actionIndex) : referencedWithActions).trim()
  const actions = actionIndex >= 0 ? referencedWithActions.slice(actionIndex).trim() : ""
  const referencedParts = referenced.split(".").map((part) => part.trim()).filter(Boolean)
  const referencedColumnName = referencedParts.pop() ?? ""
  const referencedTableName = referencedParts.pop() ?? referenced
  const referencedSchemaName = referencedParts.pop() ?? defaultSchemaName
  const deleteMatch = actions.match(/\bON DELETE\s+(.+?)(?=\s+ON UPDATE\s+|$)/i)
  const updateMatch = actions.match(/\bON UPDATE\s+(.+)$/i)

  return {
    constraintName: match[1]?.trim() ?? "",
    sourceColumn: sanitizeDatabaseIdentifier(match[2]),
    referencedSchemaName: sanitizeDatabaseIdentifier(referencedSchemaName) || defaultSchemaName,
    referencedTableName: sanitizeDatabaseIdentifier(referencedTableName),
    referencedColumnName: sanitizeDatabaseIdentifier(referencedColumnName),
    onDelete: normalizeForeignKeyAction(deleteMatch?.[1]),
    onUpdate: normalizeForeignKeyAction(updateMatch?.[1]),
  }
}

function normalizeForeignKeyKey(foreignKey: CreateTableForeignKeySpec) {
  return [
    foreignKey.sourceColumn.trim().toLowerCase(),
    foreignKey.referencedSchemaName?.trim().toLowerCase() ?? "",
    foreignKey.referencedTableName.trim().toLowerCase(),
    foreignKey.referencedColumnName.trim().toLowerCase(),
    (foreignKey.onDelete ?? "").trim().toLowerCase(),
    (foreignKey.onUpdate ?? "").trim().toLowerCase(),
  ].join("|")
}

function buildForeignKeyComparisonKeys(
  foreignKeys: CreateTableForeignKeySpec[],
  defaultSchemaName: string
) {
  return foreignKeys
    .map((foreignKey) => buildForeignKeyComparisonKey(foreignKey, defaultSchemaName))
    .sort()
}

function buildForeignKeyComparisonKey(
  foreignKey: CreateTableForeignKeySpec,
  defaultSchemaName: string
) {
  return normalizeForeignKeyKey({
    ...foreignKey,
    referencedSchemaName: foreignKey.referencedSchemaName?.trim() || defaultSchemaName,
  })
}

function normalizeSequenceInteger(value: string | undefined, fallback: string) {
  const normalized = String(value ?? "").trim() || fallback

  if (!/^-?\d+$/.test(normalized)) {
    throw new Error("Os valores numéricos da sequence devem ser inteiros.")
  }

  return normalized
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
      unsigned: Boolean((column as { unsigned?: boolean }).unsigned),
      notNull: Boolean(column.notNull),
      primaryKey: Boolean(column.primaryKey),
      unique: Boolean((column as { unique?: boolean }).unique),
      autoIncrement: Boolean(column.autoIncrement),
      defaultValue: sanitizeSqlExpression(column.defaultValue),
      comment: sanitizeSqlExpression(column.comment),
    }))
    .filter((column) => column.name && column.dataType)
  const foreignKeys = normalizeForeignKeysInput(input.foreignKeys, schemaName)
  const indexes = normalizeTableIndexesInput(input.indexes, tableName)
  const triggers = normalizeTableTriggersInput(input.triggers)
  const functions = normalizeTableFunctionsInput(input.functions)

  if (!tableName) {
    throw new Error("Informe um nome válido para a tabela.")
  }

  if (!columns.length) {
    throw new Error("Adicione ao menos uma coluna para criar a tabela.")
  }

  if (
    (connection.databaseType === "mysql" || connection.databaseType === "mariadb") &&
    foreignKeys.length
  ) {
    await assertMySqlForeignKeyCompatibility(
      connection,
      targetDatabaseName || connection.databaseName,
      schemaName,
      columns,
      foreignKeys
    )
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
        foreignKeys,
        indexes,
        triggers,
        functions
      )

    case "postgresql":
      return createPostgreSqlTable(
        connection,
        targetDatabaseName || connection.databaseName.trim() || "postgres",
        schemaName,
        tableName,
        comment,
        columns,
        foreignKeys,
        indexes,
        triggers,
        functions
      )

    case "sqlserver":
      return createSqlServerTable(
        connection,
        targetDatabaseName || connection.databaseName.trim() || "master",
        schemaName,
        tableName,
        comment,
        columns,
        foreignKeys,
        indexes,
        triggers,
        functions
      )

    case "sqlite":
      return createSqliteTable(connection, tableName, comment, columns, foreignKeys, indexes, triggers, functions)

    default:
      throw new Error("Tipo de banco não suportado.")
  }
}

async function createSqlTableLike(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: CreateTableColumnSpec[],
  foreignKeys: CreateTableForeignKeySpec[] = [],
  indexes: CreateTableIndexSpec[] = [],
  triggers: CreateTableTriggerSpec[] = [],
  functions: CreateTableFunctionSpec[] = []
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
    for (const statement of buildMySqlLikeAddForeignKeySql(connection, schemaName, tableName, foreignKeys)) {
      await client.query(statement)
    }
    for (const index of indexes) {
      await client.query(buildCreateTableIndexDefinition(connection, tableName, index, 0, schemaName))
    }
    for (const trigger of triggers) {
      await client.query(buildCreateTableTriggerDefinition(connection, tableName, trigger, schemaName))
    }
    for (const item of functions) {
      await client.query(buildCreateTableFunctionDefinition(connection, schemaName, item))
    }

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
  databaseName: string,
  schemaName: string,
  tableName: string,
  comment: string,
  columns: CreateTableColumnSpec[],
  foreignKeys: CreateTableForeignKeySpec[] = [],
  indexes: CreateTableIndexSpec[] = [],
  triggers: CreateTableTriggerSpec[] = [],
  functions: CreateTableFunctionSpec[] = []
): Promise<CreateTableResult> {
  return withPostgresClient(connection, databaseName || connection.databaseName.trim() || "postgres", async (client) => {
    const { createSchemaSql, sequenceSql, createTableSql, sequenceOwnedBySql, commentSql } =
      buildPostgreSqlCreateTableSql(
      connection,
      schemaName,
      tableName,
      comment,
      columns,
      foreignKeys
      )

    if (createSchemaSql) {
      await client.query(createSchemaSql)
    }

    for (const statement of sequenceSql) {
      await client.query(statement)
    }

    await client.query(createTableSql)

    for (const statement of sequenceOwnedBySql) {
      await client.query(statement)
    }

    if (commentSql) {
      await client.query(commentSql)
    }

    for (const index of indexes) {
      await client.query(buildCreateTableIndexDefinition(connection, tableName, index, 0, schemaName))
    }
    for (const trigger of triggers) {
      await client.query(buildCreateTableTriggerDefinition(connection, tableName, trigger, schemaName))
    }
    for (const item of functions) {
      await client.query(buildCreateTableFunctionDefinition(connection, schemaName, item))
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
  columns: CreateTableColumnSpec[],
  foreignKeys: CreateTableForeignKeySpec[] = [],
  indexes: CreateTableIndexSpec[] = [],
  triggers: CreateTableTriggerSpec[] = [],
  functions: CreateTableFunctionSpec[] = []
): Promise<CreateTableResult> {
  return withSqlServerPool(
    connection,
    sanitizeDatabaseIdentifier(databaseName) || connection.databaseName.trim() || "master",
    async (pool) => {
      const { createSchemaSql, createTableSql } = buildSqlServerCreateTableSql(
        connection,
        schemaName,
        tableName,
        columns,
        foreignKeys
      )

      if (createSchemaSql) {
        await pool.request().query(createSchemaSql)
      }

      await pool.request().query(createTableSql)
      for (const index of indexes) {
        await pool.request().query(buildCreateTableIndexDefinition(connection, tableName, index, 0, schemaName))
      }
      for (const trigger of triggers) {
        await pool.request().query(buildCreateTableTriggerDefinition(connection, tableName, trigger, schemaName))
      }
      for (const item of functions) {
        await pool.request().query(buildCreateTableFunctionDefinition(connection, schemaName, item))
      }

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
  columns: CreateTableColumnSpec[],
  foreignKeys: CreateTableForeignKeySpec[] = [],
  indexes: CreateTableIndexSpec[] = [],
  triggers: CreateTableTriggerSpec[] = [],
  functions: CreateTableFunctionSpec[] = []
): Promise<CreateTableResult> {
  return withSqliteDatabase(connection, async (db) => {
    const { tablePath, createTableSql } = buildSqliteCreateTableSql(
      connection,
      tableName,
      columns,
      foreignKeys
    )
    db.exec(createTableSql)
    for (const index of indexes) {
      db.exec(buildCreateTableIndexDefinition(connection, tableName, index, 0, "main"))
    }
    for (const trigger of triggers) {
      db.exec(buildCreateTableTriggerDefinition(connection, tableName, trigger, "main"))
    }
    for (const item of functions) {
      db.exec(buildCreateTableFunctionDefinition(connection, "main", item))
    }

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

export function deleteConnection(id: string) {
  const existingConnection = getConnectionById(id)

  if (!existingConnection) {
    throw new Error("Conexão não encontrada.")
  }

  const db = ensureAppDatabase()
  db.prepare("DELETE FROM connections WHERE id = ?").run(id)

  return {
    id,
    message: "Conexão removida",
    details: `A conexão ${existingConnection.connectionName} foi removida com sucesso.`,
  }
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
          const normalizedRows = normalizeMySqlLikeQueryRows(rows)
          const normalized = normalizeRows(normalizedRows)
          const columns = Array.isArray(fields)
            ? fields
                .map((field) =>
                  field && typeof field === "object" && "name" in field ? String(field.name ?? "") : ""
                )
                .filter(Boolean)
            : normalized.columns

          return {
            columns,
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
          const normalized = normalizeRows(normalizeMySqlLikeQueryRows(result))

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
        const rows = Array.isArray(result.rows) ? (result.rows as Array<Record<string, unknown>>) : []
        const fields = Array.isArray(result.fields) ? result.fields : []
        const normalized = normalizeRows(rows)

        return {
          columns: fields.map((field) => field.name),
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
        const recordset = Array.isArray(result.recordset)
          ? (result.recordset as Array<Record<string, unknown>>)
          : []
        const normalized = normalizeRows(recordset)
        const columns = normalized.columns.length
          ? normalized.columns
          : extractSqlServerRecordsetColumns(result.recordset)

        return {
          columns,
          rows: normalized.rows,
          rowCount: normalized.rows.length,
          message: normalized.rows.length
            ? `${normalized.rows.length} linha(s) retornada(s).`
            : "Consulta executada com sucesso.",
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
      users: [],
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
      users: [],
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
    const users = await getMySqlLikeUsers(client, databaseType)

    const databases: DatabaseStructureDatabase[] = []

    for (const databaseName of databaseNames) {
      databases.push(await buildMySqlLikeDatabaseStructure(client, databaseType, databaseName))
    }

    return {
      databases,
      schemas: [],
      groups: [],
      users,
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

async function getMySqlLikeUsers(
  client: {
    query: (queryText: string, params?: unknown[]) => Promise<unknown>
  },
  databaseType: "mysql" | "mariadb"
) {
  try {
    const rows = await runMySqlLikeMetadataQuery(
      client,
      databaseType,
      `
        SELECT User AS name
        FROM mysql.user
        ORDER BY User
      `,
      []
    )

    return extractNames(rows)
  } catch {
    const fallbackRows = await runMySqlLikeMetadataQuery(
      client,
      databaseType,
      `
        SELECT DISTINCT GRANTEE AS name
        FROM information_schema.user_privileges
        ORDER BY GRANTEE
      `,
      []
    )

    return extractNames(
      fallbackRows.map((row) => ({
        ...row,
        name: String((row as Record<string, unknown>).name ?? "")
          .replace(/^'|'\@.*$/g, "")
          .trim(),
      }))
    )
  }
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
  const tableSizes = await runMySqlLikeMetadataQuery(
    client,
    databaseType,
    `
      SELECT
        TABLE_NAME AS name,
        COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0) AS size_bytes
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
    [databaseName]
  )

  const tableNames = extractNames(tables)
  const viewNames = extractNames(views)
  const tableColumnsByItem = await getMySqlLikeColumnsByItem(client, databaseType, databaseName, tableNames)
  const viewColumnsByItem = await getMySqlLikeColumnsByItem(client, databaseType, databaseName, viewNames)
  const groups = [
    createGroup(
      "Tabelas",
      tableNames,
      tableColumnsByItem.columnsByItem,
      tableColumnsByItem.columnsDetailsByItem,
      extractSizesByItem(tableSizes)
    ),
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
  const database = sanitizeText(connection.databaseName)

  return withPostgresClient(connection, database || "postgres", async (client) => {
    const databaseResult = await client.query(`
      SELECT datname AS name
      FROM pg_database
      WHERE datallowconn = true
        AND datistemplate = false
      ORDER BY
        CASE WHEN datname = current_database() THEN 0 ELSE 1 END,
        datname
    `)
    const databaseNames = extractNames(databaseResult.rows)
    const normalizedDatabaseNames = databaseNames.length ? databaseNames : [database || "postgres"]
    const databases: DatabaseStructureDatabase[] = []

    for (const databaseName of normalizedDatabaseNames) {
      try {
        databases.push(await getPostgreSqlDatabaseStructure(connection, databaseName))
      } catch {
        // A role can see a database in pg_database without being allowed to connect to it.
      }
    }

    return {
      databases,
      schemas: databases[0]?.schemas ?? [],
      groups: databases[0]?.groups ?? [],
      users: await getPostgreSqlUsers(client),
    }
  })
}

async function getPostgreSqlDatabaseStructure(
  connection: SavedConnection,
  databaseName: string
): Promise<DatabaseStructureDatabase> {
  return withPostgresClient(connection, databaseName, async (client) => {
    const schemaResult = await client.query("SELECT current_schema() AS name")
    const currentSchemaName = String(schemaResult.rows[0]?.name ?? "public")
    const schemasResult = await client.query(`
      SELECT schema_name AS name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
        AND schema_name NOT LIKE 'pg_toast%'
        AND schema_name NOT LIKE 'pg_temp_%'
      ORDER BY
        CASE WHEN schema_name = current_schema() THEN 0 ELSE 1 END,
        schema_name
    `)
    const schemaNames = extractNames(schemasResult.rows)
    const normalizedSchemaNames = schemaNames.length ? schemaNames : [currentSchemaName]
    const encodingResult = await client.query(`
      SELECT pg_encoding_to_char(encoding) AS encoding
      FROM pg_database
      WHERE datname = current_database()
      LIMIT 1
    `)
    const encoding =
      String(encodingResult.rows[0]?.encoding ?? encodingResult.rows[0]?.ENCODING ?? "").trim() ||
      undefined

    const schemas: DatabaseStructure["schemas"] = []

    for (const schemaName of normalizedSchemaNames) {
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
      const sequences = await client.query(
        `
          SELECT sequence_name AS name
          FROM information_schema.sequences
          WHERE sequence_schema = $1
          ORDER BY sequence_name
        `,
        [schemaName]
      )
      const tableSizes = await client.query(
        `
          SELECT
            c.relname AS name,
            pg_total_relation_size(c.oid) AS size_bytes
          FROM pg_class c
          INNER JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1
            AND c.relkind IN ('r', 'p')
          ORDER BY c.relname
        `,
        [schemaName]
      )

      const tableNames = extractNames(tables.rows)
      const viewNames = extractNames(views.rows)
      const tableColumnsByItem = await getPostgreSqlColumnsByItem(client, schemaName, tableNames)
      const viewColumnsByItem = await getPostgreSqlColumnsByItem(client, schemaName, viewNames)

      schemas.push({
        name: schemaName,
        groups: [
          createGroup(
            "Tabelas",
            tableNames,
            tableColumnsByItem.columnsByItem,
            tableColumnsByItem.columnsDetailsByItem,
            extractSizesByItem(tableSizes.rows)
          ),
          createGroup("Views", viewNames, viewColumnsByItem.columnsByItem, viewColumnsByItem.columnsDetailsByItem),
          createGroup("Índices", extractNames(indexes.rows)),
          createGroup("Sequences", extractNames(sequences.rows)),
          createGroup("Funções", extractNames(functions.rows)),
          createGroup("Procedures", extractNames(procedures.rows)),
        ],
      })
    }

    return {
      name: databaseName,
      schemas,
      groups: schemas[0]?.groups ?? [],
      encoding,
    }
  })
}

async function getPostgreSqlUsers(client: PostgresClient) {
  const result = await client.query(`
    SELECT rolname AS name
    FROM pg_roles
    WHERE rolcanlogin = true
    ORDER BY rolname
  `)

  return extractNames(result.rows)
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
    const users = await getSqlServerUsers(pool)

    return {
      databases,
      schemas: databases[0]?.schemas ?? [],
      groups: databases[0]?.groups ?? [],
      users,
    }
  } finally {
    await pool.close()
  }
}

async function getSqlServerUsers(pool: sql.ConnectionPool) {
  try {
    const result = await pool.request().query(`
      SELECT name
      FROM sys.server_principals
      WHERE type IN ('S', 'U', 'G', 'E', 'X')
        AND name NOT IN (
          'sa',
          'NT AUTHORITY\\SYSTEM',
          'NT AUTHORITY\\NETWORK SERVICE',
          'NT AUTHORITY\\LOCAL SERVICE'
        )
      ORDER BY name
    `)

    return extractNames(result.recordset as Array<Record<string, unknown>>)
  } catch {
    return []
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
        END AS column_size,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM ${quotedDatabase}.sys.indexes i
            INNER JOIN ${quotedDatabase}.sys.index_columns ic
              ON i.object_id = ic.object_id
             AND i.index_id = ic.index_id
            WHERE i.is_primary_key = 1
              AND i.object_id = c.object_id
              AND ic.column_id = c.column_id
          )
          THEN 1
          ELSE 0
        END AS primary_key
      FROM ${quotedDatabase}.sys.columns c
      INNER JOIN ${quotedDatabase}.sys.objects o ON c.object_id = o.object_id
      INNER JOIN ${quotedDatabase}.sys.types t ON c.user_type_id = t.user_type_id
      INNER JOIN ${quotedDatabase}.sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.type IN ('U', 'V')
      ORDER BY s.name, o.name, c.column_id
    `)
  const tableSizes = await pool.request().query(`
    SELECT
      s.name AS schema_name,
      t.name AS name,
      SUM(a.total_pages) * 8 * 1024 AS size_bytes
    FROM ${quotedDatabase}.sys.tables t
    INNER JOIN ${quotedDatabase}.sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN ${quotedDatabase}.sys.indexes i ON t.object_id = i.object_id
    INNER JOIN ${quotedDatabase}.sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
    INNER JOIN ${quotedDatabase}.sys.allocation_units a ON p.partition_id = a.container_id
    GROUP BY s.name, t.name
    ORDER BY s.name, t.name
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
          sizesByItem: extractSizesByItemForSchema(tableSizes.recordset, schemaName),
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

function extractSizesByItem(rows: Array<Record<string, unknown>>) {
  const sizesByItem: Record<string, number> = {}

  for (const row of rows) {
    const name = String(row.name ?? row.NAME ?? row.table_name ?? row.TABLE_NAME ?? "").trim()
    const size = Number(row.size_bytes ?? row.SIZE_BYTES ?? row.size ?? row.SIZE ?? 0)

    if (!name || !Number.isFinite(size)) {
      continue
    }

    sizesByItem[name] = Math.max(0, size)
  }

  return sizesByItem
}

function extractSizesByItemForSchema(rows: Array<Record<string, unknown>>, schemaName: string) {
  const normalizedSchemaName = schemaName.trim()

  return extractSizesByItem(
    rows.filter((row) => String(row.schema_name ?? row.SCHEMA_NAME ?? "").trim() === normalizedSchemaName)
  )
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
          COLUMN_TYPE AS column_type,
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
          rc.DELETE_RULE AS delete_rule,
          rc.UPDATE_RULE AS update_rule,
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
    const indexRows = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `
        SELECT
          INDEX_NAME AS index_name,
          NON_UNIQUE AS non_unique,
          COLUMN_NAME AS column_name,
          SEQ_IN_INDEX AS seq_in_index
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `,
      [schemaName, tableName]
    )
    const triggers = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `
        SELECT
          TRIGGER_NAME AS name,
          ACTION_TIMING AS timing,
          EVENT_MANIPULATION AS event,
          ACTION_STATEMENT AS body
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
    const indexMap = new Map<
      string,
      TableIndexDefinition
    >()

    for (const row of indexRows) {
      const name = String(row.index_name ?? row.INDEX_NAME ?? "").trim()
      const columnName = String(row.column_name ?? row.COLUMN_NAME ?? "").trim()

      if (!name || !columnName) {
        continue
      }

      const existing = indexMap.get(name)
      const unique = Number(row.non_unique ?? row.NON_UNIQUE ?? 1) === 0
      const nextEntry =
        existing ??
        ({
          name,
          columns: [],
          unique,
          primaryKey: name.toUpperCase() === "PRIMARY",
        } satisfies TableIndexDefinition)

      nextEntry.columns.push(columnName)
      nextEntry.unique = nextEntry.primaryKey ? true : unique
      indexMap.set(name, nextEntry)
    }
    const indexes = Array.from(indexMap.values()).sort((left, right) => {
      if (left.primaryKey !== right.primaryKey) {
        return left.primaryKey ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })
    const uniqueColumnSet = new Set(
      indexes
        .filter((index) => index.unique && index.columns.length === 1 && !index.primaryKey)
        .map((index) => index.columns[0].trim().toLowerCase())
    )

    return {
      databaseName,
      schemaName,
      tableName,
      comment: String(tableRows[0]?.comment ?? tableRows[0]?.COMMENT ?? "").trim(),
      columns: rows.map((row) => ({
        name: String(row.name ?? row.COLUMN_NAME ?? "").trim(),
        dataType: String(row.data_type ?? row.DATA_TYPE ?? "").trim().toUpperCase(),
        unsigned: /\bunsigned\b/i.test(String(row.column_type ?? row.COLUMN_TYPE ?? "").trim()),
        size: (() => {
          const columnType = String(row.column_type ?? row.COLUMN_TYPE ?? "").trim()
          const dataType = String(row.data_type ?? row.DATA_TYPE ?? "").trim().toUpperCase()
          const sizeFromType = (() => {
            const match = columnType.match(/^[^(]+\((\d+(?:\s*,\s*\d+)?)\)(?:\s+unsigned|\s+zerofill)?$/i)

            if (!match) {
              return ""
            }

            return match[1].replace(/\s+/g, "").trim()
          })()

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

          return normalizeColumnSize(row.char_length, row.numeric_precision, row.numeric_scale)
        })(),
        notNull: String(row.is_nullable ?? row.IS_NULLABLE ?? "").toUpperCase() === "NO",
        primaryKey: String(row.column_key ?? row.COLUMN_KEY ?? "").toUpperCase() === "PRI",
        unique:
          uniqueColumnSet.has(String(row.name ?? row.COLUMN_NAME ?? "").trim().toLowerCase()) ||
          String(row.column_key ?? row.COLUMN_KEY ?? "").toUpperCase() === "UNI",
        autoIncrement: String(row.extra ?? row.EXTRA ?? "").toLowerCase().includes("auto_increment"),
        defaultValue: String(row.default_value ?? row.COLUMN_DEFAULT ?? "").trim(),
        comment: String(row.comment ?? row.COLUMN_COMMENT ?? "").trim(),
      })),
      foreignKeys: foreignKeys.map((row) => {
        const constraintName = String(row.name ?? row.CONSTRAINT_NAME ?? "").trim()
        const columnName = String(row.column_name ?? row.COLUMN_NAME ?? "").trim()
        const referencedTable = String(row.referenced_table ?? row.REFERENCED_TABLE_NAME ?? "").trim()
        const referencedColumn = String(row.referenced_column ?? row.REFERENCED_COLUMN_NAME ?? "").trim()
        const deleteRule = String(row.delete_rule ?? row.DELETE_RULE ?? "").trim().toUpperCase()
        const updateRule = String(row.update_rule ?? row.UPDATE_RULE ?? "").trim().toUpperCase()
        const actions = [
          deleteRule ? `ON DELETE ${deleteRule}` : "",
          updateRule ? `ON UPDATE ${updateRule}` : "",
        ]
          .filter(Boolean)
          .join(" ")

        return `${constraintName}: ${columnName} -> ${referencedTable}.${referencedColumn}${actions ? ` ${actions}` : ""}`
      }),
      indexes,
      triggers: triggers.map((row) => ({
        name: String(row.name ?? row.TRIGGER_NAME ?? "").trim(),
        description: "",
        timing: String(row.timing ?? row.ACTION_TIMING ?? "").trim().toUpperCase(),
        event: String(row.event ?? row.EVENT_MANIPULATION ?? "").trim().toUpperCase(),
        body: String(row.body ?? row.ACTION_STATEMENT ?? "").trim(),
      })),
      functions: extractNames(functions),
      sequences: [],
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
          is_identity,
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
        SELECT
          i.relname AS name,
          ix.indisunique AS is_unique,
          ix.indisprimary AS is_primary,
          ARRAY_AGG(a.attname ORDER BY x.ordinality) AS columns
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_class i ON i.oid = ix.indexrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        INNER JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality) ON TRUE
        INNER JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
        WHERE n.nspname = $1
          AND t.relname = $2
        GROUP BY i.relname, ix.indisunique, ix.indisprimary
        ORDER BY i.relname
      `,
      [schemaName, tableName]
    )
    const triggerResult = await client.query(
      `
        SELECT
          t.tgname AS name,
          pg_get_triggerdef(t.oid) AS definition,
          pg_get_functiondef(t.tgfoid) AS function_definition
        FROM pg_trigger t
        INNER JOIN pg_class c ON c.oid = t.tgrelid
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = $2
          AND NOT t.tgisinternal
        ORDER BY t.tgname
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
    const sequenceResult = await client.query(
      `
        SELECT
          name,
          column_name
        FROM (
          SELECT seq.relname AS name, col.attname AS column_name
          FROM pg_class tbl
          INNER JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
          INNER JOIN pg_attribute col ON col.attrelid = tbl.oid
          INNER JOIN pg_depend dep
            ON dep.refobjid = tbl.oid
           AND dep.refobjsubid = col.attnum
           AND dep.deptype IN ('a', 'i')
          INNER JOIN pg_class seq
            ON seq.oid = dep.objid
           AND seq.relkind = 'S'
          WHERE ns.nspname = $1
            AND tbl.relname = $2
          UNION
          SELECT seq.relname AS name, col.attname AS column_name
          FROM pg_class tbl
          INNER JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
          INNER JOIN pg_attribute col ON col.attrelid = tbl.oid
          INNER JOIN pg_attrdef def ON def.adrelid = tbl.oid AND def.adnum = col.attnum
          INNER JOIN pg_depend dep
            ON dep.classid = 'pg_attrdef'::regclass
           AND dep.objid = def.oid
           AND dep.refclassid = 'pg_class'::regclass
          INNER JOIN pg_class seq
            ON seq.oid = dep.refobjid
           AND seq.relkind = 'S'
          WHERE ns.nspname = $1
            AND tbl.relname = $2
            AND col.attnum > 0
            AND NOT col.attisdropped
        ) sequences
        ORDER BY name
      `,
      [schemaName, tableName]
    )

    const primaryKeys = new Set(extractNames(pkResult.rows))
    const indexes = (indexResult.rows as Array<Record<string, unknown>>).map((row) => ({
      name: String(row.name ?? "").trim(),
      columns: Array.isArray(row.columns)
        ? (row.columns as Array<unknown>).map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
      unique: Boolean(row.is_unique),
      primaryKey: Boolean(row.is_primary),
    }))
    const uniqueColumnSet = new Set(
      indexes
        .filter((index) => index.unique && index.columns.length === 1 && !index.primaryKey)
        .map((index) => index.columns[0].trim().toLowerCase())
    )

    return {
      databaseName,
      schemaName,
      tableName,
      comment: String(commentResult.rows[0]?.comment ?? commentResult.rows[0]?.COMMENT ?? "").trim(),
      columns: columnsResult.rows.map((row) => ({
        name: String(row.name ?? "").trim(),
        dataType: normalizePostgreSqlDataType(String(row.data_type ?? "").trim()),
        size: normalizeColumnSize(row.character_maximum_length, row.numeric_precision, row.numeric_scale),
        notNull: String(row.is_nullable ?? "").toUpperCase() === "NO",
        primaryKey: primaryKeys.has(String(row.name ?? "").trim()),
        unique:
          uniqueColumnSet.has(String(row.name ?? "").trim().toLowerCase()) &&
          !primaryKeys.has(String(row.name ?? "").trim()),
        autoIncrement:
          String(row.is_identity ?? "").toUpperCase() === "YES" ||
          String(row.column_default ?? "").toLowerCase().includes("nextval("),
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
      indexes,
      triggers: (triggerResult.rows as Array<Record<string, unknown>>).map((row) => {
        const definition = String(row.definition ?? "").trim()
        const functionDefinition = String(row.function_definition ?? "").trim()
        const payload = extractTriggerPayloadFromDefinition(definition, functionDefinition)

        return {
          name: String(row.name ?? "").trim(),
          description: payload.description,
          timing: payload.timing,
          event: payload.event,
          body: payload.body,
        }
      }),
      functions: extractNames(functionResult.rows),
      sequences: (sequenceResult.rows as Array<Record<string, unknown>>).map((row) => ({
        name: String(row.name ?? "").trim(),
        columnName: String(row.column_name ?? "").trim(),
      })),
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
        rs.name AS referenced_schema,
        rt.name AS referenced_table,
        rc.name AS referenced_column,
        fk.delete_referential_action_desc AS delete_rule,
        fk.update_referential_action_desc AS update_rule
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
      INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
      INNER JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
      INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
      WHERE fk.parent_object_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
      ORDER BY fk.name, fkc.constraint_column_id
    `)
    const indexResult = await pool.request().query(`
      SELECT
        i.name AS name,
        i.is_unique AS is_unique,
        i.is_primary_key AS is_primary_key,
        i.type_desc AS index_type,
        c.name AS column_name,
        ic.key_ordinal AS key_ordinal
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.object_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
        AND i.name IS NOT NULL
      ORDER BY i.name, ic.key_ordinal
    `)
    const triggerResult = await pool.request().query(`
      SELECT
        t.name AS name,
        CASE WHEN t.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
        STRING_AGG(te.type_desc, ', ') WITHIN GROUP (ORDER BY te.type_desc) AS event,
        OBJECT_DEFINITION(t.object_id) AS definition
      FROM sys.triggers t
      LEFT JOIN sys.trigger_events te ON t.object_id = te.object_id
      WHERE t.parent_id = OBJECT_ID(${quoteSqlLiteral(fullObjectName)})
      GROUP BY t.name, t.is_instead_of_trigger, t.object_id
      ORDER BY t.name
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
    const indexMap = new Map<string, TableIndexDefinition>()

    for (const row of indexResult.recordset as Array<Record<string, unknown>>) {
      const name = String(row.name ?? "").trim()
      const columnName = String(row.column_name ?? "").trim()

      if (!name || !columnName) {
        continue
      }

      const unique = Boolean(row.is_unique)
      const primaryKey = Boolean(row.is_primary_key)
      const sqlServerIndexType = String(row.index_type ?? "")
        .trim()
        .replace(/_/g, " ")
      const existing = indexMap.get(name) ?? {
        name,
        columns: [],
        unique,
        primaryKey,
        sqlServerIndexType,
      }

      existing.columns.push(columnName)
      existing.unique = existing.primaryKey ? true : unique
      existing.primaryKey = primaryKey
      existing.sqlServerIndexType = existing.sqlServerIndexType || sqlServerIndexType
      indexMap.set(name, existing)
    }

    const indexes = Array.from(indexMap.values()).sort((left, right) => {
      if (left.primaryKey !== right.primaryKey) {
        return left.primaryKey ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })
    const uniqueColumnSet = new Set(
      indexes
        .filter((index) => index.unique && index.columns.length === 1 && !index.primaryKey)
        .map((index) => index.columns[0].trim().toLowerCase())
    )

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
        unique:
          uniqueColumnSet.has(String(row.name ?? "").trim().toLowerCase()) &&
          !primaryKeys.has(String(row.name ?? "").trim()),
        autoIncrement: Boolean(row.is_identity),
        defaultValue: String(row.default_value ?? "").trim(),
        comment: String(row.comment ?? "").trim(),
      })),
      foreignKeys: (fkResult.recordset as Array<Record<string, unknown>>).map((row) => {
        const constraintName = String(row.name ?? "").trim()
        const columnName = String(row.column_name ?? "").trim()
        const referencedSchema = String(row.referenced_schema ?? "").trim()
        const referencedTable = String(row.referenced_table ?? "").trim()
        const referencedColumn = String(row.referenced_column ?? "").trim()
        const deleteRule = normalizeSqlServerReferentialAction(row.delete_rule)
        const updateRule = normalizeSqlServerReferentialAction(row.update_rule)
        const actions = [
          deleteRule ? `ON DELETE ${deleteRule}` : "",
          updateRule ? `ON UPDATE ${updateRule}` : "",
        ]
          .filter(Boolean)
          .join(" ")
        const referencedTarget = [referencedSchema, referencedTable, referencedColumn]
          .filter(Boolean)
          .join(".")

        return `${constraintName}: ${columnName} -> ${referencedTarget}${actions ? ` ${actions}` : ""}`
      }),
      indexes,
      triggers: (triggerResult.recordset as Array<Record<string, unknown>>).map((row) => {
        const definition = String(row.definition ?? "").trim()
        const payload = extractTriggerPayloadFromDefinition(definition)

        return {
          name: String(row.name ?? "").trim(),
          description: payload.description,
          timing: String(row.timing ?? payload.timing ?? "").trim().toUpperCase(),
          event: String(row.event ?? payload.event ?? "").trim().toUpperCase().replace(/_EVENT/g, ""),
          body: payload.body || definition,
        }
      }),
      functions: extractNames(functionResult.recordset as Array<Record<string, unknown>>),
      sequences: [],
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
      .all() as Array<{ name?: string; unique?: number; origin?: string }>
    const triggerRows = db
      .prepare(
        `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ${quoteSqlLiteral(tableName)} ORDER BY name`
      )
      .all() as Array<{ name?: string; sql?: string }>
    const indexes = indexRows
      .map((row) => {
        const name = String(row.name ?? "").trim()

        if (!name) {
          return null
        }

        const indexInfoRows = db
          .prepare(`PRAGMA index_info(${quoteSqlLiteral(name)})`)
          .all() as Array<{ name?: string; seqno?: number }>
        const columns = indexInfoRows
          .sort((left, right) => Number(left.seqno ?? 0) - Number(right.seqno ?? 0))
          .map((row) => String(row.name ?? "").trim())
          .filter(Boolean)

        return {
          name,
          columns,
          unique: Boolean(row.unique) || row.origin === "pk",
          primaryKey: row.origin === "pk",
        }
      })
      .filter((index): index is TableIndexDefinition => Boolean(index))
      .sort((left, right) => {
        if (left.primaryKey !== right.primaryKey) {
          return left.primaryKey ? -1 : 1
        }

        return left.name.localeCompare(right.name)
      })
    const uniqueColumnSet = new Set(
      indexes
        .filter((index) => index.unique && index.columns.length === 1 && !index.primaryKey)
        .map((index) => index.columns[0].trim().toLowerCase())
    )

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
        unique:
          uniqueColumnSet.has(String(row.name ?? "").trim().toLowerCase()) &&
          !Boolean(row.pk),
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
      indexes,
      triggers: triggerRows.map((row) => {
        const definition = String(row.sql ?? "").trim()
        const payload = extractTriggerPayloadFromDefinition(definition)

        return {
          name: String(row.name ?? "").trim(),
          description: payload.description,
          timing: payload.timing,
          event: payload.event,
          body: payload.body || definition,
        }
      }),
      functions: [],
      sequences: [],
    }
  } finally {
    db.close()
  }
}

async function getMySqlLikeViewDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  viewName: string
): Promise<ViewDetails> {
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
    const qualifiedView = `${quoteIdentifier(connection.databaseType, schemaName)}.${quoteIdentifier(
      connection.databaseType,
      viewName
    )}`
    const rows = await runMySqlLikeMetadataQuery(
      client,
      connection.databaseType,
      `SHOW CREATE VIEW ${qualifiedView}`,
      []
    )
    const row = (rows[0] ?? {}) as Record<string, unknown>
    const definition = String(row["Create View"] ?? row.definition ?? row.Definition ?? "").trim()

    if (!definition) {
      throw new Error("Não foi possível carregar a definição da view.")
    }

    return {
      databaseName,
      schemaName,
      viewName,
      sqlText: ensureSqlTerminator(definition),
    }
  } finally {
    await client.end()
  }
}

async function getPostgreSqlViewDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  viewName: string
): Promise<ViewDetails> {
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
    const result = await client.query(
      `
        SELECT pg_get_viewdef((quote_ident($1) || '.' || quote_ident($2))::regclass, true) AS definition
      `,
      [schemaName, viewName]
    )
    const definition = String(result.rows[0]?.definition ?? result.rows[0]?.DEFINITION ?? "").trim()

    if (!definition) {
      throw new Error("Não foi possível carregar a definição da view.")
    }

    const qualifiedViewName = `${quoteIdentifier("postgresql", schemaName)}.${quoteIdentifier(
      "postgresql",
      viewName
    )}`

    return {
      databaseName,
      schemaName,
      viewName,
      sqlText: `CREATE OR REPLACE VIEW ${qualifiedViewName} AS\n${definition.replace(/;+\s*$/, "")};`,
    }
  } finally {
    await client.end()
  }
}

async function getSqlServerViewDetails(
  connection: SavedConnection,
  databaseName: string,
  schemaName: string,
  viewName: string
): Promise<ViewDetails> {
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
    const result = await pool.request().query(`
      SELECT OBJECT_DEFINITION(OBJECT_ID(${quoteSqlLiteral(
        `${quoteSqlServerIdentifier(schemaName)}.${quoteSqlServerIdentifier(viewName)}`
      )})) AS definition
    `)
    const definition = String(result.recordset[0]?.definition ?? result.recordset[0]?.DEFINITION ?? "").trim()

    if (!definition) {
      throw new Error("Não foi possível carregar a definição da view.")
    }

    return {
      databaseName,
      schemaName,
      viewName,
      sqlText: ensureSqlTerminator(definition),
    }
  } finally {
    await pool.close()
  }
}

async function getSqliteViewDetails(
  connection: SavedConnection,
  viewName: string
): Promise<ViewDetails> {
  const filePath = sanitizeText(connection.databaseFile)
  if (!filePath) {
    throw new Error("Informe o arquivo SQLite da conexão.")
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const db = new Database(resolvedPath)

  try {
    const rows = db
      .prepare(
        `
          SELECT sql
          FROM sqlite_master
          WHERE type = 'view'
            AND name = ${quoteSqlLiteral(viewName)}
          LIMIT 1
        `
      )
      .all() as Array<{ sql?: string }>

    const definition = String(rows[0]?.sql ?? "").trim()

    if (!definition) {
      throw new Error("Não foi possível carregar a definição da view.")
    }

    return {
      databaseName: connection.databaseFile || "main",
      schemaName: "main",
      viewName,
      sqlText: ensureSqlTerminator(definition),
    }
  } finally {
    db.close()
  }
}

function ensureSqlTerminator(sqlText: string) {
  const normalized = sqlText.trim()

  if (!normalized) {
    return normalized
  }

  return normalized.endsWith(";") ? normalized : `${normalized};`
}

function buildDropRoutineSql(
  databaseType: DatabaseType,
  schemaName: string,
  routineName: string,
  kind: RoutineKind
) {
  if (databaseType === "postgresql") {
    return `DROP ROUTINE IF EXISTS ${quoteIdentifier("postgresql", schemaName)}.${quoteIdentifier(
      "postgresql",
      routineName
    )} CASCADE`
  }

  if (databaseType === "sqlserver") {
    return kind === "procedure"
      ? `DROP PROCEDURE IF EXISTS ${quoteSqlServerIdentifier(schemaName)}.${quoteSqlServerIdentifier(routineName)}`
      : `DROP FUNCTION IF EXISTS ${quoteSqlServerIdentifier(schemaName)}.${quoteSqlServerIdentifier(routineName)}`
  }

  if (databaseType === "mysql" || databaseType === "mariadb") {
    const routineType = kind === "procedure" ? "PROCEDURE" : "FUNCTION"
    return `DROP ${routineType} IF EXISTS ${quoteIdentifier(databaseType, schemaName)}.${quoteIdentifier(
      databaseType,
      routineName
    )}`
  }

  throw new Error("Tipo de banco não suportado para routines.")
}

function isSqlServerColumnAlterInPlaceSupported(
  column: {
    name: string
    dataType: string
    size: string
    unsigned?: boolean
    notNull: boolean
    primaryKey: boolean
    unique?: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  },
  original: {
    name: string
    dataType: string
    size: string
    unsigned?: boolean
    notNull: boolean
    primaryKey: boolean
    unique?: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }
) {
  return (
    Boolean(column.unsigned) === Boolean(original.unsigned) &&
    column.autoIncrement === original.autoIncrement &&
    column.defaultValue.trim() === original.defaultValue.trim() &&
    column.comment.trim() === original.comment.trim()
  )
}

function normalizeDbObjectKey(value: string) {
  return value.trim().toLowerCase()
}

function sameDbObjectList(left: string[], right: string[]) {
  const normalizedLeft = left.map(normalizeDbObjectKey).filter(Boolean)
  const normalizedRight = right.map(normalizeDbObjectKey).filter(Boolean)

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((item, index) => item === normalizedRight[index])
  )
}

function buildPrimaryKeyConstraintName(tableName: string) {
  const suffix = tableName
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")

  return `PK_${suffix || "table"}`
}

function quoteSqlServerConstraintIdentifier(constraintName: string) {
  const trimmed = constraintName.trim()
  const unwrapped =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1).replace(/]]/g, "]")
      : trimmed

  return quoteSqlServerIdentifier(unwrapped)
}

function buildSqlServerAlterColumnDefinition(
  connection: SavedConnection,
  column: {
    name: string
    dataType: string
    size: string
    unsigned?: boolean
    notNull: boolean
    primaryKey: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }
) {
  return buildCreateTableColumnDefinition(connection, {
    ...column,
    primaryKey: false,
    autoIncrement: false,
    defaultValue: "",
    comment: "",
  })
}

function buildSqlServerPrimaryKeyConstraintSql(
  constraintName: string,
  qualifiedTableName: string,
  columnNames: string[],
  sqlServerIndexType?: string
) {
  const columns = columnNames
    .map((columnName) => columnName.trim())
    .filter(Boolean)
    .map((columnName) => quoteSqlServerIdentifier(columnName))

  if (!columns.length) {
    throw new Error("Não foi possível recriar a chave primária sem colunas.")
  }

  const indexType = /^(CLUSTERED|NONCLUSTERED)$/i.test(sqlServerIndexType ?? "")
    ? ` ${sqlServerIndexType?.trim().toUpperCase()}`
    : ""

  return `ALTER TABLE ${qualifiedTableName} ADD CONSTRAINT ${quoteSqlServerIdentifier(
    constraintName
  )} PRIMARY KEY${indexType} (${columns.join(", ")})`
}

function buildSqlServerDropDefaultConstraintSql(qualifiedTableName: string, columnName: string) {
  const escapedQualifiedTableName = qualifiedTableName.replace(/'/g, "''")

  return `
DECLARE @constraintName sysname;
DECLARE @sql nvarchar(max);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
INNER JOIN sys.columns c
  ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'${escapedQualifiedTableName}')
  AND c.name = ${quoteSqlLiteral(columnName)};
IF @constraintName IS NOT NULL
BEGIN
  SET @sql = N'ALTER TABLE ${escapedQualifiedTableName} DROP CONSTRAINT [' + REPLACE(@constraintName, ']', ']]') + N']';
  EXEC sp_executesql @sql;
END
`.trim()
}

function supportsPostgreSqlIdentity(dataType: string) {
  return /^(SMALLINT|INTEGER|BIGINT)$/i.test(dataType.trim())
}

function isPostgreSqlColumnAlterInPlaceSupported(
  column: {
    name: string
    dataType: string
    size: string
    unsigned?: boolean
    notNull: boolean
    primaryKey: boolean
    unique?: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  },
  original: {
    name: string
    dataType: string
    size: string
    unsigned?: boolean
    notNull: boolean
    primaryKey: boolean
    unique?: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }
) {
  if (column.autoIncrement && !supportsPostgreSqlIdentity(column.dataType)) {
    return false
  }

  const defaultChanged = column.defaultValue.trim() !== original.defaultValue.trim()

  if (column.autoIncrement && original.autoIncrement && defaultChanged) {
    return false
  }

  return (
    column.dataType.trim().toUpperCase() === original.dataType.trim().toUpperCase() &&
    column.size.trim() === original.size.trim() &&
    Boolean(column.unsigned) === Boolean(original.unsigned) &&
    column.primaryKey === original.primaryKey &&
    Boolean(column.unique) === Boolean(original.unique) &&
    column.comment.trim() === original.comment.trim()
  )
}

function buildPostgreSqlAlterColumnStatements(
  qualifiedTableName: string,
  schemaName: string,
  tableName: string,
  column: {
    name: string
    dataType: string
    size: string
    notNull: boolean
    autoIncrement: boolean
    defaultValue: string
  },
  original: {
    name: string
    notNull: boolean
    autoIncrement: boolean
    defaultValue: string
  }
) {
  const statements: string[] = []
  const columnName = quoteIdentifier("postgresql", column.name)
  const defaultChanged = column.defaultValue.trim() !== original.defaultValue.trim()

  if (column.autoIncrement && !original.autoIncrement) {
    const sequenceName = buildPostgreSqlSequenceName(tableName, column.name)
    const qualifiedSequence = `${quoteIdentifier("postgresql", schemaName)}.${quoteIdentifier(
      "postgresql",
      sequenceName
    )}`

    statements.push(`CREATE SEQUENCE IF NOT EXISTS ${qualifiedSequence}`)
    statements.push(`ALTER TABLE ${qualifiedTableName} ALTER COLUMN ${columnName} DROP DEFAULT`)
    statements.push(
      `ALTER TABLE ${qualifiedTableName} ALTER COLUMN ${columnName} SET DEFAULT nextval(${quoteSqlLiteral(
        qualifiedSequence
      )}::regclass)`
    )
    statements.push(`ALTER TABLE ${qualifiedTableName} ALTER COLUMN ${columnName} SET NOT NULL`)
    statements.push(`ALTER SEQUENCE ${qualifiedSequence} OWNED BY ${qualifiedTableName}.${columnName}`)
    statements.push(buildPostgreSqlIdentitySequenceSyncSql(qualifiedTableName, column.name, columnName))
    return statements
  }

  if (!column.autoIncrement && original.autoIncrement) {
    statements.push(`ALTER TABLE ${qualifiedTableName} ALTER COLUMN ${columnName} DROP DEFAULT`)
  } else if (defaultChanged && !column.autoIncrement) {
    statements.push(
      column.defaultValue.trim()
        ? `ALTER TABLE ${qualifiedTableName} ALTER COLUMN ${columnName} SET DEFAULT ${sanitizeSqlExpression(
            column.defaultValue
          )}`
        : `ALTER TABLE ${qualifiedTableName} ALTER COLUMN ${columnName} DROP DEFAULT`
    )
  }

  if (column.notNull !== original.notNull) {
    statements.push(
      `ALTER TABLE ${qualifiedTableName} ALTER COLUMN ${columnName} ${
        column.notNull ? "SET NOT NULL" : "DROP NOT NULL"
      }`
    )
  }

  return statements
}

function buildPostgreSqlAddAutoIncrementColumnStatements(
  connection: SavedConnection,
  qualifiedTableName: string,
  schemaName: string,
  tableName: string,
  column: CreateTableColumnSpec
) {
  const sequenceName = buildPostgreSqlSequenceName(tableName, column.name)
  const qualifiedSequence = `${quoteIdentifier("postgresql", schemaName)}.${quoteIdentifier(
    "postgresql",
    sequenceName
  )}`
  const qualifiedColumn = `${qualifiedTableName}.${quoteIdentifier("postgresql", column.name)}`
  const defaultValue = `nextval(${quoteSqlLiteral(qualifiedSequence)}::regclass)`
  const columnDefinition = buildCreateTableColumnDefinition(connection, {
    ...column,
    autoIncrement: false,
    defaultValue,
    notNull: true,
  })

  return [
    `CREATE SEQUENCE IF NOT EXISTS ${qualifiedSequence}`,
    `ALTER TABLE ${qualifiedTableName} ADD COLUMN ${columnDefinition}`,
    `ALTER SEQUENCE ${qualifiedSequence} OWNED BY ${qualifiedColumn}`,
  ]
}

function buildPostgreSqlIdentitySequenceSyncSql(
  qualifiedTableName: string,
  rawColumnName: string,
  quotedColumnName: string
) {
  return `SELECT setval(pg_get_serial_sequence(${quoteSqlLiteral(qualifiedTableName)}, ${quoteSqlLiteral(
    rawColumnName
  )}), GREATEST(COALESCE((SELECT MAX(${quotedColumnName}) FROM ${qualifiedTableName}), 0) + 1, 1), false)`
}

function normalizeMySqlLikeQueryRows(rows: unknown[]): Array<Record<string, unknown>> {
  if (!rows.length) {
    return []
  }

  if (rows.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
    return rows as Array<Record<string, unknown>>
  }

  const firstRecordSet = rows.find(
    (row) =>
      Array.isArray(row) &&
      row.every((item) => item && typeof item === "object" && !Array.isArray(item))
  )

  return Array.isArray(firstRecordSet) ? (firstRecordSet as Array<Record<string, unknown>>) : []
}

function extractSqlServerRecordsetColumns(recordset: unknown) {
  if (!recordset || typeof recordset !== "object" || !("columns" in recordset)) {
    return []
  }

  const columns = (recordset as { columns?: unknown }).columns

  if (!columns || typeof columns !== "object") {
    return []
  }

  return Object.entries(columns)
    .sort(([, left], [, right]) => {
      const leftIndex = typeof left === "object" && left && "index" in left ? Number(left.index) : 0
      const rightIndex = typeof right === "object" && right && "index" in right ? Number(right.index) : 0

      return leftIndex - rightIndex
    })
    .map(([name]) => name)
    .filter(Boolean)
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
