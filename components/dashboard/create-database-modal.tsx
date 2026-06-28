"use client"

import { useState } from "react"
import { Database, Globe2, Loader2, Server } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { cn } from "@/helpers/utils"
import type {
  DatabaseModalMode,
  DatabaseDraft,
  DatabaseInfo,
  DatabaseModalProps,
} from "@/types/dashboard-modals"
import type { SavedConnection } from "@/types/connections"

const createCharsetOptions: Record<
  Exclude<SavedConnection["databaseType"], "sqlite">,
  Array<{ value: string; label: string }>
> = {
  mysql: [
    { value: "utf8mb4", label: "utf8mb4" },
    { value: "utf8", label: "utf8" },
    { value: "latin1", label: "latin1" },
    { value: "ascii", label: "ascii" },
  ],
  mariadb: [
    { value: "utf8mb4", label: "utf8mb4" },
    { value: "utf8", label: "utf8" },
    { value: "latin1", label: "latin1" },
    { value: "ascii", label: "ascii" },
  ],
  postgresql: [
    { value: "UTF8", label: "UTF8" },
    { value: "LATIN1", label: "LATIN1" },
  ],
  sqlserver: [{ value: "default", label: "Padrão do servidor" }],
}

function getDefaultCreateCharset(databaseType: Exclude<SavedConnection["databaseType"], "sqlite">) {
  switch (databaseType) {
    case "postgresql":
      return "UTF8"
    case "sqlserver":
      return "default"
    default:
      return "utf8mb4"
  }
}

function getFieldLabel(databaseType: Exclude<SavedConnection["databaseType"], "sqlite">) {
  switch (databaseType) {
    case "postgresql":
      return "Encoding"
    case "sqlserver":
      return "Collation"
    default:
      return "Charset"
  }
}

function getFieldHelpText(
  mode: DatabaseModalMode,
  databaseType: Exclude<SavedConnection["databaseType"], "sqlite">
) {
  if (mode === "create") {
    switch (databaseType) {
      case "postgresql":
        return "O encoding será aplicado ao criar o banco com template0."
      case "sqlserver":
        return "SQL Server não usa charset nesta operação. O valor é apenas informativo."
      default:
        return "O charset será aplicado ao novo banco de dados."
    }
  }

  switch (databaseType) {
    case "mysql":
    case "mariadb":
      return "No modo de edição, apenas o charset pode ser alterado."
    case "postgresql":
      return "O encoding é exibido para referência e não pode ser alterado nesta tela."
    case "sqlserver":
      return "A collation é exibida para referência e não pode ser alterada nesta tela."
  }
}

function getModalTitle(mode: DatabaseModalMode) {
  return mode === "edit" ? "Editar banco de dados" : "Criar banco de dados"
}

function getModalDescription(
  mode: DatabaseModalMode,
  connectionName: string,
  databaseType: Exclude<SavedConnection["databaseType"], "sqlite">,
  databaseName?: string
) {
  const databaseTypeLabel = getDatabaseTypeLabel(databaseType)

  if (mode === "edit") {
    return `Atualize os dados de ${databaseName ?? "banco selecionado"} na conexão ${connectionName}. ${databaseTypeLabel}.`
  }

  return `Crie um novo banco usando a conexão ${connectionName}. ${databaseTypeLabel}.`
}

function getDatabaseTypeLabel(databaseType: Exclude<SavedConnection["databaseType"], "sqlite">) {
  switch (databaseType) {
    case "mysql":
      return "MySQL exige charset no banco criado."
    case "mariadb":
      return "MariaDB exige charset no banco criado."
    case "postgresql":
      return "PostgreSQL trabalha com encoding."
    case "sqlserver":
      return "SQL Server trabalha com collation."
  }
}

function getInitialDraft(
  mode: DatabaseModalMode,
  databaseType: Exclude<SavedConnection["databaseType"], "sqlite">,
  database?: DatabaseInfo | null
): DatabaseDraft {
  const databaseName = mode === "edit" ? database?.name ?? "" : ""
  const fallbackCharset = getDefaultCreateCharset(databaseType)
  const charset =
    database?.charset ??
    database?.encoding ??
    database?.collation ??
    fallbackCharset

  return {
    name: databaseName,
    charset,
  }
}

