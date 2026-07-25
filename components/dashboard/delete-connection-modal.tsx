"use client"

import { useState } from "react"
import { AlertTriangle, Loader2, Plug } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { SavedConnection } from "@/types/connections"

type DeleteConnectionModalProps = {
  open: boolean
  connection: SavedConnection | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void | Promise<void>
}

export function DeleteConnectionModal({
  open,
  connection,
  onOpenChange,
  onDeleted,
}: DeleteConnectionModalProps) {
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!connection) {
    return null
  }

  const activeConnection = connection

  async function handleDelete() {
    setSaving(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/connections/${activeConnection.id}`, {
        method: "DELETE",
      })

      const payload: {
        success: boolean
        message?: string
        details?: string
      } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.details || payload.message || "Não foi possível remover a conexão.")
        return
      }

      onOpenChange(false)
      await onDeleted()
    } catch {
      setErrorMessage("Falha inesperada ao remover a conexão.")
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
              <DialogTitle>Remover conexão</DialogTitle>
              <DialogDescription>
                Essa ação remove apenas a conexão salva no Forge DB. O banco de dados não será
                apagado.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 p-5">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <p>
                  Ao confirmar, a conexão {activeConnection.connectionName} será removida da lista
                  de conexões.
                </p>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-xs text-white/45">
                <Plug className="size-3.5" />
                <span className="truncate">{activeConnection.connectionName}</span>
              </div>
              <div className="flex flex-wrap gap-3 sm:justify-end">
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
                  {saving ? "Removendo..." : "Sim, remover"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
