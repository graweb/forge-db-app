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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { SavedConnection } from "@/lib/connections"

type CreateTableColumnDraft = {
  name: string
  dataType: string
  size: string
  notNull: boolean
  primaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

type CreateTableDraft = {
  schemaName: string
  tableName: string
  comment: string
  columns: CreateTableColumnDraft[]
}

type CreateTableModalProps = {
  open: boolean
  connection: SavedConnection | null
  databaseName?: string
  schemaName?: string
  schemaOptions?: string[]
  onOpenChange: (open: boolean) => void
  onSaved: (details: { message: string; details: string }) => void | Promise<void>
}

const typeOptions = [
  { value: "INTEGER", label: "integer" },
  { value: "INT", label: "int" },
  { value: "BIGINT", label: "bigint" },
  { value: "VARCHAR", label: "varchar" },
  { value: "TEXT", label: "text" },
  { value: "TIMESTAMP", label: "timestamp" },
  { value: "BOOLEAN", label: "boolean" },
  { value: "DECIMAL", label: "decimal" },
  { value: "DATE", label: "date" },
]

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
  schemaName?: string,
  schemaOptions?: string[]
): CreateTableDraft {
  const defaultSchema =
    schemaName?.trim() || schemaOptions?.[0] || (connection.databaseType === "sqlite" ? "main" : "public")

  return {
    schemaName: defaultSchema,
    tableName: "",
    comment: "",
    columns: [getDefaultColumn(connection.databaseType)],
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

function createEmptyDraft(schemaName?: string, schemaOptions?: string[]): CreateTableDraft {
  const defaultSchema = schemaName?.trim() || schemaOptions?.[0] || "public"

  return {
    schemaName: defaultSchema,
    tableName: "",
    comment: "",
    columns: [getDefaultColumn("mysql")],
  }
}

export function CreateTableModal({
  open,
  connection,
  databaseName,
  schemaName,
  schemaOptions,
  onOpenChange,
  onSaved,
}: CreateTableModalProps) {
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [form, setForm] = useState<CreateTableDraft>(() =>
    connection ? getInitialDraft(connection, schemaName, schemaOptions) : createEmptyDraft(schemaName, schemaOptions)
  )

  if (!connection) {
    return null
  }

  const availableSchemas = schemaOptions?.length ? schemaOptions : [form.schemaName]
  const isSingleSchema = availableSchemas.length === 1

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
        {
          name: "",
          dataType: "VARCHAR",
          size: "",
          notNull: false,
          primaryKey: false,
          autoIncrement: false,
          defaultValue: "",
          comment: "",
        },
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
      const response = await fetch(`/api/connections/${connection.id}/tables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          databaseName: databaseName || connection.databaseName,
          schemaName: form.schemaName,
          tableName: form.tableName,
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
        setErrorMessage(payload.details || payload.message || "Não foi possível criar a tabela.")
        return
      }

      onOpenChange(false)
      await onSaved({ message: payload.message, details: payload.details })
    } catch {
      setErrorMessage("Falha inesperada ao criar a tabela.")
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
                  <DialogTitle>Nova Tabela</DialogTitle>
                  <DialogDescription>
                    Crie uma nova tabela no esquema {form.schemaName}.{" "}
                    {getDatabaseTypeDescription(connection.databaseType)}
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
                    {isSingleSchema ? (
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
                              <TableRow key={`${column.name || "column"}-${index}`} className="h-12">
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
                        <CardDescription>
                          Seção pronta para vínculo entre tabelas, mantendo a estrutura visual do shadcn.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>

                  <TabsContent value="indexes">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base">Índices</CardTitle>
                        <CardDescription>Configure índices e otimização de acesso aqui.</CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>

                  <TabsContent value="triggers">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base">Triggers</CardTitle>
                        <CardDescription>Espaço reservado para regras automáticas da tabela.</CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>

                  <TabsContent value="functions">
                    <Card className="border-white/10 bg-white/5">
                      <CardHeader>
                        <CardTitle className="text-base">Functions</CardTitle>
                        <CardDescription>Defina funções auxiliares vinculadas à tabela.</CardDescription>
                      </CardHeader>
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
                        <CardDescription>Pré-visualização do comando final será exibida aqui.</CardDescription>
                      </CardHeader>
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
              {databaseName || connection.connectionName}
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
                {saving ? "Criando..." : "Criar Tabela"}
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
