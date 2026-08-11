"use client"

import { useState } from "react"
import { Hash, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { getFallbackSchemaName } from "@/helpers/connections"
import type { DatabaseStructureDatabase, SavedConnection } from "@/types/connections"

type CreateSequenceModalProps = {
  open: boolean
  connection: SavedConnection | null
  database: DatabaseStructureDatabase | null
  databaseName?: string
  schemaName?: string
  onOpenChange: (open: boolean) => void
  onSaved: (details: {
    message: string
    details: string
    sequenceName: string
    schemaName: string
  }) => void | Promise<void>
}

type SequenceDraft = {
  sequenceName: string
  startValue: string
  incrementBy: string
  minValue: string
  maxValue: string
  cacheValue: string
  cycle: boolean
}

function getInitialDraft(): SequenceDraft {
  return {
    sequenceName: "",
    startValue: "1",
    incrementBy: "1",
    minValue: "",
    maxValue: "",
    cacheValue: "1",
    cycle: false,
  }
}

export function CreateSequenceModal({
  open,
  connection,
  databaseName,
  schemaName,
  onOpenChange,
  onSaved,
}: CreateSequenceModalProps) {
  const [form, setForm] = useState<SequenceDraft>(() => getInitialDraft())
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!connection || connection.databaseType !== "postgresql") {
    return null
  }

  const activeConnection = connection
  const targetDatabaseName = databaseName || connection.databaseName || "postgres"
  const targetSchemaName = schemaName || getFallbackSchemaName(connection)
  const canSave = Boolean(form.sequenceName.trim()) && !saving

  function updateField(field: keyof SequenceDraft, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSave() {
    if (!form.sequenceName.trim()) {
      setErrorMessage("Informe o nome da sequence.")
      return
    }

    setSaving(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/connections/${activeConnection.id}/sequences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          databaseName: targetDatabaseName,
          schemaName: targetSchemaName,
          sequenceName: form.sequenceName,
          startValue: form.startValue,
          incrementBy: form.incrementBy,
          minValue: form.minValue,
          maxValue: form.maxValue,
          cacheValue: form.cacheValue,
          cycle: form.cycle,
        }),
      })

      const payload: {
        success: boolean
        message: string
        details: string
        sequenceName?: string
        schemaName?: string
      } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.details || payload.message || "Não foi possível criar a sequence.")
        return
      }

      setForm(getInitialDraft())
      onOpenChange(false)
      await onSaved({
        message: payload.message,
        details: payload.details,
        sequenceName: payload.sequenceName || form.sequenceName.trim(),
        schemaName: payload.schemaName || targetSchemaName,
      })
    } catch {
      setErrorMessage("Falha inesperada ao criar a sequence.")
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
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-white/10 px-4 py-4 pr-14 sm:px-6 sm:pr-16">
            <DialogHeader className="text-left">
              <div className="flex items-start gap-4">
                <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-2 text-sky-300">
                  <Hash className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle>Criar sequence</DialogTitle>
                  <DialogDescription>
                    Crie uma sequence no schema {targetSchemaName} do banco {targetDatabaseName}.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <Card className="border-white/10 bg-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-base text-white">Configuração</CardTitle>
                <CardDescription>Defina o nome e os parâmetros numéricos da sequence.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sequence-name">Nome da sequence</Label>
                  <Input
                    id="sequence-name"
                    value={form.sequenceName}
                    onChange={(event) => updateField("sequenceName", event.target.value)}
                    placeholder="ex.: clientes_id_seq"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sequence-start">Start</Label>
                    <Input
                      id="sequence-start"
                      value={form.startValue}
                      onChange={(event) => updateField("startValue", event.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sequence-increment">Incremento</Label>
                    <Input
                      id="sequence-increment"
                      value={form.incrementBy}
                      onChange={(event) => updateField("incrementBy", event.target.value)}
                      placeholder="1"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sequence-min">Valor mínimo</Label>
                    <Input
                      id="sequence-min"
                      value={form.minValue}
                      onChange={(event) => updateField("minValue", event.target.value)}
                      placeholder="Sem mínimo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sequence-max">Valor máximo</Label>
                    <Input
                      id="sequence-max"
                      value={form.maxValue}
                      onChange={(event) => updateField("maxValue", event.target.value)}
                      placeholder="Sem máximo"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="sequence-cache">Cache</Label>
                    <Input
                      id="sequence-cache"
                      value={form.cacheValue}
                      onChange={(event) => updateField("cacheValue", event.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white/75">
                    <Checkbox
                      checked={form.cycle}
                      onChange={(event) => updateField("cycle", event.currentTarget.checked)}
                    />
                    Cycle
                  </label>
                </div>
              </CardContent>
            </Card>

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-50">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <Separator className="bg-white/10" />

          <div className="shrink-0 px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-xs text-white/45">
                <Hash className="size-3.5" />
                <span className="truncate">{targetSchemaName}</span>
              </div>
              <div className="flex flex-wrap gap-3 sm:justify-end">
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
                  disabled={!canSave}
                  className="bg-sky-500 text-white hover:bg-sky-400"
                >
                  {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Criar sequence
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
