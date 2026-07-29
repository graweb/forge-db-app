"use client"

import { useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { DeleteRoutineModalProps } from "@/types/dashboard-modals"

export function DeleteRoutineModal({
  open,
  connection,
  database,
  schemaName,
  routineName,
  kind,
  onOpenChange,
  onDeleted,
}: DeleteRoutineModalProps) {
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!connection || !database || !routineName) {
    return null
  }

  const activeConnection = connection
  const activeDatabase = database
  const activeRoutineName = routineName
  const resolvedSchemaName = schemaName || (activeConnection.databaseType === "sqlserver" ? "dbo" : "public")
  const resolvedDatabaseName = activeConnection.databaseType === "sqlite" ? activeConnection.databaseName : activeDatabase.name
  const routineLabel = kind === "procedure" ? "procedure" : "função"

  async function handleDelete() {
    setSaving(true)
    setErrorMessage(null)

    try {
      const response = await fetch(
        `/api/connections/${activeConnection.id}/routines/${encodeURIComponent(activeRoutineName)}?databaseName=${encodeURIComponent(
          resolvedDatabaseName
        )}&schemaName=${encodeURIComponent(resolvedSchemaName)}&kind=${kind}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      const payload: { success: boolean; message?: string; details?: string } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.details || payload.message || `Não foi possível excluir a ${routineLabel}.`)
        return
      }

      onOpenChange(false)
      await onDeleted()
    } catch {
      setErrorMessage(`Falha inesperada ao excluir a ${routineLabel}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,19,35,0.98),rgba(9,14,27,0.98))] p-0 text-white shadow-[0_24px_90px_-35px_rgba(0,0,0,0.95)]">
        <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <div className="border-b border-white/10 px-5 py-4 pr-16">
            <DialogHeader className="text-left">
              <DialogTitle>Excluir {routineLabel}</DialogTitle>
              <DialogDescription>
                Essa ação não pode ser desfeita. A rotina {routineName} será removida da conexão{" "}
                {activeConnection.connectionName}.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 p-5">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <p>Ao confirmar, a {routineLabel} será excluída diretamente do banco de dados.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3 text-sm leading-6 text-white/65">
              <div className="grid gap-1">
                <span>Banco: {activeDatabase.name}</span>
                <span>Schema: {resolvedSchemaName}</span>
                <span>Rotina: {activeRoutineName}</span>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 border-t border-white/8 pt-4">
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
                onClick={handleDelete}
                disabled={saving}
                className="bg-linear-to-r from-rose-500 to-red-600 text-white shadow-[0_18px_45px_-18px_rgba(239,68,68,0.8)] hover:from-rose-400 hover:to-red-500"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Excluindo..." : "Sim, excluir"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
