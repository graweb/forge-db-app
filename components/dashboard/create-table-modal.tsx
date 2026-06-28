"use client"

import { useState } from "react"
import { Loader2, Plus, Table2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/helpers/utils"
import {
  buildCreateTableIndexDefinition,
  buildDropTableIndexSql,
  buildForeignKeyConstraintName,
  buildTableIndexName,
} from "@/helpers/create-table/shared"
import type {
  CreateTableColumnDraft,
  CreateTableDraft,
  CreateTableForeignKeyDraft,
  CreateTableIndexDraft,
  CreateTableModalProps,
} from "@/types/dashboard-modals"
import type { DatabaseStructureDatabase, SavedConnection, TableDetails } from "@/types/connections"

const typeOptions = [
  { value: "INTEGER", label: "integer" },
  { value: "INT", label: "int" },
  { value: "SMALLINT", label: "smallint" },
  { value: "TINYINT", label: "tinyint" },
  { value: "BIGINT", label: "bigint" },
  { value: "VARCHAR", label: "varchar" },
  { value: "TEXT", label: "text" },
  { value: "ENUM", label: "enum" },
  { value: "JSON", label: "json" },
  { value: "BLOB", label: "blob" },
  { value: "TIMESTAMP", label: "timestamp" },
  { value: "BOOLEAN", label: "boolean" },
  { value: "DECIMAL", label: "decimal" },
  { value: "FLOAT", label: "float" },
  { value: "DOUBLE", label: "double" },
  { value: "DATE", label: "date" },
]

function getColumnSizeConfig(dataType: string) {
  switch (dataType.trim().toUpperCase()) {
    case "BIGINT":
      return {
        placeholder: "20",
        defaultValue: "20",
        disabled: false,
      }
    case "ENUM":
      return {
        placeholder: "'ativo', 'inativo'",
        defaultValue: "",
        disabled: false,
      }
    case "DECIMAL":
    case "FLOAT":
    case "DOUBLE":
      return {
        placeholder: "10,2",
        defaultValue: "10,2",
        disabled: false,
      }
    case "BOOLEAN":
      return {
        placeholder: "",
        defaultValue: "",
        disabled: true,
      }
    default:
      return {
        placeholder: "100",
        defaultValue: "",
        disabled: false,
      }
  }
}

function createColumnDraft(partial?: Partial<CreateTableColumnDraft>): CreateTableColumnDraft {
  return {
    id:
      partial?.id ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    sourceName: partial?.sourceName,
    name: partial?.name ?? "",
    dataType: partial?.dataType ?? "VARCHAR",
    size: partial?.size ?? "",
    unsigned: partial?.unsigned ?? false,
    notNull: partial?.notNull ?? false,
    primaryKey: partial?.primaryKey ?? false,
    unique: partial?.unique ?? false,
    autoIncrement: partial?.autoIncrement ?? false,
    defaultValue: partial?.defaultValue ?? "",
    comment: partial?.comment ?? "",
  }
}

function getDefaultColumn(databaseType: Exclude<SavedConnection["databaseType"], "sqlite"> | "sqlite") {
  switch (databaseType) {
    case "postgresql":
      return {
        name: "id",
        dataType: "INTEGER",
        size: "",
        notNull: true,
        primaryKey: true,
        autoIncrement: true,
        defaultValue: "",
        comment: "Identificador único",
      }
    case "sqlserver":
      return {
        name: "id",
        dataType: "INT",
        size: "",
        notNull: true,
        primaryKey: true,
        autoIncrement: true,
        defaultValue: "",
        comment: "Identificador único",
      }
    case "sqlite":
      return {
        name: "id",
        dataType: "INTEGER",
        size: "",
        notNull: true,
        primaryKey: true,
        autoIncrement: true,
        defaultValue: "",
        comment: "Identificador único",
      }
    default:
      return {
        name: "id",
        dataType: "INT",
        size: "",
        notNull: true,
        primaryKey: true,
        autoIncrement: true,
        defaultValue: "",
        comment: "Identificador único",
      }
  }
}

function createForeignKeyDraft(
  partial?: Partial<CreateTableForeignKeyDraft>
): CreateTableForeignKeyDraft {
  return {
    id:
      partial?.id ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    sourceColumn: partial?.sourceColumn ?? "",
    referencedSchemaName: partial?.referencedSchemaName ?? "",
    referencedTableName: partial?.referencedTableName ?? "",
    referencedColumnName: partial?.referencedColumnName ?? "",
    onDelete: partial?.onDelete ?? "",
    onUpdate: partial?.onUpdate ?? "",
  }
}

function createIndexDraft(partial?: Partial<CreateTableIndexDraft>): CreateTableIndexDraft {
  return {
    id:
      partial?.id ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    sourceName: partial?.sourceName,
    name: partial?.name ?? "",
    columnName: partial?.columnName ?? partial?.columns?.[0] ?? "",
    columns: partial?.columns ?? (partial?.columnName ? [partial.columnName] : []),
    unique: partial?.unique ?? false,
    primaryKey: partial?.primaryKey ?? false,
    removable: partial?.removable ?? true,
  }
}

function createIndexDraftFromDefinition(
  definition: TableDetails["indexes"][number]
): CreateTableIndexDraft {
  const firstColumn = definition.columns[0] ?? ""

  return createIndexDraft({
    sourceName: definition.name,
    name: definition.name,
    columnName: firstColumn,
    columns: definition.columns,
    unique: definition.unique,
    primaryKey: definition.primaryKey,
    removable: !definition.primaryKey,
  })
}

function createPrimaryIndexDraft(columnName: string, indexName: string) {
  return createIndexDraft({
    sourceName: indexName,
    name: indexName,
    columnName,
    columns: [columnName],
    unique: true,
    primaryKey: true,
    removable: false,
  })
}

type ReferenceTableOption = {
  schemaName: string
  tableName: string
  label: string
  primaryKeyColumns: string[]
  primaryKeyColumnDetails: Record<string, { dataType: string; size: string; unsigned?: boolean }>
}

type ColumnTypeSignature = {
  dataType: string
  size: string
  unsigned?: boolean
}

function normalizeColumnTypeSignature(column?: ColumnTypeSignature | null) {
  const dataType = column?.dataType.trim().toUpperCase() || ""
  const unsigned = Boolean(column?.unsigned)

  switch (dataType) {
    case "INTEGER":
      return {
        dataType: "INT",
        size: column?.size.trim() ?? "",
        unsigned,
      }
    case "NUMERIC":
      return {
        dataType: "DECIMAL",
        size: column?.size.trim() ?? "",
        unsigned,
      }
    default:
      return {
        dataType,
        size: column?.size.trim() ?? "",
        unsigned,
      }
  }
}

function formatColumnTypeSignature(column?: ColumnTypeSignature | null) {
  if (!column) {
    return ""
  }

  const normalized = normalizeColumnTypeSignature(column)
  const type = normalized.size ? `${normalized.dataType}(${normalized.size})` : normalized.dataType
  return `${type}${normalized.unsigned ? " UNSIGNED" : ""}`
}

function areForeignKeyColumnTypesCompatible(
  source?: ColumnTypeSignature | null,
  referenced?: ColumnTypeSignature | null
) {
  const normalizedSource = normalizeColumnTypeSignature(source)
  const normalizedReferenced = normalizeColumnTypeSignature(referenced)

  return Boolean(
    normalizedSource.dataType &&
      normalizedSource.dataType === normalizedReferenced.dataType &&
      normalizedSource.unsigned === normalizedReferenced.unsigned
  )
}

function getReferenceTableOptions(
  database?: DatabaseStructureDatabase | null,
  currentSchemaName?: string,
  currentTableName?: string
) {
  if (!database) {
    return []
  }

  const options: ReferenceTableOption[] = []
  const schemaAware = database.schemas.length > 0

  const addGroups = (schemaName: string, groups: DatabaseStructureDatabase["groups"]) => {
    const tableGroup = groups.find((group) => group.label.toLowerCase().includes("tabel"))

    if (!tableGroup) {
      return
    }

    for (const tableName of tableGroup.items) {
      if (schemaName === currentSchemaName && tableName === currentTableName) {
        continue
      }

      const columnDetails = tableGroup.columnsDetailsByItem?.[tableName] ?? []
      const primaryKeyColumns = columnDetails
        .filter((column) => Boolean(column.primaryKey))
        .map((column) => column.name)
      const primaryKeyColumnDetails = Object.fromEntries(
        columnDetails
          .filter((column) => Boolean(column.primaryKey))
          .map((column) => [
            column.name,
            {
              dataType: column.dataType,
              size: column.size,
              unsigned: column.unsigned,
            },
          ])
      )

      if (!primaryKeyColumns.length) {
        continue
      }

      options.push({
        schemaName,
        tableName,
        label:
          schemaAware && schemaName && schemaName !== currentSchemaName
            ? `${schemaName}.${tableName}`
            : tableName,
        primaryKeyColumns,
        primaryKeyColumnDetails,
      })
    }
  }

  if (database.schemas.length) {
    for (const schema of database.schemas) {
      addGroups(schema.name, schema.groups)
    }
  } else {
    addGroups(database.name, database.groups)
  }

  return options
}

function getForeignKeyCompatibilityError(
  form: CreateTableDraft,
  database?: DatabaseStructureDatabase | null
) {
  if (!database) {
    return null
  }

  const referenceTables = getReferenceTableOptions(database, form.schemaName, form.tableName)
  const columnsByName = new Map(
    form.columns.map((column) => [column.name.trim(), column] as const).filter(([name]) => Boolean(name))
  )

  for (const foreignKey of form.foreignKeys) {
    const sourceColumnName = foreignKey.sourceColumn.trim()

    if (!sourceColumnName || !foreignKey.referencedTableName.trim() || !foreignKey.referencedColumnName.trim()) {
      continue
    }

    const sourceColumn = columnsByName.get(sourceColumnName)
    if (!sourceColumn) {
      continue
    }

    const referenceTable = referenceTables.find(
      (option) =>
        option.schemaName === (foreignKey.referencedSchemaName.trim() || form.schemaName) &&
        option.tableName === foreignKey.referencedTableName.trim()
    )
    const referencedColumn = referenceTable?.primaryKeyColumnDetails[foreignKey.referencedColumnName.trim()]

    if (
      referenceTable &&
      referencedColumn &&
      !areForeignKeyColumnTypesCompatible(sourceColumn, referencedColumn)
    ) {
      return `A chave estrangeira ${sourceColumnName} -> ${referenceTable.label}.${foreignKey.referencedColumnName.trim()} não pode ser criada porque ${formatColumnTypeSignature(sourceColumn)} é incompatível com ${formatColumnTypeSignature(referencedColumn)}. Ajuste o tipo da coluna de origem para ser igual ao da coluna referenciada.`
    }
  }

  return null
}

function getReferenceColumnType(
  referenceTable: ReferenceTableOption | undefined,
  referencedColumnName: string
) {
  if (!referenceTable) {
    return null
  }

  const columnDetails = referenceTable.primaryKeyColumnDetails[referencedColumnName.trim()]
  if (!columnDetails) {
    return null
  }

  return {
    dataType: columnDetails.dataType,
    size: columnDetails.size,
    unsigned: columnDetails.unsigned,
  }
}

function applyForeignKeySourceColumnSuggestion(
  columns: CreateTableColumnDraft[],
  foreignKey: CreateTableForeignKeyDraft,
  referenceTable: ReferenceTableOption | undefined
) {
  const sourceColumnName = foreignKey.sourceColumn.trim()
  const referencedColumnType = getReferenceColumnType(referenceTable, foreignKey.referencedColumnName)

  if (!sourceColumnName || !referencedColumnType) {
    return columns
  }

  return columns.map((column) =>
    column.name.trim() === sourceColumnName
      ? {
          ...column,
          dataType: referencedColumnType.dataType,
          size: referencedColumnType.size,
          unsigned: referencedColumnType.unsigned,
        }
      : column
  )
}

function getCompatibleSourceColumnName(
  columns: CreateTableColumnDraft[],
  referenceTable: ReferenceTableOption | undefined,
  referencedColumnName?: string,
  currentSourceColumnName?: string
) {
  const currentSource = currentSourceColumnName?.trim() ?? ""
  const referencedType = getReferenceColumnType(
    referenceTable,
    referencedColumnName ?? referenceTable?.primaryKeyColumns[0] ?? ""
  )

  if (!referencedType) {
    return currentSource
  }

  const currentColumn = columns.find((column) => column.name.trim() === currentSource)
  if (
    currentColumn &&
    areForeignKeyColumnTypesCompatible(currentColumn, referencedType)
  ) {
    return currentSource
  }

  const compatibleColumn = columns.find((column) =>
    column.name.trim() &&
    areForeignKeyColumnTypesCompatible(column, referencedType)
  )

  return compatibleColumn?.name.trim() ?? currentSource
}

function parseForeignKeySummary(value: string) {
  const match = value.trim().match(/^(?:(.+?):\s*)?(.+?)\s*->\s*(.+)$/)

  if (!match) {
    return null
  }

  const referencedWithActions = match[3].trim()
  const actionIndex = referencedWithActions.search(/\s+ON\s+(DELETE|UPDATE)\s+/i)
  const referenced = (actionIndex >= 0 ? referencedWithActions.slice(0, actionIndex) : referencedWithActions).trim()
  const actions = actionIndex >= 0 ? referencedWithActions.slice(actionIndex).trim() : ""
  const lastDot = referenced.lastIndexOf(".")
  const deleteMatch = actions.match(/\bON DELETE\s+(.+?)(?=\s+ON UPDATE\s+|$)/i)
  const updateMatch = actions.match(/\bON UPDATE\s+(.+)$/i)

  return {
    constraintName: match[1]?.trim() ?? "",
    sourceColumn: match[2].trim(),
    referencedSchemaName: "",
    referencedTableName: lastDot >= 0 ? referenced.slice(0, lastDot).trim() : referenced,
    referencedColumnName: lastDot >= 0 ? referenced.slice(lastDot + 1).trim() : "",
    onDelete: deleteMatch?.[1]?.trim() ?? "",
    onUpdate: updateMatch?.[1]?.trim() ?? "",
  }
}

function getInitialDraft(
  connection: SavedConnection,
  mode: "create" | "edit",
  schemaName?: string,
  schemaOptions?: string[],
  table?: TableDetails | null,
  database?: DatabaseStructureDatabase | null
): CreateTableDraft {
  const referenceTables = getReferenceTableOptions(database, schemaName, table?.tableName)

  if (mode === "edit" && table) {
    const defaultSchema = table.schemaName || schemaName?.trim() || "public"
    const foreignKeys = table.foreignKeys
      .map((foreignKey) => parseForeignKeySummary(foreignKey))
      .filter((foreignKey): foreignKey is NonNullable<ReturnType<typeof parseForeignKeySummary>> => Boolean(foreignKey))
      .map((foreignKey) => {
        const matchedReference = referenceTables.find((option) =>
          option.tableName === foreignKey.referencedTableName &&
          option.primaryKeyColumns.includes(foreignKey.referencedColumnName)
        )

        return createForeignKeyDraft({
          sourceColumn: foreignKey.sourceColumn,
          referencedSchemaName: matchedReference?.schemaName || defaultSchema,
          referencedTableName: matchedReference?.tableName || foreignKey.referencedTableName,
          referencedColumnName: matchedReference
            ? foreignKey.referencedColumnName
            : foreignKey.referencedColumnName,
          onDelete: foreignKey.onDelete,
          onUpdate: foreignKey.onUpdate,
        })
      })

    return {
      schemaName: defaultSchema,
      tableName: table.tableName,
      comment: table.comment || "",
      columns: table.columns.length
        ? table.columns.map((column) =>
            createColumnDraft({ ...column, id: column.name, sourceName: column.name })
          )
        : [createColumnDraft(getDefaultColumn(connection.databaseType))],
      foreignKeys: foreignKeys.length ? foreignKeys : [],
      indexes: table.indexes.length
        ? table.indexes.map((index) => createIndexDraftFromDefinition(index))
        : table.columns.some((column) => column.primaryKey)
          ? table.columns
              .filter((column) => column.primaryKey)
              .map((column) => createPrimaryIndexDraft(column.name, "PRIMARY"))
          : [],
    }
  }

  const defaultSchema =
    schemaName?.trim() || schemaOptions?.[0] || (connection.databaseType === "sqlite" ? "main" : "public")

  return {
    schemaName: defaultSchema,
    tableName: "",
    comment: "",
    columns: [createColumnDraft(getDefaultColumn(connection.databaseType))],
    foreignKeys: [],
    indexes: [createPrimaryIndexDraft("id", "PRIMARY")],
  }
}

function getDatabaseTypeDescription(databaseType: SavedConnection["databaseType"]) {
  switch (databaseType) {
    case "mysql":
      return "MySQL usa o database como schema da tabela."
    case "mariadb":
      return "MariaDB usa o database como schema da tabela."
    case "postgresql":
      return "PostgreSQL permite escolher schema da tabela."
    case "sqlserver":
      return "SQL Server permite criar a tabela em um schema existente."
    case "sqlite":
      return "SQLite cria a tabela diretamente no arquivo selecionado."
  }
}

function createEmptyDraft(
  connection: SavedConnection,
  schemaName?: string,
  schemaOptions?: string[]
): CreateTableDraft {
  const defaultSchema = schemaName?.trim() || schemaOptions?.[0] || "public"

  return {
    schemaName: defaultSchema,
    tableName: "",
    comment: "",
    columns: [createColumnDraft(getDefaultColumn(connection.databaseType))],
    foreignKeys: [],
    indexes: [createPrimaryIndexDraft("id", "PRIMARY")],
  }
}

function MetadataList({
  items,
  emptyText,
}: {
  items: string[]
  emptyText: string
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-white/45">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/75"
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function quotePreviewIdentifier(connection: SavedConnection, value: string) {
  const name = value.trim()
  if (!name) {
    return name
  }

  if (connection.databaseType === "sqlserver") {
    return `[${name.replace(/]/g, "]]")}]`
  }

  if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
    return `\`${name.replace(/`/g, "``")}\``
  }

  return `"${name.replace(/"/g, '""')}"`
}

function quotePreviewSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function buildColumnPreview(connection: SavedConnection, column: CreateTableColumnDraft) {
  const parts = [quotePreviewIdentifier(connection, column.name)]
  const typeWithSize =
    column.size &&
    /^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|CHAR|NCHAR|VARCHAR|NVARCHAR|BINARY|VARBINARY|DECIMAL|NUMERIC|NUMBER|ENUM|FLOAT|DOUBLE)$/.test(
      column.dataType
    )
      ? `${column.dataType}(${column.size})`
      : column.dataType

  if (connection.databaseType === "sqlite" && column.autoIncrement && column.primaryKey) {
    return `${parts[0]} INTEGER PRIMARY KEY AUTOINCREMENT`
  }

  parts.push(typeWithSize)

  if (
    column.unsigned &&
    (connection.databaseType === "mysql" || connection.databaseType === "mariadb") &&
    /^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|NUMBER|FLOAT|DOUBLE)$/i.test(
      column.dataType
    )
  ) {
    parts.push("UNSIGNED")
  }

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

  if (column.defaultValue.trim()) {
    parts.push(`DEFAULT ${column.defaultValue}`)
  }

  if (column.primaryKey && !(connection.databaseType === "sqlite" && column.autoIncrement)) {
    parts.push("PRIMARY KEY")
  }

  return parts.join(" ")
}

