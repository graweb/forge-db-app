"use client"

import { useState } from "react"
import { Loader2, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { cn } from "@/helpers/utils"
import type { CreateUserDraft, CreateUserModalProps, CreateUserPermissionDraft } from "@/types/dashboard-modals"
import type { SavedConnection } from "@/types/connections"
import { getFallbackSchemaName } from "@/helpers/connections"

type PermissionOption = CreateUserPermissionDraft

const permissionOptionsByType: Record<
  Exclude<SavedConnection["databaseType"], "sqlite">,
  PermissionOption[]
> = {
  mysql: [
    { key: "SELECT", label: "SELECT", description: "Permite leitura de registros." },
    { key: "INSERT", label: "INSERT", description: "Permite inserir registros." },
    { key: "UPDATE", label: "UPDATE", description: "Permite atualizar registros." },
    { key: "DELETE", label: "DELETE", description: "Permite excluir registros." },
    { key: "CREATE", label: "CREATE", description: "Permite criar tabelas e objetos." },
    { key: "ALTER", label: "ALTER", description: "Permite alterar estrutura de objetos." },
    { key: "DROP", label: "DROP", description: "Permite remover objetos." },
    { key: "INDEX", label: "INDEX", description: "Permite criar índices." },
    { key: "EXECUTE", label: "EXECUTE", description: "Permite executar rotinas." },
    { key: "TRIGGER", label: "TRIGGER", description: "Permite criar triggers." },
    { key: "REFERENCES", label: "REFERENCES", description: "Permite criar referências FK." },
  ],
  mariadb: [
    { key: "SELECT", label: "SELECT", description: "Permite leitura de registros." },
    { key: "INSERT", label: "INSERT", description: "Permite inserir registros." },
    { key: "UPDATE", label: "UPDATE", description: "Permite atualizar registros." },
    { key: "DELETE", label: "DELETE", description: "Permite excluir registros." },
    { key: "CREATE", label: "CREATE", description: "Permite criar tabelas e objetos." },
    { key: "ALTER", label: "ALTER", description: "Permite alterar estrutura de objetos." },
    { key: "DROP", label: "DROP", description: "Permite remover objetos." },
    { key: "INDEX", label: "INDEX", description: "Permite criar índices." },
    { key: "EXECUTE", label: "EXECUTE", description: "Permite executar rotinas." },
    { key: "TRIGGER", label: "TRIGGER", description: "Permite criar triggers." },
    { key: "REFERENCES", label: "REFERENCES", description: "Permite criar referências FK." },
  ],
  postgresql: [
    { key: "CONNECT", label: "CONNECT", description: "Permite conectar ao banco." },
    { key: "USAGE", label: "USAGE", description: "Permite usar o schema alvo." },
    { key: "CREATE", label: "CREATE", description: "Permite criar objetos no schema." },
    { key: "SELECT", label: "SELECT", description: "Permite leitura de tabelas." },
    { key: "INSERT", label: "INSERT", description: "Permite inserir registros." },
    { key: "UPDATE", label: "UPDATE", description: "Permite atualizar registros." },
    { key: "DELETE", label: "DELETE", description: "Permite excluir registros." },
    { key: "REFERENCES", label: "REFERENCES", description: "Permite criar referências FK." },
    { key: "TRIGGER", label: "TRIGGER", description: "Permite criar triggers." },
  ],
  sqlserver: [
    { key: "DB_DATAREADER", label: "db_datareader", description: "Permite leitura de dados." },
    { key: "DB_DATAWRITER", label: "db_datawriter", description: "Permite escrita de dados." },
    { key: "DB_DDLADMIN", label: "db_ddladmin", description: "Permite DDL no banco." },
    { key: "DB_OWNER", label: "db_owner", description: "Concede controle total do banco." },
  ],
}

function getInitialDraft(connection: SavedConnection): CreateUserDraft {
  return {
    userName: "",
    password: "",
    confirmPassword: "",
    host: connection.databaseType === "mysql" || connection.databaseType === "mariadb" ? "%" : "",
    permissions: [],
  }
}

function getTargetSummary(
  connection: SavedConnection,
  databaseName?: string,
  schemaName?: string
) {
  const targetDatabaseName = databaseName || connection.databaseName || "database"
  const targetSchemaName = schemaName || getFallbackSchemaName(connection)

  if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
    return `Permissões serão aplicadas em ${targetDatabaseName}.`
  }

  if (connection.databaseType === "postgresql") {
    return `Permissões serão aplicadas no banco ${targetDatabaseName} e no schema ${targetSchemaName}.`
  }

  return `Permissões serão aplicadas no banco ${targetDatabaseName}.`
}