export function CreateDatabaseModal({
  open,
  mode,
  connection,
  database,
  onOpenChange,
  onSaved,
}: DatabaseModalProps) {
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [form, setForm] = useState<DatabaseDraft>(() =>
    connection && connection.databaseType !== "sqlite"
      ? getInitialDraft(mode, connection.databaseType, database ?? null)
      : {
          name: "",
          charset: "",
        }
  )

  if (!connection || connection.databaseType === "sqlite") {
    return null
  }

  const databaseType = connection.databaseType
  const currentDatabase = database ?? null
  const activeConnection = connection
  const canEditName = mode === "create" || databaseType === "postgresql" || databaseType === "sqlserver"
  const canEditCharset = mode === "create" || databaseType === "mysql" || databaseType === "mariadb"

  function updateForm(field: keyof DatabaseDraft, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSave() {
    const databaseName = form.name.trim()

    if (!databaseName) {
      setErrorMessage("Informe o nome do banco de dados.")
      return
    }

    setSaving(true)
    setErrorMessage(null)

    try {
      const endpoint =
        mode === "edit" && currentDatabase
          ? `/api/connections/${activeConnection.id}/databases/${encodeURIComponent(currentDatabase.name)}`
          : `/api/connections/${activeConnection.id}/databases`

      const response = await fetch(endpoint, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          databaseName,
          charset: form.charset,
        }),
      })

      const payload: {
        success: boolean
        message: string
        details: string
      } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.details || payload.message || "Não foi possível salvar o banco.")
        return
      }

      onOpenChange(false)
      await onSaved({ message: payload.message, details: payload.details })
    } catch {
      setErrorMessage(
        mode === "edit"
          ? "Falha inesperada ao atualizar o banco de dados."
          : "Falha inesperada ao criar o banco de dados."
      )
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel = getFieldLabel(databaseType)
  const helperText = getFieldHelpText(mode, databaseType)
  const title = getModalTitle(mode)
  const description = getModalDescription(
    mode,
    connection.connectionName,
    databaseType,
    currentDatabase?.name
  )

  const readOnlyValue =
    databaseType === "postgresql"
      ? currentDatabase?.encoding ?? form.charset
      : databaseType === "sqlserver"
        ? currentDatabase?.collation ?? form.charset
        : form.charset

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,19,35,0.98),rgba(9,14,27,0.98))] p-0 text-white shadow-[0_24px_90px_-35px_rgba(0,0,0,0.95)]">
        <div className="max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="border-b border-white/10 px-5 py-4 pr-16">
            <DialogHeader className="text-left">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="databaseName">Nome do banco</Label>
                <Input
                  id="databaseName"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Ex.: analytics"
                  readOnly={!canEditName}
                  className={!canEditName ? "bg-white/4 text-white/75" : undefined}
                />
                {!canEditName ? (
                  <p className="text-xs leading-5 text-white/45">
                    O nome fica somente leitura para este tipo de banco nesta tela.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="charset">{fieldLabel}</Label>
                {canEditCharset ? (
                  <Select
                    value={form.charset}
                    onValueChange={(value) => updateForm("charset", value)}
                  >
                    <SelectTrigger id="charset">
                      <SelectValue placeholder={`Selecione ${fieldLabel.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {createCharsetOptions[databaseType].map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="charset"
                    value={readOnlyValue}
                    readOnly
                    className="bg-white/4 text-white/75"
                  />
                )}
                <p className="text-xs leading-5 text-white/45">{helperText}</p>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-white/8 pt-4">
              <div className="flex items-center gap-2 text-xs text-white/45">
                {databaseType === "postgresql" ? (
                  <Globe2 className="size-3.5" />
                ) : databaseType === "sqlserver" ? (
                  <Server className="size-3.5" />
                ) : (
                  <Database className="size-3.5" />
                )}
                {connection.connectionName}
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => onOpenChange(false)}
                  className="border-white/10 bg-white/4 text-white hover:bg-white/8"
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
                  {saving ? (mode === "edit" ? "Atualizando..." : "Criando...") : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
