"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import { Braces, Code2, Database, FileCode2, Loader2, Plus, Settings2, Sparkles, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { DatabaseType } from "@/types/connections"
import type { CreateRoutineModalProps, RoutineKind } from "@/types/dashboard-modals"

type AdvancedField = "deterministic" | "securityDefiner" | "volatility" | "transactionControl"

type RoutineCapabilities = {
  supportsProcedures: boolean
  supportsFunctions: boolean
  supportsCreateOrReplace: boolean
  parameterModes: Array<"IN" | "OUT" | "INOUT">
  returnModes: Array<"scalar" | "table" | "set">
  languages: string[]
  advancedFields: AdvancedField[]
  dataTypes: string[]
}

type RoutineParameterDraft = {
  id: string
  name: string
  dataType: string
  mode: "IN" | "OUT" | "INOUT"
  defaultValue: string
}

const DEFAULT_DATA_TYPES = ["TEXT", "INTEGER", "BOOLEAN", "NUMERIC", "JSON"]

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-56 items-center justify-center rounded-b-2xl bg-[#050913] text-sm text-white/45">
      Carregando editor SQL...
    </div>
  ),
})

export function CreateRoutineModal({
  open,
  connection,
  mode = "create",
  database,
  databaseName,
  schemaName,
  initialRoutine,
  initialKind,
  onOpenChange,
  onSaved,
}: CreateRoutineModalProps) {
  const initialSchemaName = initialRoutine?.schemaName || schemaName || database?.schemas[0]?.name || "public"
  const initialCapabilities = getRoutineCapabilities(connection?.databaseType, initialKind)
  const [kind, setKind] = useState<RoutineKind>(initialKind)
  const [routineName, setRoutineName] = useState(initialRoutine?.routineName ?? "")
  const [activeSchemaName, setActiveSchemaName] = useState(initialSchemaName)
  const [description, setDescription] = useState("")
  const [returnType, setReturnType] = useState(getDefaultReturnType(initialCapabilities, initialKind))
  const [language, setLanguage] = useState(initialCapabilities.languages[0] ?? "SQL")
  const [deterministic, setDeterministic] = useState(false)
  const [securityDefiner, setSecurityDefiner] = useState(false)
  const [parameters, setParameters] = useState<RoutineParameterDraft[]>([])
  const [sqlText, setSqlText] = useState(
    initialRoutine?.sqlText ||
      buildRoutineTemplate(initialKind, connection?.databaseType, initialSchemaName, "nova_rotina")
  )
  const sqlTextRef = useRef(sqlText)
  const editorRef = useRef<{ getValue: () => string; setValue: (value: string) => void } | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const schemaOptions = useMemo(() => {
    const names = database?.schemas.map((schema) => schema.name).filter(Boolean) ?? []
    const fallback = initialRoutine?.schemaName || schemaName || names[0] || "public"
    return Array.from(new Set([fallback, ...names]))
  }, [database, initialRoutine?.schemaName, schemaName])

  useEffect(() => {
    if (!open) {
      return
    }

    const nextKind = initialRoutine?.kind ?? initialKind
    const nextSchemaName = initialRoutine?.schemaName || initialSchemaName
    const nextRoutineName = initialRoutine?.routineName ?? ""
    const nextCapabilities = getRoutineCapabilities(connection?.databaseType, nextKind)
    const nextSqlText =
      initialRoutine?.sqlText ||
      buildRoutineTemplate(nextKind, connection?.databaseType, nextSchemaName, "nova_rotina")

    queueMicrotask(() => {
      setKind(nextKind)
      setRoutineName(nextRoutineName)
      setActiveSchemaName(nextSchemaName)
      setDescription("")
      setReturnType(getDefaultReturnType(nextCapabilities, nextKind))
      setLanguage(nextCapabilities.languages[0] ?? "SQL")
      setDeterministic(false)
      setSecurityDefiner(false)
      setParameters([])
      setErrorMessage(null)
      syncEditorSqlText(nextSqlText)
    })
  }, [
    connection?.databaseType,
    initialKind,
    initialRoutine?.kind,
    initialRoutine?.routineName,
    initialRoutine?.schemaName,
    initialRoutine?.sqlText,
    initialSchemaName,
    open,
  ])

  if (!connection || !database) {
    return null
  }

  const resolvedDatabaseName = databaseName || database.name || connection.databaseName
  const databaseType = connection.databaseType
  const capabilities = getRoutineCapabilities(databaseType, kind)
  const supportsRoutine =
    kind === "procedure" ? capabilities.supportsProcedures : capabilities.supportsFunctions
  const title =
    mode === "edit"
      ? kind === "procedure"
        ? "Editar procedure"
        : "Editar função"
      : kind === "procedure"
        ? "Nova procedure"
        : "Nova função"
  const canSave = supportsRoutine && Boolean(routineName.trim()) && Boolean(sqlText.trim())

  function syncEditorSqlText(nextSqlText: string) {
    sqlTextRef.current = nextSqlText
    setSqlText(nextSqlText)

    const editor = editorRef.current

    if (editor && editor.getValue() !== nextSqlText) {
      editor.setValue(nextSqlText)
    }
  }

  function handleSqlTextChange(nextSqlText: string) {
    sqlTextRef.current = nextSqlText
    setSqlText(nextSqlText)
  }

  function updateTemplate(
    nextKind = kind,
    nextSchemaName = activeSchemaName,
    nextRoutineName = routineName,
    nextParameters = parameters
  ) {
    const current = sqlTextRef.current
    const nextName = nextRoutineName || "nova_rotina"

    const nextSqlText = current.trim()
      ? replaceRoutineSignatureName(current, nextSchemaName, nextName) || buildRoutineTemplate(
        nextKind,
        databaseType,
        nextSchemaName,
        nextName,
        nextParameters
      )
      : buildRoutineTemplate(nextKind, databaseType, nextSchemaName, nextName, nextParameters)

    syncEditorSqlText(nextSqlText)
  }

  function handleKindChange(nextKind: RoutineKind) {
    const nextCapabilities = getRoutineCapabilities(databaseType, nextKind)
    const nextParameters = normalizeParametersForCapabilities(parameters, nextCapabilities)
    setKind(nextKind)
    setParameters(nextParameters)
    setReturnType(getDefaultReturnType(nextCapabilities, nextKind))
    setLanguage(nextCapabilities.languages[0] ?? "SQL")
    updateTemplate(nextKind, activeSchemaName, routineName, nextParameters)
  }

  function handleRoutineNameChange(nextRoutineName: string) {
    setRoutineName(nextRoutineName)
    updateTemplate(kind, activeSchemaName, nextRoutineName)
  }

  function handleSchemaChange(nextSchemaName: string) {
    setActiveSchemaName(nextSchemaName)
    updateTemplate(kind, nextSchemaName)
  }

  function syncParameters(nextParameters: RoutineParameterDraft[]) {
    const current = sqlTextRef.current
    const nextSqlText =
      replaceRoutineSignatureParameters(
        current,
        databaseType,
        kind,
        activeSchemaName,
        routineName || "nova_rotina",
        nextParameters
      ) ||
      buildRoutineTemplate(kind, databaseType, activeSchemaName, routineName || "nova_rotina", nextParameters)

    setParameters(nextParameters)
    syncEditorSqlText(nextSqlText)
  }

  function addParameter() {
    const nextParameter: RoutineParameterDraft = {
      id: createParameterId(),
      name: `param_${parameters.length + 1}`,
      dataType: capabilities.dataTypes[0] ?? DEFAULT_DATA_TYPES[0],
      mode: capabilities.parameterModes[0] ?? "IN",
      defaultValue: "",
    }

    syncParameters([...parameters, nextParameter])
  }

  function updateParameter(parameterId: string, field: keyof Omit<RoutineParameterDraft, "id">, value: string) {
    syncParameters(
      parameters.map((parameter) => {
        if (parameter.id !== parameterId) {
          return parameter
        }

        if (field === "mode") {
          return { ...parameter, mode: parseParameterMode(value, capabilities) }
        }

        return { ...parameter, [field]: value }
      })
    )
  }

  function removeParameter(parameterId: string) {
    syncParameters(parameters.filter((parameter) => parameter.id !== parameterId))
  }

  async function handleSave(createAnother = false) {
    if (!connection) {
      return
    }

    const normalizedRoutineName = routineName.trim()

    if (!normalizedRoutineName) {
      setErrorMessage("Informe o nome antes de salvar.")
      return
    }

    setSaving(true)
    setErrorMessage(null)

    try {
      const response = await fetch(
        mode === "edit"
          ? `/api/connections/${connection.id}/routines/${encodeURIComponent(initialRoutine?.routineName || normalizedRoutineName)}?databaseName=${encodeURIComponent(
              resolvedDatabaseName
            )}&schemaName=${encodeURIComponent(activeSchemaName)}&kind=${kind}`
          : `/api/connections/${connection.id}/query`,
        {
          method: mode === "edit" ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sql: sqlText,
            databaseName: resolvedDatabaseName,
            schemaName: activeSchemaName,
            kind,
          }),
        }
      )

      const payload: { success: boolean; message?: string; details?: string } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.details || payload.message || "Não foi possível salvar.")
        return
      }

      await onSaved({
        message: payload.message || (mode === "edit" ? "Rotina salva" : "Rotina criada"),
        details: payload.details || "A rotina foi salva com sucesso.",
        routineName: normalizedRoutineName,
        schemaName: activeSchemaName,
        kind,
      })

      if (createAnother) {
        setRoutineName("")
        setDescription("")
        setParameters([])
        setErrorMessage(null)
        setReturnType(getDefaultReturnType(capabilities, kind))
        setLanguage(capabilities.languages[0] ?? "SQL")
        syncEditorSqlText(buildRoutineTemplate(kind, databaseType, activeSchemaName, "nova_rotina"))
        return
      }

      onOpenChange(false)
    } catch {
      setErrorMessage("Falha inesperada ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100vw-1rem,72rem)] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,19,35,0.98),rgba(9,14,27,0.98))] p-0 text-white shadow-[0_24px_90px_-35px_rgba(0,0,0,0.95)]">
        <div className="flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-white/10 px-5 py-4 pr-16">
            <DialogHeader className="text-left">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
                  <Braces className="size-5" />
                </span>
                <span>
                  <DialogTitle className="text-xl text-white">{supportsRoutine ? title : "Nova rotina"}</DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-white/55">
                    {supportsRoutine
                      ? mode === "edit"
                        ? "Edite a definição da rotina e salve no banco."
                        : "Configure uma rotina compatível com a conexão ativa."
                      : "Este banco não oferece rotinas armazenadas compatíveis."}
                  </DialogDescription>
                </span>
              </div>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {!supportsRoutine ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-50">
                <div className="font-medium text-white">SQLite não oferece procedures ou funções armazenadas.</div>
                <p className="mt-2 text-amber-50/80">
                  Você pode criar uma view, trigger ou salvar um script reutilizável para executar depois.
                </p>
              </div>
            ) : (
            <Tabs defaultValue={initialKind} value={kind} onValueChange={(value) => handleKindChange(value as RoutineKind)}>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-white/10 bg-white/4 p-0 text-white/55">
                <TabsTrigger
                  value="procedure"
                  disabled={!getRoutineCapabilities(connection.databaseType, "procedure").supportsProcedures}
                  className="h-11 gap-2 rounded-xl border-b-0 data-[state=active]:border data-[state=active]:border-sky-400/25 data-[state=active]:bg-sky-400/10 data-[state=active]:text-sky-200"
                >
                  <Settings2 className="size-4" />
                  Procedure
                </TabsTrigger>
                <TabsTrigger
                  value="function"
                  disabled={!getRoutineCapabilities(connection.databaseType, "function").supportsFunctions}
                  className="h-11 gap-2 rounded-xl border-b-0 data-[state=active]:border data-[state=active]:border-sky-400/25 data-[state=active]:bg-sky-400/10 data-[state=active]:text-sky-200"
                >
                  <FileCode2 className="size-4" />
                  Função
                </TabsTrigger>
              </TabsList>

              <TabsContent value="procedure" className="mt-5">
                <RoutineForm
                  kind="procedure"
                  title={title}
                  routineName={routineName}
                  activeSchemaName={activeSchemaName}
                  description={description}
                  returnType={returnType}
                  language={language}
                  deterministic={deterministic}
                  securityDefiner={securityDefiner}
                  parameters={parameters}
                  sqlText={sqlText}
                  schemaOptions={schemaOptions}
                  capabilities={capabilities}
                  onRoutineNameChange={handleRoutineNameChange}
                  onSchemaChange={handleSchemaChange}
                  onDescriptionChange={setDescription}
                  onReturnTypeChange={setReturnType}
                  onLanguageChange={setLanguage}
                  onDeterministicChange={setDeterministic}
                  onSecurityDefinerChange={setSecurityDefiner}
                  onAddParameter={addParameter}
                  onUpdateParameter={updateParameter}
                  onRemoveParameter={removeParameter}
                  onEditorMount={(editor) => {
                    editorRef.current = editor
                  }}
                  onSqlTextChange={handleSqlTextChange}
                />
              </TabsContent>
              <TabsContent value="function" className="mt-5">
                <RoutineForm
                  kind="function"
                  title={title}
                  routineName={routineName}
                  activeSchemaName={activeSchemaName}
                  description={description}
                  returnType={returnType}
                  language={language}
                  deterministic={deterministic}
                  securityDefiner={securityDefiner}
                  parameters={parameters}
                  sqlText={sqlText}
                  schemaOptions={schemaOptions}
                  capabilities={capabilities}
                  onRoutineNameChange={handleRoutineNameChange}
                  onSchemaChange={handleSchemaChange}
                  onDescriptionChange={setDescription}
                  onReturnTypeChange={setReturnType}
                  onLanguageChange={setLanguage}
                  onDeterministicChange={setDeterministic}
                  onSecurityDefinerChange={setSecurityDefiner}
                  onAddParameter={addParameter}
                  onUpdateParameter={updateParameter}
                  onRemoveParameter={removeParameter}
                  onEditorMount={(editor) => {
                    editorRef.current = editor
                  }}
                  onSqlTextChange={handleSqlTextChange}
                />
              </TabsContent>
            </Tabs>
            )}

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#07111d]/95 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="border-white/10 bg-white/4 text-white hover:bg-white/8"
            >
              Cancelar
            </Button>
            <div className="flex items-center gap-3">
              {mode === "create" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => void handleSave(true)}
                  disabled={saving || !canSave}
                  className="border-sky-400/20 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15"
                >
                  Salvar e criar nova
                </Button>
              ) : null}
              <Button
                type="button"
                size="lg"
                onClick={() => void handleSave(false)}
                disabled={saving || !canSave}
                className="bg-linear-to-r from-sky-500 to-blue-600 text-white shadow-[0_18px_45px_-18px_rgba(14,165,233,0.8)] hover:from-sky-400 hover:to-blue-500"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === "edit" ? "Salvar alterações" : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RoutineForm({
  kind,
  routineName,
  activeSchemaName,
  description,
  returnType,
  language,
  deterministic,
  securityDefiner,
  parameters,
  sqlText,
  schemaOptions,
  capabilities,
  onRoutineNameChange,
  onSchemaChange,
  onDescriptionChange,
  onReturnTypeChange,
  onLanguageChange,
  onDeterministicChange,
  onSecurityDefinerChange,
  onAddParameter,
  onUpdateParameter,
  onRemoveParameter,
  onEditorMount,
  onSqlTextChange,
}: {
  kind: RoutineKind
  title: string
  routineName: string
  activeSchemaName: string
  description: string
  returnType: string
  language: string
  deterministic: boolean
  securityDefiner: boolean
  parameters: RoutineParameterDraft[]
  sqlText: string
  schemaOptions: string[]
  capabilities: RoutineCapabilities
  onRoutineNameChange: (value: string) => void
  onSchemaChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onReturnTypeChange: (value: string) => void
  onLanguageChange: (value: string) => void
  onDeterministicChange: (value: boolean) => void
  onSecurityDefinerChange: (value: boolean) => void
  onAddParameter: () => void
  onUpdateParameter: (parameterId: string, field: keyof Omit<RoutineParameterDraft, "id">, value: string) => void
  onRemoveParameter: (parameterId: string) => void
  onEditorMount: (editor: { getValue: () => string; setValue: (value: string) => void }) => void
  onSqlTextChange: (value: string) => void
}) {
  const returnTypes = getReturnTypes(capabilities)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/4 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <Database className="size-4 text-sky-300" />
          Geral
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-white/70">Nome *</Label>
            <Input
              value={routineName}
              onChange={(event) => onRoutineNameChange(event.target.value)}
              placeholder={kind === "procedure" ? "Ex.: sp_calcular_total" : "Ex.: fn_calcular_total"}
              className="border-white/10 bg-[#050913] text-white placeholder:text-white/35"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/70">Schema *</Label>
            <Select value={activeSchemaName} onValueChange={onSchemaChange}>
              <SelectTrigger className="border-white/10 bg-[#050913] text-white">
                <SelectValue placeholder="Schema" />
              </SelectTrigger>
              <SelectContent>
                {schemaOptions.map((schema) => (
                  <SelectItem key={schema} value={schema}>
                    {schema}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label className="text-white/70">Descrição</Label>
          <Textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={`Descrição opcional da ${kind === "procedure" ? "procedure" : "função"}...`}
            className="min-h-12 resize-none border-white/10 bg-[#050913] text-white placeholder:text-white/35"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/4 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <Code2 className="size-4 text-sky-300" />
          Parâmetros e retorno
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#050913]">
            <div className="grid grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_minmax(8rem,1fr)_2.5rem] border-b border-white/10 bg-white/4 px-3 py-2 text-xs font-medium text-white/45">
              <span>Nome</span>
              <span>Tipo</span>
              <span>Direção</span>
              <span>Padrão</span>
              <span />
            </div>
            {parameters.length ? (
              <div className="divide-y divide-white/8">
                {parameters.map((parameter) => (
                  <div
                    key={parameter.id}
                    className="grid grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_minmax(8rem,1fr)_2.5rem] items-center gap-2 px-3 py-2"
                  >
                    <Input
                      value={parameter.name}
                      onChange={(event) => onUpdateParameter(parameter.id, "name", event.target.value)}
                      placeholder="param_nome"
                      className="h-9 border-white/10 bg-white/4 text-white placeholder:text-white/35"
                    />
                    <Select
                      value={parameter.dataType}
                      onValueChange={(value) => onUpdateParameter(parameter.id, "dataType", value)}
                    >
                      <SelectTrigger className="h-9 border-white/10 bg-white/4 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {capabilities.dataTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={parameter.mode}
                      onValueChange={(value) => onUpdateParameter(parameter.id, "mode", value)}
                    >
                      <SelectTrigger className="h-9 border-white/10 bg-white/4 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {capabilities.parameterModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={parameter.defaultValue}
                      onChange={(event) => onUpdateParameter(parameter.id, "defaultValue", event.target.value)}
                      placeholder="Opcional"
                      className="h-9 border-white/10 bg-white/4 text-white placeholder:text-white/35"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveParameter(parameter.id)}
                      className="size-9 p-0 text-white/45 hover:bg-rose-400/10 hover:text-rose-200"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <div className="px-3 py-2">
                  <Button type="button" variant="outline" onClick={onAddParameter} className="border-sky-400/20 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15">
                    <Plus className="size-4" />
                    Adicionar parâmetro
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-34 flex-col items-center justify-center gap-3 text-sm text-white/45">
                <Sparkles className="size-7 text-white/35" />
                Nenhum parâmetro adicionado
                <Button type="button" variant="outline" onClick={onAddParameter} className="border-sky-400/20 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15">
                  <Plus className="size-4" />
                  Adicionar parâmetro
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-3 rounded-xl border border-white/10 bg-[#050913] p-3">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.18em] text-white/35">Modos permitidos</div>
              <div className="flex flex-wrap gap-2">
                {capabilities.parameterModes.map((mode) => (
                  <span key={mode} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60">
                    {mode}
                  </span>
                ))}
              </div>
            </div>
            {kind === "function" ? (
              <div className="space-y-2">
                <Label className="text-white/70">Retorno</Label>
                <Select value={returnType} onValueChange={onReturnTypeChange}>
                  <SelectTrigger className="border-white/10 bg-white/4 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {returnTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-white/50">
                Procedure não exige configuração de retorno.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/4">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileCode2 className="size-4 text-sky-300" />
            Definição
          </div>
          <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/45">
            {language}
          </span>
        </div>
        <div className="h-[clamp(14rem,32dvh,22rem)] overflow-hidden rounded-b-2xl bg-[#050913]">
          <MonacoEditor
            key={`routine-editor-${language}`}
            value={sqlText}
            onMount={(editor) => onEditorMount(editor)}
            onChange={(value) => onSqlTextChange(value ?? "")}
            defaultLanguage={getMonacoLanguage(language)}
            language={getMonacoLanguage(language)}
            theme="vs-dark"
            options={{
              automaticLayout: true,
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              smoothScrolling: true,
              lineNumbers: "on",
              renderLineHighlight: "all",
              tabSize: 2,
              padding: { top: 16, bottom: 16 },
              overviewRulerBorder: false,
              roundedSelection: false,
              cursorSmoothCaretAnimation: "on",
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
              parameterHints: { enabled: true },
              wordBasedSuggestions: "currentDocument",
            }}
            className="h-full"
            loading={<div className="p-4 text-sm text-white/45">Carregando editor SQL...</div>}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/4 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <Settings2 className="size-4 text-sky-300" />
          Opções avançadas
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-white/70">Linguagem</Label>
            <Select value={language} onValueChange={onLanguageChange}>
              <SelectTrigger className="border-white/10 bg-[#050913] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {capabilities.languages.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end gap-3">
            {capabilities.advancedFields.includes("deterministic") ? (
              <label className="flex items-center gap-3 text-sm text-white/60">
                <Checkbox checked={deterministic} onChange={(event) => onDeterministicChange(event.currentTarget.checked)} />
                Determinística
              </label>
            ) : null}
            {capabilities.advancedFields.includes("securityDefiner") ? (
              <label className="flex items-center gap-3 text-sm text-white/60">
                <Checkbox checked={securityDefiner} onChange={(event) => onSecurityDefinerChange(event.currentTarget.checked)} />
                Segurança definidor
              </label>
            ) : null}
            {capabilities.advancedFields.includes("volatility") ? (
              <span className="text-sm text-white/45">Volatilidade configurável pelo SQL gerado.</span>
            ) : null}
            {capabilities.advancedFields.includes("transactionControl") ? (
              <span className="text-sm text-white/45">Controle transacional disponível conforme a engine.</span>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

function getMonacoLanguage(language: string) {
  switch (language.toUpperCase()) {
    case "SQL":
    case "PLPGSQL":
    case "TSQL":
    case "MYSQL":
      return "sql"
    default:
      return language.toLowerCase()
  }
}

function getRoutineCapabilities(databaseType: DatabaseType | undefined, kind: RoutineKind): RoutineCapabilities {
  switch (databaseType) {
    case "mysql":
    case "mariadb":
      return {
        supportsProcedures: true,
        supportsFunctions: true,
        supportsCreateOrReplace: databaseType === "mariadb",
        parameterModes: kind === "procedure" ? ["IN", "OUT", "INOUT"] : ["IN"],
        returnModes: kind === "function" ? ["scalar"] : [],
        languages: ["SQL", "MYSQL"],
        advancedFields: ["deterministic", "securityDefiner"],
        dataTypes: ["VARCHAR(255)", "INT", "BIGINT", "DECIMAL(10,2)", "TEXT", "JSON", "DATETIME"],
      }
    case "postgresql":
      return {
        supportsProcedures: true,
        supportsFunctions: true,
        supportsCreateOrReplace: true,
        parameterModes: kind === "procedure" ? ["IN", "OUT", "INOUT"] : ["IN", "OUT", "INOUT"],
        returnModes: kind === "function" ? ["scalar", "table", "set"] : [],
        languages: ["PLPGSQL", "SQL"],
        advancedFields: kind === "function" ? ["securityDefiner", "volatility"] : ["securityDefiner", "transactionControl"],
        dataTypes: ["text", "integer", "bigint", "numeric", "boolean", "jsonb", "timestamp"],
      }
    case "sqlserver":
      return {
        supportsProcedures: true,
        supportsFunctions: true,
        supportsCreateOrReplace: true,
        parameterModes: kind === "procedure" ? ["IN", "OUT"] : ["IN"],
        returnModes: kind === "function" ? ["scalar", "table"] : [],
        languages: ["TSQL", "SQL"],
        advancedFields: kind === "function" ? ["deterministic"] : ["transactionControl"],
        dataTypes: ["NVARCHAR(MAX)", "INT", "BIGINT", "DECIMAL(18,2)", "BIT", "DATETIME2", "UNIQUEIDENTIFIER"],
      }
    case "sqlite":
      return {
        supportsProcedures: false,
        supportsFunctions: false,
        supportsCreateOrReplace: false,
        parameterModes: [],
        returnModes: [],
        languages: ["SQL"],
        advancedFields: [],
        dataTypes: DEFAULT_DATA_TYPES,
      }
    default:
      return {
        supportsProcedures: true,
        supportsFunctions: true,
        supportsCreateOrReplace: true,
        parameterModes: kind === "procedure" ? ["IN", "OUT", "INOUT"] : ["IN"],
        returnModes: kind === "function" ? ["scalar"] : [],
        languages: ["SQL"],
        advancedFields: ["deterministic"],
        dataTypes: DEFAULT_DATA_TYPES,
      }
  }
}

function getReturnTypes(capabilities: RoutineCapabilities) {
  const types: string[] = []

  if (capabilities.returnModes.includes("scalar")) {
    types.push(...capabilities.dataTypes)
  }

  if (capabilities.returnModes.includes("table")) {
    types.push("TABLE")
  }

  if (capabilities.returnModes.includes("set")) {
    types.push("SETOF RECORD")
  }

  return types.length ? types : DEFAULT_DATA_TYPES
}

function getDefaultReturnType(capabilities: RoutineCapabilities, kind: RoutineKind) {
  if (kind === "procedure") {
    return "SEM RETORNO"
  }

  return getReturnTypes(capabilities)[0] ?? "TEXT"
}

function buildRoutineTemplate(
  kind: RoutineKind,
  databaseType: DatabaseType | undefined,
  schemaName: string,
  routineName: string,
  parameters: RoutineParameterDraft[] = []
) {
  const qualifiedName = schemaName ? `${schemaName}.${routineName}` : routineName
  const parameterList = formatRoutineParameters(databaseType, kind, parameters)

  if (databaseType === "sqlite") {
    return "-- SQLite não oferece procedures ou funções armazenadas.\n-- Crie uma view, trigger ou salve este conteúdo como script reutilizável."
  }

  if (databaseType === "postgresql") {
    return kind === "procedure"
      ? `CREATE OR REPLACE PROCEDURE ${qualifiedName}(${parameterList})\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  -- escreva a procedure aqui\nEND;\n$$;`
      : `CREATE OR REPLACE FUNCTION ${qualifiedName}(${parameterList})\nRETURNS text\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  RETURN '';\nEND;\n$$;`
  }

  if (databaseType === "sqlserver") {
    const sqlServerProcedureParameters = parameterList ? `\n  ${parameterList}` : ""
    return kind === "procedure"
      ? `CREATE OR ALTER PROCEDURE ${qualifiedName}${sqlServerProcedureParameters}\nAS\nBEGIN\n  SET NOCOUNT ON;\nEND;`
      : `CREATE OR ALTER FUNCTION ${qualifiedName}(${parameterList})\nRETURNS NVARCHAR(MAX)\nAS\nBEGIN\n  RETURN N'';\nEND;`
  }

  return kind === "procedure"
    ? `CREATE PROCEDURE ${qualifiedName}(${parameterList})\nBEGIN\n  -- escreva a procedure aqui\nEND;`
    : `CREATE FUNCTION ${qualifiedName}(${parameterList})\nRETURNS TEXT\nBEGIN\n  RETURN '';\nEND;`
}

function replaceRoutineSignatureName(sqlText: string, schemaName: string, routineName: string) {
  const qualifiedName = schemaName ? `${schemaName}.${routineName}` : routineName
  const signaturePattern =
    /\b(CREATE\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?(?:PROCEDURE|FUNCTION)\s+)([`"\[\]\w.]+)/i

  if (!signaturePattern.test(sqlText)) {
    return ""
  }

  return sqlText.replace(signaturePattern, (_match, prefix: string) => `${prefix}${qualifiedName}`)
}

function replaceRoutineSignatureParameters(
  sqlText: string,
  databaseType: DatabaseType,
  kind: RoutineKind,
  schemaName: string,
  routineName: string,
  parameters: RoutineParameterDraft[]
) {
  const signature = buildRoutineSignature(kind, databaseType, schemaName, routineName, parameters)

  if (databaseType === "sqlserver" && kind === "procedure") {
    const sqlServerProcedurePattern =
      /\b(CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+[`"\[\]\w.]+)([\s\S]*?)(\nAS\b)/i

    if (!sqlServerProcedurePattern.test(sqlText)) {
      return ""
    }

    return sqlText.replace(sqlServerProcedurePattern, (_match, _prefix: string, _params: string, suffix: string) => `${signature}${suffix}`)
  }

  const declarationPattern =
    /\bCREATE\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?(?:PROCEDURE|FUNCTION)\s+[`"\[\]\w.]+\s*/i
  const declarationMatch = declarationPattern.exec(sqlText)

  if (!declarationMatch || declarationMatch.index === undefined) {
    return ""
  }

  const declarationStart = declarationMatch.index
  const declarationEnd = declarationStart + declarationMatch[0].length
  const parametersStart = sqlText.indexOf("(", declarationEnd)

  if (parametersStart === -1) {
    return ""
  }

  const parametersEnd = findMatchingClosingParenthesis(sqlText, parametersStart)

  if (parametersEnd === -1) {
    return ""
  }

  return `${sqlText.slice(0, declarationStart)}${signature}${sqlText.slice(parametersEnd + 1)}`
}

function buildRoutineSignature(
  kind: RoutineKind,
  databaseType: DatabaseType | undefined,
  schemaName: string,
  routineName: string,
  parameters: RoutineParameterDraft[]
) {
  const qualifiedName = schemaName ? `${schemaName}.${routineName}` : routineName
  const parameterList = formatRoutineParameters(databaseType, kind, parameters)

  if (databaseType === "postgresql") {
    return kind === "procedure"
      ? `CREATE OR REPLACE PROCEDURE ${qualifiedName}(${parameterList})`
      : `CREATE OR REPLACE FUNCTION ${qualifiedName}(${parameterList})`
  }

  if (databaseType === "sqlserver") {
    if (kind === "procedure") {
      return parameterList
        ? `CREATE OR ALTER PROCEDURE ${qualifiedName}\n  ${parameterList}`
        : `CREATE OR ALTER PROCEDURE ${qualifiedName}`
    }

    return `CREATE OR ALTER FUNCTION ${qualifiedName}(${parameterList})`
  }

  return kind === "procedure"
    ? `CREATE PROCEDURE ${qualifiedName}(${parameterList})`
    : `CREATE FUNCTION ${qualifiedName}(${parameterList})`
}

function formatRoutineParameters(
  databaseType: DatabaseType | undefined,
  kind: RoutineKind,
  parameters: RoutineParameterDraft[]
) {
  return parameters
    .map((parameter) => formatRoutineParameter(databaseType, kind, parameter))
    .filter(Boolean)
    .join(databaseType === "sqlserver" && kind === "procedure" ? ",\n  " : ", ")
}

function formatRoutineParameter(
  databaseType: DatabaseType | undefined,
  kind: RoutineKind,
  parameter: RoutineParameterDraft
) {
  const name = parameter.name.trim()
  const dataType = parameter.dataType.trim()

  if (!name || !dataType) {
    return ""
  }

  const defaultValue = parameter.defaultValue.trim()

  if (databaseType === "sqlserver") {
    const parameterName = name.startsWith("@") ? name : `@${name}`
    const outputSuffix = kind === "procedure" && parameter.mode !== "IN" ? " OUTPUT" : ""
    const defaultSuffix = defaultValue ? ` = ${defaultValue}` : ""
    return `${parameterName} ${dataType}${defaultSuffix}${outputSuffix}`
  }

  const modePrefix = kind === "function" && (databaseType === "mysql" || databaseType === "mariadb")
    ? ""
    : `${parameter.mode} `
  const defaultSuffix = defaultValue ? ` DEFAULT ${defaultValue}` : ""

  return `${modePrefix}${name} ${dataType}${defaultSuffix}`
}

function findMatchingClosingParenthesis(text: string, openingIndex: number) {
  let depth = 0

  for (let index = openingIndex; index < text.length; index += 1) {
    const character = text[index]

    if (character === "(") {
      depth += 1
    }

    if (character === ")") {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function normalizeParametersForCapabilities(
  parameters: RoutineParameterDraft[],
  capabilities: RoutineCapabilities
) {
  const fallbackMode = capabilities.parameterModes[0] ?? "IN"
  const fallbackDataType = capabilities.dataTypes[0] ?? DEFAULT_DATA_TYPES[0]

  return parameters.map((parameter) => ({
    ...parameter,
    mode: capabilities.parameterModes.includes(parameter.mode) ? parameter.mode : fallbackMode,
    dataType: capabilities.dataTypes.includes(parameter.dataType) ? parameter.dataType : fallbackDataType,
  }))
}

function parseParameterMode(value: string, capabilities: RoutineCapabilities): RoutineParameterDraft["mode"] {
  if (value === "IN" || value === "OUT" || value === "INOUT") {
    return capabilities.parameterModes.includes(value) ? value : capabilities.parameterModes[0] ?? "IN"
  }

  return capabilities.parameterModes[0] ?? "IN"
}

function createParameterId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