export function CreateUserModal({
  open,
  connection,
  databaseName,
  schemaName,
  onOpenChange,
  onSaved,
}: CreateUserModalProps) {
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fallbackConnection = { databaseType: "mysql" } as SavedConnection
  const activeConnection = connection ?? fallbackConnection
  const [form, setForm] = useState<CreateUserDraft>(() =>
    getInitialDraft(activeConnection)
  )

  if (!connection || connection.databaseType === "sqlite") {
    return null
  }

  const permissionOptions = permissionOptionsByType[connection.databaseType]
  const targetSummary = getTargetSummary(connection, databaseName, schemaName)

  function updateField(field: keyof CreateUserDraft, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function togglePermission(permissionKey: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      permissions: checked
        ? Array.from(new Set([...current.permissions, permissionKey]))
        : current.permissions.filter((item) => item !== permissionKey),
    }))
  }

  async function handleSave() {
    const userName = form.userName.trim()
    const password = form.password.trim()

    if (!userName) {
      setErrorMessage("Informe o nome do usuário.")
      return
    }

    if (!password) {
      setErrorMessage("Informe a senha do usuário.")
      return
    }

    if (password !== form.confirmPassword.trim()) {
      setErrorMessage("A confirmação da senha não confere.")
      return
    }

    setSaving(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/connections/${activeConnection.id}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userName,
          password,
          host: form.host,
          databaseName: databaseName || activeConnection.databaseName,
          schemaName: schemaName || getFallbackSchemaName(activeConnection),
          permissions: form.permissions,
        }),
      })

      const payload: {
        success: boolean
        message: string
        details: string
      } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.details || payload.message || "Não foi possível criar o usuário.")
        return
      }

      onOpenChange(false)
      await onSaved({ message: payload.message, details: payload.details })
    } catch {
      setErrorMessage("Falha inesperada ao criar o usuário.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="right"
        className="overflow-hidden rounded-l-[2rem] border-l border-white/10 bg-[linear-gradient(180deg,rgba(14,19,35,0.98),rgba(9,14,27,0.98))] p-0 text-white shadow-[0_24px_90px_-35px_rgba(0,0,0,0.95)]"
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-b border-white/10 px-6 py-5 pr-16">
            <DialogHeader className="text-left">
              <div className="flex items-start gap-4">
                <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-2 text-sky-300">
                  <UserPlus className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle>Criar usuário</DialogTitle>
                  <DialogDescription>
                    Crie um usuário e selecione as permissões desejadas para a conexão {connection.connectionName}.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <Card className="border-white/10 bg-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-base text-white">Credenciais</CardTitle>
                <CardDescription>{targetSummary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="user-name">Nome do usuário</Label>
                    <Input
                      id="user-name"
                      value={form.userName}
                      onChange={(event) => updateField("userName", event.target.value)}
                      placeholder="ex.: app_user"
                    />
                  </div>

                  {connection.databaseType === "mysql" || connection.databaseType === "mariadb" ? (
                    <div className="space-y-2">
                      <Label htmlFor="user-host">Host</Label>
                      <Input
                        id="user-host"
                        value={form.host}
                        onChange={(event) => updateField("host", event.target.value)}
                        placeholder="%"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="user-password">Senha</Label>
                    <Input
                      id="user-password"
                      type="password"
                      value={form.password}
                      onChange={(event) => updateField("password", event.target.value)}
                      placeholder="Senha segura"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-confirm-password">Confirmar senha</Label>
                    <Input
                      id="user-confirm-password"
                      type="password"
                      value={form.confirmPassword}
                      onChange={(event) => updateField("confirmPassword", event.target.value)}
                      placeholder="Repita a senha"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Separator className="my-5 bg-white/10" />

            <Card className="border-white/10 bg-white/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Permissões</CardTitle>
                <CardDescription>Selecione uma ou mais permissões para o novo usuário.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {permissionOptions.map((option) => {
                    const checked = form.permissions.includes(option.key)

                    return (
                      <label
                        key={option.key}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
                          checked
                            ? "border-sky-400/35 bg-sky-400/10"
                            : "border-white/10 bg-white/3 hover:bg-white/5"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={(event) => togglePermission(option.key, event.currentTarget.checked)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-white">{option.label}</span>
                          <span className="block text-xs leading-5 text-white/55">{option.description}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-50">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
            <div className="flex items-center gap-2 text-xs text-white/45">
              <UserPlus className="size-3.5" />
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
                className="bg-sky-500 text-white hover:bg-sky-400"
              >
                {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Criar usuário
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
