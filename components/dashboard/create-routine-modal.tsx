"use client"

import dynamic from "next/dynamic"
import { useMemo, useState } from "react"
import { Braces, Code2, Database, FileCode2, Loader2, Plus, Search, Settings2, Sparkles } from "lucide-react"

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
import type { CreateRoutineModalProps, RoutineKind } from "@/types/dashboard-modals"

const RETURN_TYPES = ["SEM RETORNO (Procedure)", "TEXT", "INTEGER", "BOOLEAN", "NUMERIC", "JSON", "TABLE"]
const LANGUAGES = ["SQL", "PLPGSQL", "TSQL", "MYSQL"]

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
  database,
  databaseName,
  schemaName,
  initialKind,
  onOpenChange,
  onSaved,
}: CreateRoutineModalProps) {
  const initialSchemaName = schemaName || database?.schemas[0]?.name || "public"
  const [kind, setKind] = useState<RoutineKind>(initialKind)
  const [routineName, setRoutineName] = useState("")
  const [activeSchemaName, setActiveSchemaName] = useState(initialSchemaName)
  const [description, setDescription] = useState("")
  const [returnType, setReturnType] = useState(initialKind === "procedure" ? RETURN_TYPES[0] : "TEXT")
  const [language, setLanguage] = useState(getDefaultLanguage(connection?.databaseType))
  const [deterministic, setDeterministic] = useState(false)
  const [securityDefiner, setSecurityDefiner] = useState(false)
  const [sqlText, setSqlText] = useState(
    buildRoutineTemplate(initialKind, connection?.databaseType, initialSchemaName, "nova_rotina")
  )
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const schemaOptions = useMemo(() => {
    const names = database?.schemas.map((schema) => schema.name).filter(Boolean) ?? []
    const fallback = schemaName || names[0] || "public"
    return Array.from(new Set([fallback, ...names]))
  }, [database, schemaName])

  if (!connection || !database) {
    return null
  }

  const resolvedDatabaseName = databaseName || database.name || connection.databaseName
  const title = kind === "procedure" ? "Nova Procedure" : "Nova Função"
  const canSave = Boolean(routineName.trim()) && Boolean(sqlText.trim())

  function updateTemplate(nextKind = kind, nextSchemaName = activeSchemaName, nextRoutineName = routineName) {
    setSqlText((current) => {
      const nextName = nextRoutineName || "nova_rotina"

      if (current.trim()) {
        return replaceRoutineSignatureName(current, nextSchemaName, nextName) || buildRoutineTemplate(
          nextKind,
          connection?.databaseType,
          nextSchemaName,
          nextName
        )
      }

      return buildRoutineTemplate(
        nextKind,
        connection?.databaseType,
        nextSchemaName,
        nextName
      )
    })
  }

  function handleKindChange(nextKind: RoutineKind) {
    setKind(nextKind)
    setReturnType(nextKind === "procedure" ? RETURN_TYPES[0] : "TEXT")
    updateTemplate(nextKind)
  }

  function handleRoutineNameChange(nextRoutineName: string) {
    setRoutineName(nextRoutineName)
    updateTemplate(kind, activeSchemaName, nextRoutineName)
  }

  function handleSchemaChange(nextSchemaName: string) {
    setActiveSchemaName(nextSchemaName)
    updateTemplate(kind, nextSchemaName)
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
      const response = await fetch(`/api/connections/${connection.id}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: sqlText,
          databaseName: resolvedDatabaseName,
        }),
      })

      const payload: { success: boolean; message?: string; details?: string } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.details || payload.message || "Não foi possível salvar.")
        return
      }

      await onSaved({
        message: payload.message || "Rotina criada",
        details: payload.details || "A rotina foi criada com sucesso.",
        routineName: normalizedRoutineName,
        kind,
      })

      if (createAnother) {
        setRoutineName("")
        setDescription("")
        setErrorMessage(null)
        setSqlText(buildRoutineTemplate(kind, connection.databaseType, activeSchemaName, "nova_rotina"))
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
                  <DialogTitle className="text-xl text-white">Nova Procedure / Função</DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-white/55">
                    Crie uma nova procedure ou função no banco de dados.
                  </DialogDescription>
                </span>
              </div>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <Tabs defaultValue={initialKind} value={kind} onValueChange={(value) => handleKindChange(value as RoutineKind)}>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-white/10 bg-white/4 p-0 text-white/55">
                <TabsTrigger
                  value="procedure"
                  className="h-11 gap-2 rounded-xl border-b-0 data-[state=active]:border data-[state=active]:border-sky-400/25 data-[state=active]:bg-sky-400/10 data-[state=active]:text-sky-200"
                >
                  <Settings2 className="size-4" />
                  Procedure
                </TabsTrigger>
                <TabsTrigger
                  value="function"
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
                  sqlText={sqlText}
                  schemaOptions={schemaOptions}
                  onRoutineNameChange={handleRoutineNameChange}
                  onSchemaChange={handleSchemaChange}
                  onDescriptionChange={setDescription}
                  onReturnTypeChange={setReturnType}
                  onLanguageChange={setLanguage}
                  onDeterministicChange={setDeterministic}
                  onSecurityDefinerChange={setSecurityDefiner}
                  onSqlTextChange={setSqlText}
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
                  sqlText={sqlText}
                  schemaOptions={schemaOptions}
                  onRoutineNameChange={handleRoutineNameChange}
                  onSchemaChange={handleSchemaChange}
                  onDescriptionChange={setDescription}
                  onReturnTypeChange={setReturnType}
                  onLanguageChange={setLanguage}
                  onDeterministicChange={setDeterministic}
                  onSecurityDefinerChange={setSecurityDefiner}
                  onSqlTextChange={setSqlText}
                />
              </TabsContent>
            </Tabs>

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
              <Button
                type="button"
                size="lg"
                onClick={() => void handleSave(false)}
                disabled={saving || !canSave}
                className="bg-linear-to-r from-sky-500 to-blue-600 text-white shadow-[0_18px_45px_-18px_rgba(14,165,233,0.8)] hover:from-sky-400 hover:to-blue-500"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Salvar
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
  sqlText,
  schemaOptions,
  onRoutineNameChange,
  onSchemaChange,
  onDescriptionChange,
  onReturnTypeChange,
  onLanguageChange,
  onDeterministicChange,
  onSecurityDefinerChange,
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
  sqlText: string
  schemaOptions: string[]
  onRoutineNameChange: (value: string) => void
  onSchemaChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onReturnTypeChange: (value: string) => void
  onLanguageChange: (value: string) => void
  onDeterministicChange: (value: boolean) => void
  onSecurityDefinerChange: (value: boolean) => void
  onSqlTextChange: (value: string) => void
}) {
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

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Code2 className="size-4 text-sky-300" />
            Parâmetros
          </div>
          <div className="rounded-xl border border-white/10 bg-[#050913]">
            <div className="grid grid-cols-4 border-b border-white/10 bg-white/4 px-3 py-2 text-xs font-medium text-white/45">
              <span>Nome</span>
              <span>Tipo</span>
              <span>Direção</span>
              <span>Padrão</span>
            </div>
            <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-sm text-white/45">
              <Sparkles className="size-7 text-white/35" />
              Nenhum parâmetro adicionado
              <Button type="button" variant="outline" className="border-sky-400/20 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15">
                <Plus className="size-4" />
                Adicionar parâmetro
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Settings2 className="size-4 text-sky-300" />
            Opções
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Tipo de retorno</Label>
              <Select value={returnType} onValueChange={onReturnTypeChange}>
                <SelectTrigger className="border-white/10 bg-[#050913] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Linguagem</Label>
              <Select value={language} onValueChange={onLanguageChange}>
                <SelectTrigger className="border-white/10 bg-[#050913] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-3 text-sm text-white/60">
              <Checkbox checked={deterministic} onChange={(event) => onDeterministicChange(event.currentTarget.checked)} />
              Determinística
            </label>
            <label className="flex items-center gap-3 text-sm text-white/60">
              <Checkbox checked={securityDefiner} onChange={(event) => onSecurityDefinerChange(event.currentTarget.checked)} />
              Segurança definidor
            </label>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/4">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileCode2 className="size-4 text-sky-300" />
            Definição
          </div>
          <div className="flex items-center gap-3 text-xs text-white/45">
            <span className="inline-flex items-center gap-1">
              <Search className="size-3.5" />
              Verificar sintaxe
            </span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1">{language}</span>
          </div>
        </div>
        <div className="h-[clamp(14rem,32dvh,22rem)] overflow-hidden rounded-b-2xl bg-[#050913]">
          <MonacoEditor
            value={sqlText}
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
    </div>
  )
}

function getDefaultLanguage(databaseType?: string) {
  if (databaseType === "postgresql") {
    return "PLPGSQL"
  }

  if (databaseType === "sqlserver") {
    return "TSQL"
  }

  return "SQL"
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

function buildRoutineTemplate(kind: RoutineKind, databaseType: string | undefined, schemaName: string, routineName: string) {
  const qualifiedName = schemaName ? `${schemaName}.${routineName}` : routineName

  if (databaseType === "postgresql") {
    return kind === "procedure"
      ? `CREATE OR REPLACE PROCEDURE ${qualifiedName}()\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  -- escreva a procedure aqui\nEND;\n$$;`
      : `CREATE OR REPLACE FUNCTION ${qualifiedName}()\nRETURNS text\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  RETURN '';\nEND;\n$$;`
  }

  if (databaseType === "sqlserver") {
    return kind === "procedure"
      ? `CREATE OR ALTER PROCEDURE ${qualifiedName}\nAS\nBEGIN\n  SET NOCOUNT ON;\nEND;`
      : `CREATE OR ALTER FUNCTION ${qualifiedName}()\nRETURNS NVARCHAR(MAX)\nAS\nBEGIN\n  RETURN N'';\nEND;`
  }

  return kind === "procedure"
    ? `CREATE PROCEDURE ${qualifiedName}()\nBEGIN\n  -- escreva a procedure aqui\nEND;`
    : `CREATE FUNCTION ${qualifiedName}()\nRETURNS TEXT\nBEGIN\n  RETURN '';\nEND;`
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