function buildQualifiedTableName(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  databaseName?: string
) {
  const schema = quotePreviewIdentifier(connection, schemaName)
  const table = quotePreviewIdentifier(connection, tableName)

  if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
    return `${quotePreviewIdentifier(connection, databaseName || connection.databaseName)}.${table}`
  }

  if (connection.databaseType === "sqlite") {
    return table
  }

  if (connection.databaseType === "sqlserver") {
    return `${schema}.${table}`
  }

  return `${schema}.${table}`
}

function buildForeignKeyPreviewDefinition(
  connection: SavedConnection,
  tableName: string,
  foreignKey: CreateTableForeignKeyDraft,
  index: number,
  defaultSchemaName: string
) {
  const suffix = `${tableName}_${foreignKey.sourceColumn}_${foreignKey.referencedTableName}_${foreignKey.referencedColumnName}_${index}`
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")

  const constraintName =
    connection.databaseType === "sqlserver"
      ? `[fk_${suffix}]`
      : connection.databaseType === "postgresql"
        ? `"fk_${suffix.replace(/"/g, '""')}"`
        : `\`fk_${suffix.replace(/`/g, "``")}\``
  const sourceColumn = quotePreviewIdentifier(connection, foreignKey.sourceColumn)
  const referencedSchemaName = foreignKey.referencedSchemaName.trim() || defaultSchemaName
  const referencedTable = quotePreviewIdentifier(connection, foreignKey.referencedTableName)
  const referencedColumn = quotePreviewIdentifier(connection, foreignKey.referencedColumnName)
  const referencedQualifiedTable =
    connection.databaseType === "sqlite"
      ? referencedTable
      : `${quotePreviewIdentifier(connection, referencedSchemaName)}.${referencedTable}`
  const actions = [foreignKey.onDelete.trim(), foreignKey.onUpdate.trim()]
    .map((action, actionIndex) => {
      if (!action) {
        return null
      }

      return `${actionIndex === 0 ? "ON DELETE" : "ON UPDATE"} ${action}`
    })
    .filter(Boolean)
    .join(" ")

  return `CONSTRAINT ${constraintName} FOREIGN KEY (${sourceColumn}) REFERENCES ${referencedQualifiedTable} (${referencedColumn})${actions ? ` ${actions}` : ""}`
}

function getNextGeneratedIndexName(
  tableName: string,
  columnNames: string[] | string,
  currentIndex: number,
  indexes: Array<{ name: string }>
) {
  const baseName = buildTableIndexName(tableName, columnNames, currentIndex)
  const usedNames = new Set(
    indexes
      .map((index, indexPosition) => (indexPosition === currentIndex ? "" : index.name.trim().toLowerCase()))
      .filter(Boolean)
  )

  if (!usedNames.has(baseName.toLowerCase())) {
    return baseName
  }

  let suffix = 2
  let candidate = `${baseName}_${suffix}`

  while (usedNames.has(candidate.toLowerCase())) {
    suffix += 1
    candidate = `${baseName}_${suffix}`
  }

  return candidate
}

function normalizeIndexDrafts(form: CreateTableDraft) {
  return form.indexes
    .map((index) => ({
      ...index,
      name: index.name.trim(),
      columnName: index.columnName.trim(),
      columns: index.columns.map((column) => column.trim()).filter(Boolean),
    }))
    .filter((index) => index.primaryKey || index.columns.length > 0)
    .map((index, currentIndex) => {
      const columnNames = index.columns.length ? index.columns : index.columnName ? [index.columnName] : []
      const name = index.name.trim()
      const generatedName = name || getNextGeneratedIndexName(form.tableName, columnNames, currentIndex, form.indexes)

      return {
        name: generatedName,
        columns: columnNames,
        unique: Boolean(index.unique),
        primaryKey: Boolean(index.primaryKey),
      }
    })
}

function buildIndexPreviewDefinition(
  connection: SavedConnection,
  tableName: string,
  index: { name: string; columns: string[]; unique: boolean },
  indexNumber: number,
  defaultSchemaName: string
) {
  return buildCreateTableIndexDefinition(
    connection,
    tableName,
    index,
    indexNumber,
    defaultSchemaName
  )
}

function normalizeSavedIndexes(form: CreateTableDraft) {
  return normalizeIndexDrafts(form).filter((index) => !index.primaryKey)
}

function normalizeForeignKeyDrafts(form: CreateTableDraft) {
  return form.foreignKeys
    .filter(
      (foreignKey) =>
        foreignKey.sourceColumn.trim() &&
        foreignKey.referencedTableName.trim() &&
        foreignKey.referencedColumnName.trim()
    )
    .map((foreignKey) => ({
      ...foreignKey,
      referencedSchemaName: foreignKey.referencedSchemaName.trim(),
      referencedTableName: foreignKey.referencedTableName.trim(),
      referencedColumnName: foreignKey.referencedColumnName.trim(),
      onDelete: foreignKey.onDelete.trim(),
      onUpdate: foreignKey.onUpdate.trim(),
      sourceColumn: foreignKey.sourceColumn.trim(),
    }))
}

