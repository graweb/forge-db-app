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
import type {
  CreateTableColumnDraft,
  CreateTableDraft,
  CreateTableModalProps,
} from "@/types/dashboard-modals"
import type { SavedConnection, TableDetails } from "@/types/connections"

const typeOptions = [
  { value: "INTEGER", label: "integer" },
  { value: "INT", label: "int" },
  { value: "SMALLINT", label: "smallint" },
  { value: "TINYINT", label: "tinyint" },
  { value: "BIGINT", label: "bigint" },
  { value: "VARCHAR", label: "varchar" },
  { value: "TEXT", label: "text" },
  { value: "ENUM", label: "enum" },
  { value: "TIMESTAMP", label: "timestamp" },
  { value: "BOOLEAN", label: "boolean" },
  { value: "DECIMAL", label: "decimal" },
  { value: "DATE", label: "date" },
]

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
    notNull: partial?.notNull ?? false,
    primaryKey: partial?.primaryKey ?? false,
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

function getInitialDraft(
  connection: SavedConnection,
  mode: "create" | "edit",
  schemaName?: string,
  schemaOptions?: string[],
  table?: TableDetails | null
): CreateTableDraft {
  if (mode === "edit" && table) {
    return {
      schemaName: table.schemaName || schemaName?.trim() || "public",
      tableName: table.tableName,
      comment: table.comment || "",
      columns: table.columns.length
        ? table.columns.map((column) => createColumnDraft({ ...column, id: column.name, sourceName: column.name }))
        : [createColumnDraft(getDefaultColumn(connection.databaseType))],
    }
  }

  const defaultSchema =
    schemaName?.trim() || schemaOptions?.[0] || (connection.databaseType === "sqlite" ? "main" : "public")

  return {
    schemaName: defaultSchema,
    tableName: "",
    comment: "",
    columns: [createColumnDraft(getDefaultColumn(connection.databaseType))],
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
    column.size && /^(CHAR|NCHAR|VARCHAR|NVARCHAR|BINARY|VARBINARY|DECIMAL|NUMERIC|NUMBER)$/.test(column.dataType)
      ? `${column.dataType}(${column.size})`
      : column.dataType

  if (connection.databaseType === "sqlite" && column.autoIncrement && column.primaryKey) {
    return `${parts[0]} INTEGER PRIMARY KEY AUTOINCREMENT`
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
    statements.push(...columns)
    statements.push(`) COMMENT=${quotePreviewSqlLiteral(form.comment)};`)
    return statements
  }

  statements.push(
    `CREATE TABLE ${connection.databaseType === "sqlite" ? quotePreviewIdentifier(connection, form.tableName) : qualifiedTableName} (`
  )
  statements.push(...columns)
  statements.push(");")

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
  const requiresRebuild = hasRebuildSensitiveChanges(form, table)

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

    if (commentChanged) {
      if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
        statements.push(`ALTER TABLE ${statementsTarget} COMMENT=${quotePreviewSqlLiteral(form.comment)};`)
      } else if (connection.databaseType === "postgresql") {
        statements.push(`COMMENT ON TABLE ${statementsTarget} IS ${quotePreviewSqlLiteral(form.comment)};`)
      }
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

    return statements.length ? statements : ["-- Nenhuma alteração detectada."]
  }

  const tempTableName = `${form.tableName || originalTableName}__forge_tmp`
  const tempQualified = buildQualifiedTableName(connection, form.schemaName, tempTableName, databaseName)
  const targetColumns = form.columns.filter((column) => column.name.trim())
  const columns = targetColumns.map((column) => `  ${buildColumnPreview(connection, column)}`)
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
      `);`
    )
    if (insertTargetColumns) {
      statements.push(
        `INSERT INTO ${tempQualified} (${insertTargetColumns})`,
        `SELECT ${insertSourceColumns}`,
        `FROM ${originalQualified};`
      )
    }
    statements.push(`DROP TABLE ${originalQualified};`)
    statements.push(`RENAME TABLE ${tempQualified} TO ${nextQualified};`)
    return statements
  }

  if (connection.databaseType === "postgresql") {
    if (form.schemaName && form.schemaName !== "public") {
      statements.push(`CREATE SCHEMA IF NOT EXISTS ${quotePreviewIdentifier(connection, form.schemaName)};`)
    }
    statements.push(`CREATE TABLE IF NOT EXISTS ${tempQualified} (`, ...columns, `);`)
    if (insertTargetColumns) {
      statements.push(
        `INSERT INTO ${tempQualified} (${insertTargetColumns})`,
        `SELECT ${insertSourceColumns}`,
        `FROM ${originalQualified};`
      )
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
    statements.push(`CREATE TABLE ${tempQualified} (`, ...columns, `);`)
    if (insertTargetColumns) {
      statements.push(
        `INSERT INTO ${tempQualified} (${insertTargetColumns})`,
        `SELECT ${insertSourceColumns}`,
        `FROM ${originalQualified};`
      )
    }
    statements.push(`DROP TABLE ${originalQualified};`)
    statements.push(
      `EXEC sp_rename ${quotePreviewSqlLiteral(`${form.schemaName}.${tempTableName}`)}, ${quotePreviewSqlLiteral(
        form.tableName
      )};`
    )
    return statements
  }

  statements.push(`CREATE TABLE IF NOT EXISTS ${tempQualified} (`, ...columns, `);`)
  if (insertTargetColumns) {
    statements.push(
      `INSERT INTO ${tempQualified} (${insertTargetColumns})`,
      `SELECT ${insertSourceColumns}`,
      `FROM ${originalQualified};`
    )
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
  table,
  onOpenChange,
  onSaved,
}: CreateTableModalProps) {
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [form, setForm] = useState<CreateTableDraft>(() =>
    connection
      ? getInitialDraft(connection, mode, schemaName, schemaOptions, table)
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
  const sqlPreview = buildSqlPreview(
    activeConnection,
    form,
    mode,
    table,
    databaseName || activeConnection.databaseName
  )
  const rebuildSensitiveChanges = hasRebuildSensitiveChanges(form, table)

  function updateField(field: keyof CreateTableDraft, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateColumn(index: number, field: keyof CreateTableColumnDraft, value: string | boolean) {
    setForm((current) => ({
      ...current,
      columns: current.columns.map((column, currentIndex) =>
        currentIndex === index ? { ...column, [field]: value } : column
      ),
    }))
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
      columns: current.columns.length > 1 ? current.columns.filter((_, currentIndex) => currentIndex !== index) : current.columns,
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
      <DrawerContent className="w-[min(100vw-1rem,72rem)] overflow-hidden rounded-l-[2rem] border-l border-white/10 bg-[#0b1221] p-0 text-white shadow-[0_24px_90px_-35px_rgba(0,0,0,0.95)]">
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
                <CardTitle className="text-base">Detalhes da tabela</CardTitle>
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

                  <TabsContent value="columns">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Colunas da Tabela</CardTitle>
                        <CardDescription>
                          Estruture os campos principais antes de salvar a nova tabela.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Table wrapperClassName="rounded-2xl border border-white/10">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead>Nome da Coluna</TableHead>
                              <TableHead>Tipo de Dados</TableHead>
                              <TableHead className="w-32">Tamanho</TableHead>
                              <TableHead className="w-36">Default</TableHead>
                              <TableHead className="w-[18rem]">Comentário</TableHead>
                              <TableHead className="w-24 text-center">Not Null</TableHead>
                              <TableHead className="w-20 text-center">PK</TableHead>
                              <TableHead className="w-28 text-center">Auto Increment</TableHead>
                              <TableHead className="w-14" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {form.columns.map((column, index) => (
                              <TableRow key={column.id ?? column.sourceName ?? `${index}`} className="h-12">
                                <TableCell className="py-1.5 font-medium text-white/55">{index + 1}</TableCell>
                                <TableCell>
                                  <Input
                                    value={column.name}
                                    onChange={(event) => updateColumn(index, "name", event.target.value)}
                                    placeholder="nome"
                                    className="h-9"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={column.dataType}
                                    onValueChange={(value) => updateColumn(index, "dataType", value)}
                                  >
                                    <SelectTrigger className="h-9">
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
                                    placeholder="100"
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
                                    className="h-9"
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
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="foreign-keys">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base">Chaves Estrangeiras</CardTitle>
                        <CardDescription>Relacionamentos detectados na tabela selecionada.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <MetadataList
                          items={table?.foreignKeys ?? []}
                          emptyText="Nenhuma chave estrangeira encontrada."
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="indexes">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base">Índices</CardTitle>
                        <CardDescription>Índices já existentes nesta tabela.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <MetadataList items={table?.indexes ?? []} emptyText="Nenhum índice encontrado." />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="triggers">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base">Triggers</CardTitle>
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
                        <CardTitle className="text-base">Functions</CardTitle>
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
                        <CardTitle className="text-base">Avançado</CardTitle>
                        <CardDescription>Opções avançadas da criação de tabela.</CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>

                  <TabsContent value="sql-preview">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base">SQL Preview</CardTitle>
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