function normalizeForeignKeySet(
  foreignKeys: Array<{
    sourceColumn: string
    referencedSchemaName: string
    referencedTableName: string
    referencedColumnName: string
    onDelete?: string
    onUpdate?: string
  }>,
  defaultSchemaName: string
) {
  return foreignKeys
    .map((foreignKey) => ({
      sourceColumn: foreignKey.sourceColumn.trim().toLowerCase(),
      referencedSchemaName: (foreignKey.referencedSchemaName.trim() || defaultSchemaName).toLowerCase(),
      referencedTableName: foreignKey.referencedTableName.trim().toLowerCase(),
      referencedColumnName: foreignKey.referencedColumnName.trim().toLowerCase(),
      onDelete: (foreignKey.onDelete ?? "").trim().toLowerCase(),
      onUpdate: (foreignKey.onUpdate ?? "").trim().toLowerCase(),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

const foreignKeyActionOptions = [
  { value: "", label: "Sem ação" },
  { value: "CASCADE", label: "CASCADE" },
  { value: "RESTRICT", label: "RESTRICT" },
  { value: "NO ACTION", label: "NO ACTION" },
  { value: "SET NULL", label: "SET NULL" },
  { value: "SET DEFAULT", label: "SET DEFAULT" },
]

function hasForeignKeyChanges(form: CreateTableDraft, table?: TableDetails | null) {
  if (!table) {
    return false
  }

  const original = normalizeForeignKeySet(
    table.foreignKeys
      .map((value) => parseForeignKeySummary(value))
      .filter(
        (
          foreignKey
        ): foreignKey is NonNullable<ReturnType<typeof parseForeignKeySummary>> => Boolean(foreignKey)
      )
      .map((foreignKey) => ({
        sourceColumn: foreignKey.sourceColumn,
        referencedSchemaName: table.schemaName,
        referencedTableName: foreignKey.referencedTableName,
        referencedColumnName: foreignKey.referencedColumnName,
        onDelete: foreignKey.onDelete,
        onUpdate: foreignKey.onUpdate,
      })),
    table.schemaName
  )
  const next = normalizeForeignKeySet(normalizeForeignKeyDrafts(form), form.schemaName)

  return JSON.stringify(original) !== JSON.stringify(next)
}

function buildMySqlLikeAlterColumnPreview(
  connection: SavedConnection,
  column: CreateTableColumnDraft
) {
  const sourceName = (column.sourceName || "").trim()
  const definition = buildColumnPreview(connection, column)

  if (sourceName && sourceName !== column.name.trim()) {
    return `CHANGE COLUMN ${quotePreviewIdentifier(connection, sourceName)} ${definition}`
  }

  return `MODIFY COLUMN ${definition}`
}

function buildCreatePreviewStatements(
  connection: SavedConnection,
  form: CreateTableDraft,
  databaseName?: string
) {
  const qualifiedTableName = buildQualifiedTableName(
    connection,
    form.schemaName,
    form.tableName,
    databaseName
  )
  const columns = form.columns
    .filter((column) => column.name.trim())
    .map((column) => `  ${buildColumnPreview(connection, column)}`)
  const foreignKeys = normalizeForeignKeyDrafts(form)
  const foreignKeyDefinitions = foreignKeys.map((foreignKey, index) =>
    `  ${buildForeignKeyPreviewDefinition(connection, form.tableName, foreignKey, index, form.schemaName)}`
  )
  const indexes = normalizeSavedIndexes(form)
  const indexDefinitions = indexes.map((index, indexNumber) =>
    `  ${buildIndexPreviewDefinition(connection, form.tableName, index, indexNumber, form.schemaName)}`
  )

  const statements: string[] = []

  if (connection.databaseType === "sqlserver") {
    const dbName = quotePreviewIdentifier(connection, databaseName || connection.databaseName)
    statements.push(`USE ${dbName};`)
    statements.push("GO")
    if (form.schemaName && form.schemaName !== "dbo") {
      statements.push(
        `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = ${quotePreviewSqlLiteral(form.schemaName)})`
      )
      statements.push(
        `EXEC('CREATE SCHEMA ${quotePreviewIdentifier(connection, form.schemaName).replace(/'/g, "''")}')`
      )
      statements.push("GO")
    }
  }

  if (connection.databaseType === "postgresql" && form.schemaName && form.schemaName !== "public") {
    statements.push(`CREATE SCHEMA IF NOT EXISTS ${quotePreviewIdentifier(connection, form.schemaName)};`)
  }

  if (form.comment.trim() && (connection.databaseType === "mysql" || connection.databaseType === "mariadb")) {
    statements.push(`CREATE TABLE IF NOT EXISTS ${qualifiedTableName} (`)
    statements.push(...columns, ...foreignKeyDefinitions)
    statements.push(`) COMMENT=${quotePreviewSqlLiteral(form.comment)};`)
  }

  if (!(form.comment.trim() && (connection.databaseType === "mysql" || connection.databaseType === "mariadb"))) {
    statements.push(
      `CREATE TABLE ${connection.databaseType === "sqlite" ? quotePreviewIdentifier(connection, form.tableName) : qualifiedTableName} (`
    )
    statements.push(...columns, ...foreignKeyDefinitions)
    statements.push(");")
  }

  for (const indexDefinition of indexDefinitions) {
    statements.push(indexDefinition + ";")
  }

  if (form.comment.trim() && connection.databaseType === "postgresql") {
    statements.push(
      `COMMENT ON TABLE ${qualifiedTableName} IS ${quotePreviewSqlLiteral(form.comment)};`
    )
  }

  return statements
}

function buildEditPreviewStatements(
  connection: SavedConnection,
  form: CreateTableDraft,
  table?: TableDetails | null,
  databaseName?: string
) {
  const originalTableName = table?.tableName || form.tableName
  const originalSchemaName = table?.schemaName || form.schemaName
  const originalQualified = buildQualifiedTableName(
    connection,
    originalSchemaName,
    originalTableName,
    databaseName
  )
  const nextQualified = buildQualifiedTableName(
    connection,
    form.schemaName,
    form.tableName,
    databaseName
  )
  const addedColumns = form.columns.filter(
    (column) => column.name.trim() && !(column.sourceName || "").trim()
  )
  const commentChanged = form.comment.trim() !== (table?.comment ?? "").trim()
  const tableNameChanged = form.tableName.trim() !== originalTableName.trim()
  const removedColumns = table
    ? table.columns.filter(
        (column) =>
          !form.columns.some(
            (nextColumn) => (nextColumn.sourceName || "").trim() === column.name.trim()
          )
      )
    : []
  const modifiedColumns = form.columns.filter((column) => {
    const sourceName = (column.sourceName || "").trim()

    if (!sourceName) {
      return false
    }

    const originalColumn = table?.columns.find((item) => item.name.trim() === sourceName)

    if (!originalColumn) {
      return false
    }

    return (
      column.name.trim() !== originalColumn.name.trim() ||
      column.dataType.trim().toUpperCase() !== originalColumn.dataType.trim().toUpperCase() ||
      column.size.trim() !== originalColumn.size.trim() ||
      Boolean(column.unsigned) !== Boolean(originalColumn.unsigned) ||
      column.notNull !== originalColumn.notNull ||
      column.primaryKey !== originalColumn.primaryKey ||
      column.autoIncrement !== originalColumn.autoIncrement ||
      column.defaultValue.trim() !== originalColumn.defaultValue.trim() ||
      column.comment.trim() !== originalColumn.comment.trim()
    )
  })
  const originalForeignKeys = table
    ? table.foreignKeys
        .map((foreignKey) => parseForeignKeySummary(foreignKey))
        .filter(
          (foreignKey): foreignKey is NonNullable<ReturnType<typeof parseForeignKeySummary>> =>
            Boolean(foreignKey)
        )
        .map((foreignKey) => ({
          sourceColumn: foreignKey.sourceColumn,
          referencedSchemaName: originalSchemaName,
          referencedTableName: foreignKey.referencedTableName,
          referencedColumnName: foreignKey.referencedColumnName,
          onDelete: foreignKey.onDelete,
          onUpdate: foreignKey.onUpdate,
          constraintName: foreignKey.constraintName,
        }))
    : []
  const nextForeignKeysDraft = normalizeForeignKeyDrafts(form)
  const originalForeignKeyKeys = normalizeForeignKeySet(originalForeignKeys, originalSchemaName)
  const nextForeignKeyKeys = normalizeForeignKeySet(nextForeignKeysDraft, form.schemaName)
  const originalForeignKeyKeySet = new Set(originalForeignKeyKeys)
  const foreignKeysToDrop = originalForeignKeys.filter((foreignKey) => {
    const normalizedKey = normalizeForeignKeySet([foreignKey], originalSchemaName)[0]
    return !nextForeignKeyKeys.includes(normalizedKey)
  })
  const foreignKeysToAdd = nextForeignKeysDraft.filter((foreignKey) => {
    const normalizedKey = normalizeForeignKeySet([foreignKey], form.schemaName)[0]
    return !originalForeignKeyKeySet.has(normalizedKey)
  })
  const foreignKeyChanged = hasForeignKeyChanges(form, table)
  const rebuildSensitiveChanges = hasRebuildSensitiveChanges(form, table)
  const isMySqlLike = connection.databaseType === "mysql" || connection.databaseType === "mariadb"
  const foreignKeyCanAlter =
    isMySqlLike && !rebuildSensitiveChanges && removedColumns.length === 0
  const indexes = normalizeSavedIndexes(form)
  const originalIndexes = table?.indexes.filter((index) => !index.primaryKey) ?? []
  const originalIndexMap = new Map(
    originalIndexes.map((index) => [index.name.trim().toLowerCase(), index] as const)
  )
  const nextIndexMap = new Map(indexes.map((index) => [index.name.trim().toLowerCase(), index] as const))
  const indexesToDrop = originalIndexes.filter((index) => {
    const nextIndex = nextIndexMap.get(index.name.trim().toLowerCase())

    if (!nextIndex) {
      return true
    }

    return (
      nextIndex.unique !== index.unique ||
      JSON.stringify(nextIndex.columns.map((column) => column.trim().toLowerCase())) !==
        JSON.stringify(index.columns.map((column) => column.trim().toLowerCase()))
    )
  })
  const indexesToAdd = indexes.filter((index) => {
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
  const indexStatements = indexesToAdd.map((index, indexNumber) =>
    buildIndexPreviewDefinition(connection, form.tableName, index, indexNumber, form.schemaName)
  )
  const requiresRebuild =
    !isMySqlLike &&
    ((connection.databaseType === "sqlite" && removedColumns.length > 0) ||
      rebuildSensitiveChanges ||
      (foreignKeyChanged && !foreignKeyCanAlter))

  if (!requiresRebuild) {
    const statements: string[] = []
    const statementsTarget = originalQualified

    if (connection.databaseType === "sqlserver") {
      const dbName = quotePreviewIdentifier(connection, databaseName || connection.databaseName)
      statements.push(`USE ${dbName};`, "GO")
    }

    for (const column of addedColumns) {
      const addColumnSql =
        connection.databaseType === "sqlserver"
          ? `ALTER TABLE ${statementsTarget} ADD ${buildColumnPreview(connection, column)};`
          : `ALTER TABLE ${statementsTarget} ADD COLUMN ${buildColumnPreview(connection, column)};`
      statements.push(addColumnSql)
    }

    if (isMySqlLike) {
      for (const column of modifiedColumns) {
        statements.push(
          `ALTER TABLE ${statementsTarget} ${buildMySqlLikeAlterColumnPreview(connection, column)};`
        )
      }
    }

    if (commentChanged) {
      if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
        statements.push(`ALTER TABLE ${statementsTarget} COMMENT=${quotePreviewSqlLiteral(form.comment)};`)
      } else if (connection.databaseType === "postgresql") {
        statements.push(`COMMENT ON TABLE ${statementsTarget} IS ${quotePreviewSqlLiteral(form.comment)};`)
      }
    }

    if (isMySqlLike && modifiedColumns.length && originalForeignKeys.length) {
      for (const foreignKey of originalForeignKeys) {
        const constraintName =
          foreignKey.constraintName ||
          buildForeignKeyConstraintName(connection, originalTableName, foreignKey, 0)
        statements.push(
          `ALTER TABLE ${statementsTarget} DROP FOREIGN KEY ${quotePreviewIdentifier(
            connection,
            constraintName
          )};`
        )
      }
    } else if (foreignKeyCanAlter && foreignKeysToDrop.length) {
      for (const foreignKey of foreignKeysToDrop) {
        const constraintName =
          foreignKey.constraintName ||
          buildForeignKeyConstraintName(connection, originalTableName, foreignKey, 0)
        statements.push(
          `ALTER TABLE ${statementsTarget} DROP FOREIGN KEY ${quotePreviewIdentifier(
            connection,
            constraintName
          )};`
        )
      }
    }

    if (isMySqlLike && modifiedColumns.length && nextForeignKeysDraft.length) {
      for (let index = 0; index < nextForeignKeysDraft.length; index += 1) {
        const foreignKey = nextForeignKeysDraft[index]
        statements.push(
          `ALTER TABLE ${statementsTarget} ADD ${buildForeignKeyPreviewDefinition(
            connection,
            originalTableName,
            foreignKey,
            index,
            form.schemaName
          )};`
        )
      }
    } else if (foreignKeyCanAlter && foreignKeysToAdd.length) {
      for (let index = 0; index < foreignKeysToAdd.length; index += 1) {
        const foreignKey = foreignKeysToAdd[index]
        statements.push(
          `ALTER TABLE ${statementsTarget} ADD ${buildForeignKeyPreviewDefinition(
            connection,
            originalTableName,
            foreignKey,
            index,
            form.schemaName
          )};`
        )
      }
    }

    for (const column of removedColumns) {
      statements.push(
        `ALTER TABLE ${statementsTarget} DROP COLUMN ${quotePreviewIdentifier(connection, column.name)};`
      )
    }

    if (tableNameChanged) {
      if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
        statements.push(`RENAME TABLE ${originalQualified} TO ${nextQualified};`)
      } else if (connection.databaseType === "sqlserver") {
        statements.push(
          `EXEC sp_rename ${quotePreviewSqlLiteral(`${originalSchemaName}.${originalTableName}`)}, ${quotePreviewSqlLiteral(
            form.tableName
          )};`
        )
      } else {
        statements.push(`ALTER TABLE ${originalQualified} RENAME TO ${quotePreviewIdentifier(connection, form.tableName)};`)
      }
    }

    for (const index of indexesToDrop) {
      statements.push(
        `${buildDropTableIndexSql(connection, originalSchemaName, originalTableName, index.name)};`
      )
    }

    for (const indexDefinition of indexStatements) {
      statements.push(`${indexDefinition};`)
    }

    return statements.length ? statements : ["-- Nenhuma alteração detectada."]
  }

  const tempTableName = `${form.tableName || originalTableName}__forge_tmp`
  const tempQualified = buildQualifiedTableName(connection, form.schemaName, tempTableName, databaseName)
  const targetColumns = form.columns.filter((column) => column.name.trim())
  const columns = targetColumns.map((column) => `  ${buildColumnPreview(connection, column)}`)
  const foreignKeys = normalizeForeignKeyDrafts(form)
  const foreignKeyDefinitions = foreignKeys.map((foreignKey, index) =>
    `  ${buildForeignKeyPreviewDefinition(connection, form.tableName, foreignKey, index, form.schemaName)}`
  )
  const rebuildIndexStatements = normalizeSavedIndexes(form).map((index, indexNumber) =>
    `  ${buildIndexPreviewDefinition(connection, form.tableName, index, indexNumber, form.schemaName)}`
  )
  const copyColumns = targetColumns.filter((column) => (column.sourceName || "").trim())
  const insertTargetColumns = copyColumns.map((column) => quotePreviewIdentifier(connection, column.name)).join(", ")
  const insertSourceColumns = copyColumns
    .map((column) => quotePreviewIdentifier(connection, column.sourceName || column.name))
    .join(", ")
  const statements: string[] = [
    `-- A edição ainda precisa recriar a tabela para algumas alterações estruturais`,
  ]

  if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
    statements.push(
      `CREATE TABLE IF NOT EXISTS ${tempQualified} (`,
      ...columns,
      ...foreignKeyDefinitions,
      `);`
    )
    if (insertTargetColumns) {
      statements.push(
        `INSERT INTO ${tempQualified} (${insertTargetColumns})`,
        `SELECT ${insertSourceColumns}`,
        `FROM ${originalQualified};`
      )
    }
    for (const indexDefinition of rebuildIndexStatements) {
      statements.push(`${indexDefinition};`)
    }
    statements.push(`DROP TABLE ${originalQualified};`)
    statements.push(`RENAME TABLE ${tempQualified} TO ${nextQualified};`)
    return statements
  }

  if (connection.databaseType === "postgresql") {
    if (form.schemaName && form.schemaName !== "public") {
      statements.push(`CREATE SCHEMA IF NOT EXISTS ${quotePreviewIdentifier(connection, form.schemaName)};`)
    }
    statements.push(`CREATE TABLE IF NOT EXISTS ${tempQualified} (`, ...columns, ...foreignKeyDefinitions, `);`)
    if (insertTargetColumns) {
      statements.push(
        `INSERT INTO ${tempQualified} (${insertTargetColumns})`,
        `SELECT ${insertSourceColumns}`,
        `FROM ${originalQualified};`
      )
    }
    for (const indexDefinition of rebuildIndexStatements) {
      statements.push(`${indexDefinition};`)
    }
    statements.push(`DROP TABLE ${originalQualified};`)
    statements.push(
      `ALTER TABLE ${tempQualified} RENAME TO ${quotePreviewIdentifier(connection, form.tableName)};`
    )
    return statements
  }

  if (connection.databaseType === "sqlserver") {
    const dbName = quotePreviewIdentifier(connection, databaseName || connection.databaseName)
    statements.push(`USE ${dbName};`, "GO")
    if (form.schemaName && form.schemaName !== "dbo") {
      statements.push(
        `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = ${quotePreviewSqlLiteral(form.schemaName)})`
      )
      statements.push(
        `EXEC('CREATE SCHEMA ${quotePreviewIdentifier(connection, form.schemaName).replace(/'/g, "''")}')`,
        "GO"
      )
    }
    statements.push(`CREATE TABLE ${tempQualified} (`, ...columns, ...foreignKeyDefinitions, `);`)
    if (insertTargetColumns) {
      statements.push(
        `INSERT INTO ${tempQualified} (${insertTargetColumns})`,
        `SELECT ${insertSourceColumns}`,
        `FROM ${originalQualified};`
      )
    }
    for (const indexDefinition of rebuildIndexStatements) {
      statements.push(`${indexDefinition};`)
    }
    statements.push(`DROP TABLE ${originalQualified};`)
    statements.push(
      `EXEC sp_rename ${quotePreviewSqlLiteral(`${form.schemaName}.${tempTableName}`)}, ${quotePreviewSqlLiteral(
        form.tableName
      )};`
    )
    return statements
  }

  statements.push(`CREATE TABLE IF NOT EXISTS ${tempQualified} (`, ...columns, ...foreignKeyDefinitions, `);`)
  if (insertTargetColumns) {
    statements.push(
      `INSERT INTO ${tempQualified} (${insertTargetColumns})`,
      `SELECT ${insertSourceColumns}`,
      `FROM ${originalQualified};`
    )
  }
  for (const indexDefinition of rebuildIndexStatements) {
    statements.push(`${indexDefinition};`)
  }
  statements.push(`DROP TABLE ${originalQualified};`)
  statements.push(
    `ALTER TABLE ${tempQualified} RENAME TO ${quotePreviewIdentifier(connection, form.tableName)};`
  )
  return statements
}

function buildSqlPreview(
  connection: SavedConnection,
  form: CreateTableDraft,
  mode: "create" | "edit",
  table?: TableDetails | null,
  databaseName?: string
) {
  const statements =
    mode === "create"
      ? buildCreatePreviewStatements(connection, form, databaseName)
      : buildEditPreviewStatements(connection, form, table, databaseName)

  return statements.join("\n")
}

function hasRebuildSensitiveChanges(form: CreateTableDraft, table?: TableDetails | null) {
  if (!table) {
    return false
  }

  const originalColumnsByName = new Map(
    table.columns.map((column) => [column.name.trim(), column] as const)
  )
  const seenColumns = new Set<string>()

  return form.columns.some((column) => {
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
      Boolean(column.unsigned) !== Boolean(original.unsigned) ||
      column.notNull !== original.notNull ||
      column.primaryKey !== original.primaryKey ||
      column.autoIncrement !== original.autoIncrement ||
      column.defaultValue.trim() !== original.defaultValue.trim() ||
      column.comment.trim() !== original.comment.trim()
    )
  }) || seenColumns.size !== table.columns.length
}

export function CreateTableModal({
  open,
  connection,
  mode,
  databaseName,
  schemaName,
  schemaOptions,
  database,
  table,
  onOpenChange,
  onSaved,
}: CreateTableModalProps) {
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [form, setForm] = useState<CreateTableDraft>(() =>
    connection
      ? getInitialDraft(connection, mode, schemaName, schemaOptions, table, database)
      : createEmptyDraft(
          { databaseType: "mysql", databaseName: "", connectionName: "" } as SavedConnection,
          schemaName,
          schemaOptions
        )
  )

  if (!connection) {
    return null
  }
  const activeConnection = connection

  const availableSchemas = schemaOptions?.length ? schemaOptions : [form.schemaName]
  const isSingleSchema = availableSchemas.length === 1
  const isEditMode = mode === "edit"
  const referenceTableOptions = getReferenceTableOptions(database, form.schemaName, form.tableName)
  const originalForeignKeysForPreview = table
    ? table.foreignKeys
        .map((value) => parseForeignKeySummary(value))
        .filter(
          (
            foreignKey
          ): foreignKey is NonNullable<ReturnType<typeof parseForeignKeySummary>> => Boolean(foreignKey)
        )
        .map((foreignKey) => ({
          sourceColumn: foreignKey.sourceColumn,
          referencedSchemaName: table.schemaName,
          referencedTableName: foreignKey.referencedTableName,
          referencedColumnName: foreignKey.referencedColumnName,
          onDelete: foreignKey.onDelete,
          onUpdate: foreignKey.onUpdate,
        }))
    : []
  const nextForeignKeysForPreview = normalizeForeignKeyDrafts(form)
  const originalForeignKeyKeysForPreview = normalizeForeignKeySet(
    originalForeignKeysForPreview,
    table?.schemaName || form.schemaName
  )
  const nextForeignKeyKeysForPreview = normalizeForeignKeySet(nextForeignKeysForPreview, form.schemaName)
  const foreignKeyCanAlter =
    (activeConnection.databaseType === "mysql" || activeConnection.databaseType === "mariadb") &&
    !hasRebuildSensitiveChanges(form, table) &&
    table &&
    originalForeignKeyKeysForPreview.every((key) => nextForeignKeyKeysForPreview.includes(key))
  const sqlPreview = buildSqlPreview(
    activeConnection,
    form,
    mode,
    table,
    databaseName || activeConnection.databaseName
  )
  const rebuildSensitiveChanges =
    hasRebuildSensitiveChanges(form, table) || (hasForeignKeyChanges(form, table) && !foreignKeyCanAlter)
  const sourceColumnOptions = form.columns
    .filter((column) => column.name.trim())
    .map((column) => column.name.trim())

  function updateField(field: keyof CreateTableDraft, value: string) {
    setForm((current) => {
      if (field !== "tableName") {
        return { ...current, [field]: value }
      }

      const nextIndexes = current.indexes.map((index, currentIndex) => {
        const shouldRefreshName =
          !index.name.trim() ||
          index.name.trim().toLowerCase().startsWith("idx_") ||
          index.name.trim().toLowerCase().startsWith("uidx_") ||
          index.name.trim().toLowerCase().startsWith("pk_")

        if (!shouldRefreshName || !index.columns.length) {
          return index
        }

        return {
          ...index,
          name: getNextGeneratedIndexName(value, index.columns, currentIndex, current.indexes),
        }
      })

      return {
        ...current,
        tableName: value,
        indexes: nextIndexes,
      }
    })
  }

  function updateColumn(index: number, field: keyof CreateTableColumnDraft, value: string | boolean) {
    setForm((current) => {
      const previousColumn = current.columns[index]
      if (!previousColumn) {
        return current
      }

      const nextColumns = current.columns.map((column, currentIndex) =>
        currentIndex === index
          ? {
              ...column,
              [field]: value,
              ...(field === "dataType" && typeof value === "string"
                ? { size: getColumnSizeConfig(value).defaultValue }
                : {}),
            }
          : column
      )
      const nextColumn = nextColumns[index]
      const oldColumnName = previousColumn.name.trim()
      const nextColumnName = nextColumn.name.trim()
      let nextIndexes = current.indexes.map((item, currentIndex) => {
        const updatedColumns = item.columns.map((columnName) =>
          columnName.trim().toLowerCase() === oldColumnName.toLowerCase() ? nextColumnName : columnName
        )
        const referencesColumn = item.columns.some(
          (columnName) => columnName.trim().toLowerCase() === oldColumnName.toLowerCase()
        )
        const shouldRefreshName =
          !item.name.trim() ||
          /^idx_/i.test(item.name.trim()) ||
          /^uidx_/i.test(item.name.trim()) ||
          item.primaryKey

        if (!referencesColumn) {
          return item
        }

        return {
          ...item,
          columns: updatedColumns,
          columnName: updatedColumns[0] ?? "",
          name:
            shouldRefreshName && updatedColumns.length
              ? item.primaryKey
                ? "PRIMARY"
                : getNextGeneratedIndexName(current.tableName, updatedColumns, currentIndex, current.indexes)
              : item.name,
        }
      })

      if (field === "primaryKey") {
        if (Boolean(value)) {
          const hasPrimary = nextIndexes.some(
            (item) =>
              item.primaryKey &&
              item.columns.length === 1 &&
              item.columns[0].trim().toLowerCase() === nextColumnName.toLowerCase()
          )

          if (!hasPrimary) {
            nextIndexes = [...nextIndexes, createPrimaryIndexDraft(nextColumnName, "PRIMARY")]
          }
        } else {
          nextIndexes = nextIndexes.filter(
            (item) =>
              !(
                item.primaryKey &&
                item.columns.length === 1 &&
                item.columns[0].trim().toLowerCase() === oldColumnName.toLowerCase()
              )
          )
        }
      }

      if (field === "unique") {
        if (Boolean(value)) {
          const hasUnique = nextIndexes.some(
            (item) =>
              !item.primaryKey &&
              item.unique &&
              item.columns.length === 1 &&
              item.columns[0].trim().toLowerCase() === nextColumnName.toLowerCase()
          )

          if (!hasUnique && nextColumnName) {
            nextIndexes = [
              ...nextIndexes,
              createIndexDraft({
                name: getNextGeneratedIndexName(
                  current.tableName,
                  [nextColumnName],
                  nextIndexes.length,
                  nextIndexes
                ),
                columnName: nextColumnName,
                columns: [nextColumnName],
                unique: true,
                primaryKey: false,
                removable: true,
              }),
            ]
          }
        } else {
          nextIndexes = nextIndexes.filter(
            (item) =>
              !(
                !item.primaryKey &&
                item.unique &&
                item.columns.length === 1 &&
                item.columns[0].trim().toLowerCase() === oldColumnName.toLowerCase()
              )
          )
        }
      }

      return {
        ...current,
        columns: nextColumns,
        indexes: nextIndexes,
      }
    })
  }

  function addColumn() {
    setForm((current) => ({
      ...current,
      columns: [
        ...current.columns,
        createColumnDraft(),
      ],
    }))
  }

  function removeColumn(index: number) {
    setForm((current) => ({
      ...current,
      columns:
        current.columns.length > 1
          ? current.columns.filter((_, currentIndex) => currentIndex !== index)
          : current.columns,
      indexes: current.indexes.filter(
        (item) =>
          !item.columns.some(
            (columnName) =>
              columnName.trim().toLowerCase() === current.columns[index]?.name.trim().toLowerCase()
          )
      ),
    }))
  }

  function updateForeignKey(
    index: number,
    field: keyof CreateTableForeignKeyDraft,
    value: string
  ) {
    setForm((current) => {
      const nextForeignKeys = current.foreignKeys.map((foreignKey, currentIndex) =>
        currentIndex === index ? { ...foreignKey, [field]: value } : foreignKey
      )
      const nextForeignKey = nextForeignKeys[index]
      const nextReference = referenceTableOptions.find(
        (option) =>
          option.schemaName ===
            (nextForeignKey?.referencedSchemaName.trim() || current.schemaName) &&
          option.tableName === (nextForeignKey?.referencedTableName.trim() || "")
      )
      const nextSourceColumnName =
        getCompatibleSourceColumnName(
          current.columns,
          nextReference,
          nextForeignKey?.referencedColumnName,
          nextForeignKey?.sourceColumn
        )
      const normalizedForeignKeys = nextForeignKeys.map((foreignKey, currentIndex) =>
        currentIndex === index
          ? {
              ...foreignKey,
              sourceColumn: nextSourceColumnName,
            }
          : foreignKey
      )

      return {
        ...current,
        foreignKeys: normalizedForeignKeys,
        columns: applyForeignKeySourceColumnSuggestion(
          current.columns,
          {
            ...nextForeignKey,
            sourceColumn: nextSourceColumnName,
          },
          nextReference
        ),
      }
    })
  }

  function updateForeignKeyReference(index: number, value: string) {
    const [nextSchemaName, nextTableName] = value.split("::")
    const nextReference = referenceTableOptions.find(
      (option) => option.schemaName === nextSchemaName && option.tableName === nextTableName
    )

    setForm((current) => {
      const nextForeignKeys = current.foreignKeys.map((foreignKey, currentIndex) =>
        currentIndex === index
          ? {
              ...foreignKey,
              referencedSchemaName: nextReference?.schemaName ?? foreignKey.referencedSchemaName,
              referencedTableName: nextReference?.tableName ?? foreignKey.referencedTableName,
              referencedColumnName:
                nextReference?.primaryKeyColumns[0] ?? foreignKey.referencedColumnName,
            }
          : foreignKey
      )
      const nextForeignKey = nextForeignKeys[index]
      const nextSourceColumnName = getCompatibleSourceColumnName(
        current.columns,
        nextReference,
        nextForeignKey?.referencedColumnName,
        nextForeignKey?.sourceColumn
      )

      return {
        ...current,
        foreignKeys: nextForeignKeys.map((foreignKey, currentIndex) =>
          currentIndex === index
            ? {
                ...foreignKey,
                sourceColumn: nextSourceColumnName,
              }
            : foreignKey
        ),
        columns: applyForeignKeySourceColumnSuggestion(
          current.columns,
          {
            ...nextForeignKey,
            sourceColumn: nextSourceColumnName,
          },
          nextReference
        ),
      }
    })
  }

  function addForeignKey() {
    const referenceTables = getReferenceTableOptions(database, form.schemaName, form.tableName)
    const firstReference = referenceTables[0]
    const firstSourceColumn = getCompatibleSourceColumnName(
      form.columns,
      firstReference,
      firstReference?.primaryKeyColumns[0],
      ""
    )

    setForm((current) => ({
      ...current,
      foreignKeys: [
        ...current.foreignKeys,
        createForeignKeyDraft({
          sourceColumn: firstSourceColumn,
          referencedSchemaName: firstReference?.schemaName ?? current.schemaName,
          referencedTableName: firstReference?.tableName ?? "",
          referencedColumnName: firstReference?.primaryKeyColumns[0] ?? "",
        }),
      ],
    }))
  }

  function removeForeignKey(index: number) {
    setForm((current) => ({
      ...current,
      foreignKeys: current.foreignKeys.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  function updateIndex(index: number, field: keyof CreateTableIndexDraft, value: string | boolean) {
    setForm((current) => {
      const previousIndex = current.indexes[index]
      const previousColumnName = previousIndex?.columns[0] ?? previousIndex?.columnName ?? ""
      const nextIndexes = current.indexes.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item
      )

      if (field !== "columnName" && field !== "unique") {
        return {
          ...current,
          indexes: nextIndexes,
        }
      }

      const nextIndex = nextIndexes[index]
      const nextColumnName =
        field === "columnName" ? String(value).trim() : nextIndex?.columnName.trim() ?? ""
      const shouldRefreshName =
        !previousIndex?.name.trim() || previousIndex.name.trim().toLowerCase().startsWith("idx_")
      const nextColumns = current.columns.map((column) => {
        const matchesPrevious = column.name.trim().toLowerCase() === previousColumnName.trim().toLowerCase()
        const matchesNext = column.name.trim().toLowerCase() === nextColumnName.toLowerCase()

        if (previousIndex?.columns.length <= 1 && field === "columnName") {
          if (matchesPrevious && previousColumnName.trim() !== nextColumnName) {
            return { ...column, unique: false }
          }

          if (matchesNext) {
            return { ...column, unique: Boolean(nextIndex?.unique) }
          }
        }

        if (previousIndex?.columns.length <= 1 && field === "unique" && matchesPrevious) {
          return { ...column, unique: Boolean(value) }
        }

        return column
      })

      return {
        ...current,
        columns: nextColumns,
        indexes: nextIndexes.map((item, currentIndexPosition) => {
          if (currentIndexPosition !== index || !nextColumnName) {
            return item
          }

          const columns = item.columns.length ? item.columns : item.columnName ? [item.columnName] : []
          const shouldSyncSingleColumn = columns.length <= 1

          return {
            ...item,
            columns: shouldSyncSingleColumn ? [nextColumnName] : columns,
            columnName: shouldSyncSingleColumn ? nextColumnName : item.columnName,
            name: shouldRefreshName
              ? getNextGeneratedIndexName(
                  current.tableName,
                  shouldSyncSingleColumn ? [nextColumnName] : columns,
                  currentIndexPosition,
                  nextIndexes
                )
              : item.name,
          }
        }),
      }
    })
  }

  function addIndex() {
    const firstSourceColumn = sourceColumnOptions[0] ?? ""

    setForm((current) => {
      const nextIndexColumn = firstSourceColumn || current.indexes[0]?.columnName || ""
      const generatedName = nextIndexColumn
        ? getNextGeneratedIndexName(current.tableName, [nextIndexColumn], current.indexes.length, current.indexes)
        : ""

      return {
        ...current,
        indexes: [
          ...current.indexes,
          createIndexDraft({
            columnName: nextIndexColumn,
            columns: nextIndexColumn ? [nextIndexColumn] : [],
            name: generatedName,
          }),
        ],
      }
    })
  }

  function removeIndex(index: number) {
    setForm((current) => ({
      ...current,
      columns:
        current.indexes[index]?.unique && current.indexes[index].columns.length === 1
          ? current.columns.map((column) =>
              column.name.trim() === current.indexes[index]?.columns[0]?.trim()
                ? { ...column, unique: false }
                : column
            )
          : current.columns,
      indexes: current.indexes.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  async function handleSave() {
    if (!form.tableName.trim()) {
      setErrorMessage("Informe o nome da tabela.")
      return
    }

    if (!form.columns.some((column) => column.name.trim())) {
      setErrorMessage("Adicione pelo menos uma coluna com nome válido.")
      return
    }

    const columnNames = new Set(
      form.columns.map((column) => column.name.trim().toLowerCase()).filter(Boolean)
    )
    if (
      form.foreignKeys.some(
        (foreignKey) =>
          foreignKey.sourceColumn.trim() &&
          !columnNames.has(foreignKey.sourceColumn.trim().toLowerCase())
      )
    ) {
      setErrorMessage("A coluna de origem da chave estrangeira precisa existir na lista de colunas.")
      return
    }

    if (
      form.indexes.some(
        (index) =>
          index.columns.some((columnName) => columnName.trim()) &&
          index.columns.some((columnName) => !columnNames.has(columnName.trim().toLowerCase()))
      )
    ) {
      setErrorMessage("A coluna do índice precisa existir na lista de colunas.")
      return
    }

    const foreignKeyCompatibilityError = getForeignKeyCompatibilityError(form, database)
    if (foreignKeyCompatibilityError) {
      setErrorMessage(foreignKeyCompatibilityError)
      return
    }

    const foreignKeys = form.foreignKeys.filter(
      (foreignKey) =>
        foreignKey.sourceColumn.trim() ||
        foreignKey.referencedSchemaName.trim() ||
        foreignKey.referencedTableName.trim() ||
        foreignKey.referencedColumnName.trim()
    )
    const indexes = normalizeSavedIndexes(form)

    if (
      foreignKeys.some(
        (foreignKey) =>
          !foreignKey.sourceColumn.trim() ||
          !foreignKey.referencedTableName.trim() ||
          !foreignKey.referencedColumnName.trim()
      )
    ) {
      setErrorMessage("Complete a associação da chave estrangeira ou remova a linha vazia.")
      return
    }

    if (indexes.some((index) => !index.name.trim() || !index.columns.length)) {
      setErrorMessage("Complete o índice ou remova a linha vazia.")
      return
    }

    setSaving(true)
    setErrorMessage(null)

    try {
      const endpoint =
        isEditMode && table
          ? `/api/connections/${activeConnection.id}/tables/${encodeURIComponent(table.tableName)}?databaseName=${encodeURIComponent(
              databaseName || activeConnection.databaseName
            )}&schemaName=${encodeURIComponent(form.schemaName)}`
          : `/api/connections/${activeConnection.id}/tables`

      const response = await fetch(endpoint, {
        method: isEditMode ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          databaseName: databaseName || activeConnection.databaseName,
          schemaName: form.schemaName,
          tableName: form.tableName,
          nextTableName: form.tableName,
          comment: form.comment,
          columns: form.columns,
          foreignKeys,
          indexes,
        }),
      })

      const payload: {
        success: boolean
        message: string
        details: string
      } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(
          payload.details ||
            payload.message ||
            `Não foi possível ${isEditMode ? "atualizar" : "criar"} a tabela.`
        )
        return
      }

      onOpenChange(false)
      await onSaved({ message: payload.message, details: payload.details })
    } catch {
      setErrorMessage(`Falha inesperada ao ${isEditMode ? "atualizar" : "criar"} a tabela.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="bottom"
        className="overflow-hidden rounded-t-[2rem] border-t border-white/10 bg-[#0b1221] p-0 text-white shadow-[0_24px_90px_-35px_rgba(0,0,0,0.95)]"
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-b border-white/10 px-6 py-5 pr-16">
            <DialogHeader className="text-left">
              <div className="flex items-start gap-4">
                <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-2 text-sky-300">
                  <Table2 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle>{isEditMode ? "Editar Tabela" : "Nova Tabela"}</DialogTitle>
                  <DialogDescription>
                    {isEditMode
                      ? `Revise a tabela ${table?.tableName ?? form.tableName} no schema ${form.schemaName}.`
                      : `Crie uma nova tabela no esquema ${form.schemaName}.`}{" "}
                    {getDatabaseTypeDescription(activeConnection.databaseType)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <Card className="border-white/10 bg-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-base text-white">Detalhes da tabela</CardTitle>
                <CardDescription>Defina schema, nome e comentário antes de montar as colunas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="table-schema">Schema</Label>
                    {isSingleSchema || isEditMode ? (
                      <Input
                        id="table-schema"
                        value={form.schemaName}
                        readOnly
                        className="bg-white/4 text-white/75"
                      />
                    ) : (
                      <Select
                        value={form.schemaName}
                        onValueChange={(value) => updateField("schemaName", value)}
                      >
                        <SelectTrigger id="table-schema">
                          <SelectValue placeholder="Selecione um schema" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {availableSchemas.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="table-name">Nome da tabela</Label>
                    <Input
                      id="table-name"
                      value={form.tableName}
                      onChange={(event) => updateField("tableName", event.target.value)}
                      placeholder="Ex.: clientes"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="table-comment">Comentário (opcional)</Label>
                    <Input
                      id="table-comment"
                      value={form.comment}
                      onChange={(event) => updateField("comment", event.target.value)}
                      placeholder="Descreva a finalidade da tabela"
                    />
                  </div>
                </div>

                <Separator />

                {isEditMode ? (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-50">
                    Alterações simples como renomear a tabela ou adicionar novas colunas são
                    aplicadas diretamente. Mudanças em colunas existentes ainda podem exigir
                    recriação da tabela e cópia dos dados compatíveis.
                  </div>
                ) : null}

                <Tabs defaultValue="columns" className="w-full">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <TabsList className="h-auto flex-wrap justify-start gap-0 bg-transparent p-0">
                      <TabsTrigger value="columns">Colunas</TabsTrigger>
                      <TabsTrigger value="foreign-keys">Chaves Estrangeiras</TabsTrigger>
                      <TabsTrigger value="indexes">Índices</TabsTrigger>
                      <TabsTrigger value="triggers">Triggers</TabsTrigger>
                      <TabsTrigger value="functions">Functions</TabsTrigger>
                      <TabsTrigger value="advanced">Avançado</TabsTrigger>
                      <TabsTrigger value="sql-preview">SQL Preview</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="columns">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle className="text-base text-white">Colunas da Tabela</CardTitle>
                            <CardDescription>
                              Estruture os campos principais antes de salvar a nova tabela.
                            </CardDescription>
                          </div>
                          <Button
                            type="button"
                            onClick={addColumn}
                            variant="outline"
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                          >
                            <Plus className="size-4" />
                            Adicionar coluna
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Table wrapperClassName="rounded-2xl border border-white/10">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead className="w-80">Nome</TableHead>
                              <TableHead className="w-40">Tipos de dado</TableHead>
                              <TableHead className="w-32">Tamanho</TableHead>
                              <TableHead className="w-80">Default</TableHead>
                              <TableHead>Comentário</TableHead>
                              <TableHead className="w-24 text-center">Not Null</TableHead>
                              <TableHead className="w-40 text-center">Chave primária</TableHead>
                              <TableHead className="w-36 text-center">Auto increment</TableHead>
                              <TableHead className="w-28 text-center">Unique</TableHead>
                              <TableHead className="w-14" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {form.columns.map((column, index) => {
                              const sizeConfig = getColumnSizeConfig(column.dataType)

                              return (
                                <TableRow key={column.id ?? column.sourceName ?? `${index}`} className="h-12">
                                  <TableCell className="py-1.5 font-medium text-white/55">
                                    {index + 1}
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={column.name}
                                      onChange={(event) => updateColumn(index, "name", event.target.value)}
                                      placeholder="nome"
                                      className="h-9 w-full"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={column.dataType}
                                      onValueChange={(value) => updateColumn(index, "dataType", value)}
                                    >
                                      <SelectTrigger className="h-9 w-32 shrink-0">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectGroup>
                                          {typeOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                              {option.label}
                                            </SelectItem>
                                          ))}
                                        </SelectGroup>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={column.size}
                                      onChange={(event) => updateColumn(index, "size", event.target.value)}
                                      placeholder={sizeConfig.placeholder}
                                      disabled={sizeConfig.disabled}
                                      className="h-9"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={column.defaultValue}
                                      onChange={(event) =>
                                        updateColumn(index, "defaultValue", event.target.value)
                                      }
                                      placeholder="default"
                                      className="h-9"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={column.comment}
                                      onChange={(event) => updateColumn(index, "comment", event.target.value)}
                                      placeholder="Comentário"
                                      className="h-9 w-full"
                                    />
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex justify-center">
                                      <Checkbox
                                        checked={column.notNull}
                                        onChange={(event) =>
                                          updateColumn(index, "notNull", event.currentTarget.checked)
                                        }
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex justify-center">
                                      <Checkbox
                                        checked={column.primaryKey}
                                        onChange={(event) =>
                                          updateColumn(index, "primaryKey", event.currentTarget.checked)
                                        }
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex justify-center">
                                      <Checkbox
                                        checked={column.autoIncrement}
                                        onChange={(event) =>
                                          updateColumn(index, "autoIncrement", event.currentTarget.checked)
                                        }
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex justify-center">
                                      <Checkbox
                                        checked={Boolean(column.unique || column.primaryKey)}
                                        disabled={column.primaryKey}
                                        onChange={(event) =>
                                          updateColumn(index, "unique", event.currentTarget.checked)
                                        }
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeColumn(index)}
                                      className="inline-flex size-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-rose-300"
                                      aria-label="Remover coluna"
                                    >
                                      <Trash2 className="size-4" />
                                    </button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="foreign-keys">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle className="text-base text-white">Chaves Estrangeiras</CardTitle>
                            <CardDescription>
                              Associe uma coluna da tabela atual às chaves primárias de outras tabelas.
                            </CardDescription>
                          </div>
                          <Button
                            type="button"
                            onClick={addForeignKey}
                            variant="outline"
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                            disabled={!sourceColumnOptions.length || !referenceTableOptions.length}
                          >
                            <Plus className="size-4" />
                            Adicionar relacionamento
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-0">
                        {referenceTableOptions.length ? (
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                            As opções abaixo usam as chaves primárias disponíveis no banco selecionado.
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-4 text-sm text-white/50">
                            Nenhuma tabela com chave primária disponível para criar relacionamentos.
                          </div>
                        )}

                        {form.foreignKeys.length ? (
                          <Table wrapperClassName="rounded-2xl border border-white/10">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-64">Coluna atual</TableHead>
                                <TableHead className="w-md">Tabela referenciada</TableHead>
                                <TableHead className="w-64">PK referenciada</TableHead>
                                <TableHead className="w-40">ON DELETE</TableHead>
                                <TableHead className="w-40">ON UPDATE</TableHead>
                                <TableHead className="w-14" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {form.foreignKeys.map((foreignKey, index) => {
                                const selectedReference = referenceTableOptions.find(
                                  (option) =>
                                    option.schemaName === foreignKey.referencedSchemaName &&
                                    option.tableName === foreignKey.referencedTableName
                                )
                                const referenceColumns = selectedReference?.primaryKeyColumns ?? []
                                const selectedReferenceValue = selectedReference
                                  ? `${selectedReference.schemaName}::${selectedReference.tableName}`
                                  : ""

                                return (
                                  <TableRow key={foreignKey.id ?? `${index}`} className="h-14">
                                    <TableCell>
                                      <Select
                                        value={foreignKey.sourceColumn}
                                        onValueChange={(value) =>
                                          updateForeignKey(index, "sourceColumn", value)
                                        }
                                      >
                                        <SelectTrigger className="h-9 w-full">
                                          <SelectValue placeholder="Selecione a coluna" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectGroup>
                                            {sourceColumnOptions.map((columnName) => (
                                              <SelectItem key={columnName} value={columnName}>
                                                {columnName}
                                              </SelectItem>
                                            ))}
                                          </SelectGroup>
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Select
                                        value={selectedReferenceValue}
                                        onValueChange={(value) => updateForeignKeyReference(index, value)}
                                      >
                                        <SelectTrigger className="h-9 w-full">
                                          <SelectValue placeholder="Selecione a tabela" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectGroup>
                                            {referenceTableOptions.map((option) => {
                                              const optionValue = `${option.schemaName}::${option.tableName}`

                                              return (
                                                <SelectItem key={optionValue} value={optionValue}>
                                                  {option.label}
                                                </SelectItem>
                                              )
                                            })}
                                          </SelectGroup>
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Select
                                        value={foreignKey.referencedColumnName}
                                        onValueChange={(value) =>
                                          updateForeignKey(index, "referencedColumnName", value)
                                        }
                                        disabled={!referenceColumns.length}
                                      >
                                        <SelectTrigger className="h-9 w-full">
                                          <SelectValue placeholder="Selecione a PK" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectGroup>
                                            {referenceColumns.map((columnName) => (
                                              <SelectItem key={columnName} value={columnName}>
                                                {columnName}
                                              </SelectItem>
                                            ))}
                                          </SelectGroup>
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Select
                                        value={foreignKey.onDelete}
                                        onValueChange={(value) => updateForeignKey(index, "onDelete", value)}
                                      >
                                        <SelectTrigger className="h-9 w-full">
                                          <SelectValue placeholder="Sem ação" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectGroup>
                                            {foreignKeyActionOptions.map((option) => (
                                              <SelectItem key={`delete-${option.value || "none"}`} value={option.value}>
                                                {option.label}
                                              </SelectItem>
                                            ))}
                                          </SelectGroup>
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Select
                                        value={foreignKey.onUpdate}
                                        onValueChange={(value) => updateForeignKey(index, "onUpdate", value)}
                                      >
                                        <SelectTrigger className="h-9 w-full">
                                          <SelectValue placeholder="Sem ação" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectGroup>
                                            {foreignKeyActionOptions.map((option) => (
                                              <SelectItem key={`update-${option.value || "none"}`} value={option.value}>
                                                {option.label}
                                              </SelectItem>
                                            ))}
                                          </SelectGroup>
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <button
                                        type="button"
                                        onClick={() => removeForeignKey(index)}
                                        className="inline-flex size-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-rose-300"
                                        aria-label="Remover chave estrangeira"
                                      >
                                        <Trash2 className="size-4" />
                                      </button>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-white/45">
                            Nenhuma chave estrangeira configurada.
                          </div>
                        )}
                        <p className="text-xs text-white/45">
                          Selecione uma coluna local e a PK da tabela alvo para criar o relacionamento.
                        </p>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="indexes">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle className="text-base text-white">Índices</CardTitle>
                            <CardDescription>
                              Crie, revise e remova índices. Chaves primárias aparecem como padrão e não podem ser removidas por aqui.
                            </CardDescription>
                          </div>
                          <Button
                            type="button"
                            onClick={addIndex}
                            variant="outline"
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                            disabled={!sourceColumnOptions.length}
                          >
                            <Plus className="size-4" />
                            Adicionar índice
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-0">
                        {form.indexes.length ? (
                          <Table wrapperClassName="rounded-2xl border border-white/10">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-80">Nome do índice</TableHead>
                                <TableHead className="w-96">Colunas</TableHead>
                                <TableHead className="w-24 text-center">Unique</TableHead>
                                <TableHead className="w-32 text-center">Tipo</TableHead>
                                <TableHead className="w-14" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {form.indexes.map((index, indexPosition) => (
                                <TableRow key={index.id ?? `${indexPosition}`} className="h-14">
                                  <TableCell>
                                    <Input
                                      value={index.name}
                                      onChange={(event) =>
                                        updateIndex(indexPosition, "name", event.target.value)
                                      }
                                      placeholder="idx_tabela_coluna"
                                      className="h-9"
                                      disabled={index.primaryKey}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    {index.columns.length > 1 ? (
                                      <Input value={index.columns.join(", ")} readOnly className="h-9" />
                                    ) : (
                                      <Select
                                        value={index.columns[0] ?? ""}
                                        onValueChange={(value) =>
                                          updateIndex(indexPosition, "columnName", value)
                                        }
                                        disabled={!sourceColumnOptions.length || index.primaryKey}
                                      >
                                        <SelectTrigger className="h-9 w-full">
                                          <SelectValue placeholder="Selecione a coluna" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectGroup>
                                            {sourceColumnOptions.map((columnName) => (
                                              <SelectItem key={columnName} value={columnName}>
                                                {columnName}
                                              </SelectItem>
                                            ))}
                                          </SelectGroup>
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex justify-center">
                                      <Checkbox
                                        checked={index.primaryKey ? true : Boolean(index.unique)}
                                        disabled={index.primaryKey}
                                        onChange={(event) =>
                                          updateIndex(indexPosition, "unique", event.currentTarget.checked)
                                        }
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center text-sm text-white/60">
                                    {index.primaryKey ? "Chave primária" : index.unique ? "Unique" : "Index"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeIndex(indexPosition)}
                                      className="inline-flex size-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-rose-300"
                                      aria-label="Remover índice"
                                      disabled={!index.removable}
                                    >
                                      <Trash2 className="size-4" />
                                    </button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-white/45">
                            Nenhum índice configurado.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="triggers">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base text-white">Triggers</CardTitle>
                        <CardDescription>Triggers já cadastradas para a tabela.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <MetadataList
                          items={table?.triggers ?? []}
                          emptyText="Nenhuma trigger encontrada."
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="functions">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base text-white">Functions</CardTitle>
                        <CardDescription>Funções disponíveis no mesmo schema.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <MetadataList
                          items={table?.functions ?? []}
                          emptyText="Nenhuma função encontrada."
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="advanced">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base text-white">Avançado</CardTitle>
                        <CardDescription>Opções avançadas da criação de tabela.</CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>

                  <TabsContent value="sql-preview">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base text-white">SQL Preview</CardTitle>
                        <CardDescription>
                          {isEditMode
                            ? "Prévia da atualização da tabela com a estrutura atual do formulário."
                            : "Pré-visualização do comando final será exibida aqui."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {isEditMode ? (
                          <div
                            className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                              rebuildSensitiveChanges
                                ? "border-amber-400/20 bg-amber-400/10 text-amber-50"
                                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-50"
                            }`}
                          >
                            {rebuildSensitiveChanges
                              ? "Há alterações sensíveis detectadas. O banco vai recriar a tabela e copiar os dados compatíveis."
                              : "Nenhuma alteração estrutural sensível detectada além de manter a recriação padrão."}
                          </div>
                        ) : null}

                        <pre className="overflow-auto rounded-2xl border border-white/10 bg-[#02050c] p-4 text-sm leading-6 text-white/75">
                          <code>{sqlPreview}</code>
                        </pre>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>

                {errorMessage ? (
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                    {errorMessage}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
            <div className="flex items-center gap-2 text-xs text-white/45">
              <Table2 className="size-3.5" />
              {databaseName || activeConnection.connectionName}
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => onOpenChange(false)}
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "bg-linear-to-r from-[#3f7bff] to-[#2a61ef] text-white shadow-[0_18px_45px_-18px_rgba(59,113,255,0.9)] hover:from-[#4a84ff] hover:to-[#2457da]"
                )}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? (isEditMode ? "Salvando..." : "Criando...") : isEditMode ? "Salvar alterações" : "Criar Tabela"}
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
