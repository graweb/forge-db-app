"use client"

import dynamic from "next/dynamic"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Plus, Filter, Play, Settings2, Sparkles, X } from "lucide-react"
import type * as Monaco from "monaco-editor"

import { Button } from "@/components/ui/button"
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
  DatabaseStructure,
  DatabaseStructureDatabase,
  QueryExecutionResult,
  SavedConnection,
} from "@/types/connections"
import type {
  AutocompleteContext,
  AutocompleteObject,
  DashboardEditorWorkspaceHandle,
  DashboardEditorWorkspaceProps,
  ExecuteSqlOptions,
  ParsedAutocompleteSource,
  QueryExecutionTab,
  SqlAutocompleteSuggestion,
  SqlStatementBlock,
  StatementExecutionPlan,
} from "@/types/dashboard-editor"

import { QueryResults } from "./query-results"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-80 items-center justify-center rounded-xl border border-white/10 bg-[#050913] text-sm text-white/45">
      Carregando editor SQL...
    </div>
  ),
})

let monacoEnhancementsRegistered = false

const AUTOCOMPLETE_KIND = {
  table: 5,
  view: 7,
  procedure: 0,
  function: 1,
  column: 3,
} as const

type EditorTab = {
  id: string
  title: string
  sql: string
}

function createEditorTabId() {
  return `editor-tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getDefaultQuery(databaseType: SavedConnection["databaseType"]) {
  if (databaseType === "sqlite") {
    return `SELECT 1 AS id, 'example' AS name, CURRENT_TIMESTAMP AS created_at;`
  }

  return `SELECT 1 AS id, 'example' AS name, CURRENT_TIMESTAMP AS created_at;`
}

function getAvailableDatabaseNames(
  connection: SavedConnection,
  databaseStructure: DatabaseStructure
) {
  const databaseNames = databaseStructure.databases.map((database) => database.name).filter(Boolean)

  if (databaseNames.length > 0) {
    return databaseNames
  }

  return [getDefaultDatabaseName(connection, databaseStructure)]
}

function getDefaultDatabaseName(connection: SavedConnection, databaseStructure: DatabaseStructure) {
  if (databaseStructure.databases[0]?.name) {
    return databaseStructure.databases[0].name
  }

  if (connection.databaseType === "sqlite") {
    return "main"
  }

  return connection.databaseName.trim() || "master"
}

function getAutocompleteGroupDetail(label: string) {
  switch (label) {
    case "Tabelas":
      return "Tabela"
    case "Views":
      return "View"
    case "Procedures":
      return "Procedure"
    case "Funções":
      return "Função"
    case "Colunas":
      return "Coluna"
    default:
      return label
  }
}

function getAutocompleteKindForGroup(label: string) {
  switch (label) {
    case "Tabelas":
      return AUTOCOMPLETE_KIND.table
    case "Views":
      return AUTOCOMPLETE_KIND.view
    case "Procedures":
      return AUTOCOMPLETE_KIND.procedure
    case "Funções":
      return AUTOCOMPLETE_KIND.function
    default:
      return null
  }
}

function getAutocompleteObjectReference(
  connection: SavedConnection,
  schemaName: string,
  objectName: string
) {
  const normalizedSchema = schemaName.trim()
  const normalizedObject = objectName.trim()

  if (!normalizedSchema || !normalizedObject) {
    return normalizedObject || normalizedSchema
  }

  if (connection.databaseType === "sqlite" && normalizedSchema === "main") {
    return normalizedObject
  }

  if (connection.databaseType === "postgresql" && normalizedSchema === "public") {
    return normalizedObject
  }

  if (
    (connection.databaseType === "mysql" || connection.databaseType === "mariadb") &&
    normalizedSchema === connection.databaseName.trim()
  ) {
    return normalizedObject
  }

  return `${normalizedSchema}.${normalizedObject}`
}

function dedupeAutocompleteSuggestions(suggestions: SqlAutocompleteSuggestion[]) {
  const seen = new Set<string>()
  const result: SqlAutocompleteSuggestion[] = []

  for (const item of suggestions) {
    const key = `${item.kind}:${item.insertText}:${item.detail}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(item)
  }

  return result
}

function getSelectedDatabase(
  connection: SavedConnection,
  databaseStructure: DatabaseStructure,
  selectedDatabaseName: string
) {
  const availableDatabases = databaseStructure.databases.length
    ? databaseStructure.databases
    : [{ name: getDefaultDatabaseName(connection, databaseStructure), schemas: [], groups: [] }]

  return (
    availableDatabases.find((database) => database.name === selectedDatabaseName) ??
    availableDatabases[0]
  )
}

function getAutocompleteSuggestions(
  connection: SavedConnection,
  database: DatabaseStructureDatabase | undefined,
  model: Monaco.editor.ITextModel | null,
  position: Monaco.Position | null
) {
  if (!database || !model || !position) {
    return []
  }

  const context = getAutocompleteContext(model, position)
  const objects = getAutocompleteObjects(connection, database)
  const currentStatement = getCurrentSqlStatementAtCursor(model, position)
  const statementText = currentStatement?.text ?? model.getValue()
  const sources = getAutocompleteSources(statementText, objects)

  if (context.mode === "columns") {
    const targetSources = context.sourceReference
      ? sources.filter(
          (source) =>
            normalizeQualifiedIdentifier(source.reference).toLowerCase() ===
              normalizeQualifiedIdentifier(context.sourceReference ?? "").toLowerCase() ||
            source.alias?.toLowerCase() ===
              getIdentifierLeaf(context.sourceReference ?? "").toLowerCase()
        )
      : sources

    return buildColumnSuggestions(targetSources)
  }

  const suggestions: SqlAutocompleteSuggestion[] = []

  for (const object of objects) {
    suggestions.push({
      label: object.reference,
      insertText: object.reference,
      detail: object.detail,
      kind: object.kind,
    })
  }

  return dedupeAutocompleteSuggestions(suggestions)
}

function getAutocompleteContext(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position
): AutocompleteContext {
  const currentStatement = getCurrentSqlStatementAtCursor(model, position)

  if (!currentStatement) {
    return { mode: "objects", sourceReference: null }
  }

  const statementText = currentStatement.text
  const statementUntilCursor = model.getValueInRange({
    startLineNumber: currentStatement.startLine,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  })
  const isSelectStatement = /^\s*select\b/i.test(statementText)

  if (!isSelectStatement) {
    return { mode: "objects", sourceReference: null }
  }

  const qualifiedSourceReference = extractQualifiedSourceReferenceBeforeCursor(statementUntilCursor)
  if (qualifiedSourceReference) {
    return { mode: "columns", sourceReference: qualifiedSourceReference }
  }

  const lastObjectClauseIndex = getLastKeywordIndex(statementUntilCursor, ["from", "join"])
  const lastColumnClauseIndex = getLastKeywordIndex(statementUntilCursor, [
    "select",
    "on",
    "where",
    "group",
    "order",
    "having",
    "limit",
    "union",
    "intersect",
    "except",
  ])

  if (lastObjectClauseIndex > lastColumnClauseIndex) {
    return { mode: "objects", sourceReference: null }
  }

  return { mode: "columns", sourceReference: null }
}

function getAutocompleteObjects(
  connection: SavedConnection,
  database: DatabaseStructureDatabase
): AutocompleteObject[] {
  const objects: AutocompleteObject[] = []

  const schemaSources = database.schemas.length
    ? database.schemas
    : connection.databaseType === "mysql" || connection.databaseType === "mariadb"
      ? [{ name: database.name, groups: database.groups }]
      : [{ name: database.name, groups: database.groups }]

  for (const schema of schemaSources) {
    for (const group of schema.groups) {
      const groupKind = getAutocompleteKindForGroup(group.label)
      if (groupKind === null) {
        continue
      }

      const groupDetail = getAutocompleteGroupDetail(group.label)
      const isColumnSource = group.label === "Tabelas" || group.label === "Views"

      for (const item of group.items) {
        const reference = getAutocompleteObjectReference(connection, schema.name, item)
        const columns = isColumnSource ? group.columnsByItem?.[item] ?? [] : []

        objects.push({
          reference,
          leafName: item,
          alias: null,
          detail: groupDetail,
          kind: groupKind,
          columns,
        })
      }
    }
  }

  return objects
}

function findAutocompleteObjectByReference(
  objects: AutocompleteObject[],
  sourceReference: string
) {
  const normalizedReference = normalizeQualifiedIdentifier(sourceReference).toLowerCase()
  const normalizedLeaf = getIdentifierLeaf(sourceReference).toLowerCase()

  const exactMatch = objects.find(
    (object) => normalizeQualifiedIdentifier(object.reference).toLowerCase() === normalizedReference
  )

  if (exactMatch) {
    return exactMatch
  }

  const leafMatches = objects.filter(
    (object) => object.leafName.toLowerCase() === normalizedLeaf
  )

  if (leafMatches.length === 1) {
    return leafMatches[0]
  }

  return null
}

function getAutocompleteSources(
  statementText: string,
  objects: AutocompleteObject[]
) {
  const parsedSources = parseAutocompleteSources(statementText)
  const sources: AutocompleteObject[] = []

  for (const parsedSource of parsedSources) {
    const object = findAutocompleteObjectByReference(objects, parsedSource.reference)
    if (!object) {
      continue
    }

    sources.push({
      ...object,
      alias: parsedSource.alias ?? null,
      reference: object.reference,
    })
  }

  return dedupeAutocompleteSources(sources)
}

function buildColumnSuggestions(sources: AutocompleteObject[]) {
  if (!sources.length) {
    return []
  }

  const multipleSources = sources.length > 1
  const suggestions: SqlAutocompleteSuggestion[] = []

  for (const source of sources) {
    const sourcePrefix = source.alias || source.reference

    for (const columnName of source.columns) {
      const qualifiedName = multipleSources || Boolean(source.alias)
        ? `${sourcePrefix}.${columnName}`
        : columnName

      suggestions.push({
        label: qualifiedName,
        insertText: qualifiedName,
        detail: `Coluna · ${source.alias || source.reference}`,
        kind: AUTOCOMPLETE_KIND.column,
      })
    }
  }

  return dedupeAutocompleteSuggestions(suggestions)
}

function getCurrentSqlStatementAtCursor(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position
) {
  const statements = getSqlStatements(model.getValue())
  return pickSqlStatementBlock(statements, position.lineNumber)
}

function findKeywordIndex(text: string, keyword: string) {
  const pattern = new RegExp(`\\b${keyword}\\b`, "i")
  const match = pattern.exec(text)
  return match?.index ?? -1
}

function getLastKeywordIndex(text: string, keywords: string[]) {
  let lastIndex = -1

  for (const keyword of keywords) {
    const index = findKeywordIndex(text, keyword)
    if (index > lastIndex) {
      lastIndex = index
    }
  }

  return lastIndex
}

function extractQualifiedSourceReferenceBeforeCursor(statementUntilCursor: string) {
  const compactText = statementUntilCursor.replace(/\s+/g, " ")
  const match = compactText.match(/([`"\[\]\w.]+)\.\s*$/)

  if (!match?.[1]) {
    return ""
  }

  return normalizeQualifiedIdentifier(match[1])
}

function normalizeQualifiedIdentifier(identifier: string) {
  return identifier
    .split(".")
    .map((part) => part.trim().replace(/^[`"\[]+|[`"\]]+$/g, ""))
    .filter(Boolean)
    .join(".")
}

function getIdentifierLeaf(identifier: string) {
  const parts = normalizeQualifiedIdentifier(identifier).split(".").filter(Boolean)
  return parts.at(-1) ?? ""
}

function parseAutocompleteSources(statementText: string) {
  const compactSql = statementText.replace(/\s+/g, " ")
  const sourcePattern =
    /\b(?:from|join)\s+((?:[`"\[\]\w]+(?:\.[`"\[\]\w]+)*)|\([^)]+\))(?:\s+(?:as\s+)?([`"\[\]\w]+))?/gi
  const sources: ParsedAutocompleteSource[] = []
  let match: RegExpExecArray | null

  while ((match = sourcePattern.exec(compactSql))) {
    const reference = match[1]?.trim() ?? ""
    if (!reference || reference.startsWith("(")) {
      continue
    }

    const normalizedReference = normalizeQualifiedIdentifier(reference)
    const aliasCandidate = match[2] ? normalizeQualifiedIdentifier(match[2]) : null
    const alias =
      aliasCandidate && !isSqlClauseKeyword(aliasCandidate) ? aliasCandidate : null

    sources.push({
      reference: normalizedReference,
      alias,
    })
  }

  return sources
}

function dedupeAutocompleteSources(sources: AutocompleteObject[]) {
  const seen = new Set<string>()
  const result: AutocompleteObject[] = []

  for (const source of sources) {
    const key = `${normalizeQualifiedIdentifier(source.reference).toLowerCase()}:${(
      source.alias ?? ""
    ).toLowerCase()}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(source)
  }

  return result
}

function isSqlClauseKeyword(value: string) {
  switch (value.toLowerCase()) {
    case "select":
    case "from":
    case "join":
    case "on":
    case "where":
    case "group":
    case "order":
    case "having":
    case "limit":
    case "union":
    case "intersect":
    case "except":
    case "as":
      return true
    default:
      return false
  }
}

export const DashboardEditorWorkspace = forwardRef<
  DashboardEditorWorkspaceHandle,
  DashboardEditorWorkspaceProps
>(function DashboardEditorWorkspace({ connection, databaseStructure }, ref) {
  const [activeEditorTabId, setActiveEditorTabId] = useState(() => createEditorTabId())
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>(() => [
    {
      id: activeEditorTabId,
      title: "Query 1.sql",
      sql: getDefaultQuery(connection.databaseType),
    },
  ])
  const [queryTabs, setQueryTabs] = useState<QueryExecutionTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [executionSummary, setExecutionSummary] = useState(
    "Execute uma consulta para abrir uma aba de resultado."
  )
  const [summaryTone, setSummaryTone] = useState<"neutral" | "success" | "error">("neutral")
  const [executing, setExecuting] = useState(false)
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null)
  const [selectedDatabaseName, setSelectedDatabaseName] = useState<string>(
    () => getDefaultDatabaseName(connection, databaseStructure)
  )
  const availableDatabaseNames = getAvailableDatabaseNames(connection, databaseStructure)
  const effectiveSelectedDatabaseName = availableDatabaseNames.includes(selectedDatabaseName)
    ? selectedDatabaseName
    : availableDatabaseNames[0] ?? getDefaultDatabaseName(connection, databaseStructure)
  const selectedDatabase = getSelectedDatabase(
    connection,
    databaseStructure,
    effectiveSelectedDatabaseName
  )
  const activeEditorTab =
    editorTabs.find((tab) => tab.id === activeEditorTabId) ?? editorTabs[0] ?? null
  const activeEditorSql = activeEditorTab?.sql ?? getDefaultQuery(connection.databaseType)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const highlightDecorationIdsRef = useRef<string[]>([])
  const executeSqlTextRef = useRef<
    (sql: string, options?: ExecuteSqlOptions) => Promise<void>
  >(async () => {})
  const autocompleteContextRef = useRef({
    connection,
    database: selectedDatabase,
  })

  const syncEditorSql = useCallback((nextSql: string) => {
    setEditorTabs((current) => {
      if (!current.length) {
        return current
      }

      return current.map((tab) =>
        tab.id === activeEditorTabId ? { ...tab, sql: nextSql } : tab
      )
    })
  }, [activeEditorTabId])

  const openSqlInNewEditorTab = useCallback((nextSql: string, title?: string) => {
    const statement = nextSql.trim()
    if (!statement) {
      return
    }

    const tabId = createEditorTabId()

    setEditorTabs((current) => {
      const nextTitle = title || `Query ${current.length + 1}.sql`
      return [...current, { id: tabId, title: nextTitle, sql: statement }]
    })
    setActiveEditorTabId(tabId)
  }, [])

  useEffect(() => {
    autocompleteContextRef.current = {
      connection,
      database: selectedDatabase,
    }
  }, [connection, selectedDatabase])

  useEffect(() => {
    executeSqlTextRef.current = async (sql: string, options?: ExecuteSqlOptions) => {
      const statement = sql.trim()

      if (!statement) {
        setSummaryTone("error")
        setExecutionSummary("Digite uma consulta SQL antes de executar.")
        return
      }

      if (options?.insertIntoEditor) {
        syncEditorSql(statement)
      }

      setExecuting(true)
      setLastDurationMs(null)
      setSummaryTone("neutral")
      setExecutionSummary("Executando consulta...")

      const startedAt = performance.now()

      try {
        const statementStartedAt = performance.now()
        const response = await fetch(`/api/connections/${connection.id}/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sql: statement,
            databaseName: options?.databaseName ?? effectiveSelectedDatabaseName,
          }),
        })

        const payload: {
          success: boolean
          message: string
          details?: string
          columns?: string[]
          rows?: Array<Record<string, string | number | boolean | null>>
          rowCount?: number
          affectedRows?: number
        } = await response.json()

        const durationMs = Math.round(performance.now() - statementStartedAt)
        const nextTab: QueryExecutionTab = !response.ok || !payload.success
          ? {
              id: createQueryTabId(),
              title: options?.title || getQueryTabTitle(statement, 0),
              sql: statement,
              status: "error",
              message: payload.details || payload.message || "Não foi possível executar a consulta.",
              durationMs,
              result: null,
            }
          : {
              id: createQueryTabId(),
              title: options?.title || getQueryTabTitle(statement, 0),
              sql: statement,
              status: "success",
              message: payload.message,
              durationMs,
              result: {
                columns: payload.columns ?? [],
                rows: payload.rows ?? [],
                rowCount: payload.rowCount ?? payload.rows?.length ?? 0,
                affectedRows: payload.affectedRows,
                message: payload.message,
              },
            }

        setQueryTabs((current) => {
          const merged = upsertExecutionTabs(current, [nextTab])
          setActiveTabId(merged.activeTabId)
          return merged.tabs
        })
        setLastDurationMs(Math.round(performance.now() - startedAt))
        setSummaryTone(nextTab.status === "error" ? "error" : "success")
        setExecutionSummary(
          nextTab.status === "error"
            ? "Consulta processada com erro."
            : "Consulta processada com sucesso."
        )
      } catch {
        const durationMs = Math.round(performance.now() - startedAt)
        setLastDurationMs(durationMs)
        setSummaryTone("error")
        setExecutionSummary("Falha inesperada ao executar a consulta.")
      } finally {
        setExecuting(false)
      }
    }
  }, [connection.id, effectiveSelectedDatabaseName, activeEditorTabId, syncEditorSql])

  useImperativeHandle(
    ref,
    () => ({
      insertText: (text: string) => {
        const editor = editorRef.current
        if (!editor) {
          return
        }

        insertTextIntoEditor(editor, text)
        syncEditorSql(editor.getValue())
        editor.focus()
      },
      openSqlInNewTab: (sql: string, options?: { title?: string; databaseName?: string }) => {
        openSqlInNewEditorTab(sql, options?.title)
      },
      executeSqlText: async (sql: string, options) => {
        await executeSqlTextRef.current(sql, options)
      },
      previewTable: async (tablePath: string) => {
        await executeSqlTextRef.current(`SELECT *\nFROM ${tablePath}\nLIMIT 100;`, {
          title: `Preview: ${getLeafName(tablePath)}`,
          insertIntoEditor: true,
          databaseName: effectiveSelectedDatabaseName,
        })
      },
      executeTable: async (tablePath: string) => {
        await executeSqlTextRef.current(`SELECT *\nFROM ${tablePath};`, {
          title: getLeafName(tablePath),
          insertIntoEditor: true,
          databaseName: effectiveSelectedDatabaseName,
        })
      },
      runTableQuery: async (tablePath: string) => {
        await executeSqlTextRef.current(`SELECT *\nFROM ${tablePath};`, {
          title: getLeafName(tablePath),
          insertIntoEditor: true,
          databaseName: effectiveSelectedDatabaseName,
        })
      },
    }),
    [effectiveSelectedDatabaseName, openSqlInNewEditorTab, syncEditorSql]
  )

  const activeTab = queryTabs.find((tab) => tab.id === activeTabId) ?? queryTabs[0] ?? null

  const handleCloseTab = (tabId: string) => {
    setQueryTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== tabId)

      if (tabId === activeTabId) {
        const removedIndex = current.findIndex((tab) => tab.id === tabId)
        const fallbackTab = nextTabs[Math.max(0, removedIndex - 1)] ?? nextTabs[removedIndex] ?? null

        setActiveTabId(fallbackTab?.id ?? null)
      }

      return nextTabs
    })
  }

  const handleExecute = async (mode: "full" | "cursor" = "cursor") => {
    const editor = editorRef.current
    const executionPlan = getExecutionPlan(mode, editor, activeEditorSql)
    const statements = executionPlan.map((item) => item.text)

    if (!statements.length) {
      setSummaryTone("error")
      setExecutionSummary("Digite uma consulta SQL antes de executar.")
      return
    }

    setExecuting(true)
    setLastDurationMs(null)
    setSummaryTone("neutral")
    setExecutionSummary("Executando consulta(s)...")

    const startedAt = performance.now()
    const nextTabs: QueryExecutionTab[] = []

    try {
      for (const [index, statement] of statements.entries()) {
        const statementStartedAt = performance.now()
        const response = await fetch(`/api/connections/${connection.id}/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sql: statement,
            databaseName: effectiveSelectedDatabaseName,
          }),
        })

        const payload: {
          success: boolean
          message: string
          details?: string
          columns?: string[]
          rows?: Array<Record<string, string | number | boolean | null>>
          rowCount?: number
          affectedRows?: number
        } = await response.json()

        const durationMs = Math.round(performance.now() - statementStartedAt)

        if (!response.ok || !payload.success) {
          nextTabs.push({
            id: createQueryTabId(),
            title: getQueryTabTitle(statement, index),
            sql: statement,
            status: "error",
            message: payload.details || payload.message || "Não foi possível executar a consulta.",
            durationMs,
            result: null,
          })
          continue
        }

        const result: QueryExecutionResult = {
          columns: payload.columns ?? [],
          rows: payload.rows ?? [],
          rowCount: payload.rowCount ?? payload.rows?.length ?? 0,
          affectedRows: payload.affectedRows,
          message: payload.message,
        }

        nextTabs.push({
          id: createQueryTabId(),
          title: getQueryTabTitle(statement, index),
          sql: statement,
          status: "success",
          message: payload.message,
          durationMs,
          result,
        })
      }

      if (nextTabs.length) {
        const hasError = nextTabs.some((tab) => tab.status === "error")
        const merged = upsertExecutionTabs(queryTabs, nextTabs)
        setQueryTabs(merged.tabs)
        setActiveTabId(merged.activeTabId)
        setLastDurationMs(Math.round(performance.now() - startedAt))
        setSummaryTone(hasError ? "error" : "success")
        setExecutionSummary(
          hasError
            ? nextTabs.length === 1
              ? "1 consulta processada em uma aba, com erro."
              : `${nextTabs.length} consultas processadas em abas, com pelo menos um erro.`
            : nextTabs.length === 1
              ? "1 consulta processada em uma aba."
              : `${nextTabs.length} consultas processadas em abas.`
        )
      }

      if (mode === "cursor" && executionPlan[0]) {
        highlightExecutedStatement(editor, executionPlan[0].block, highlightDecorationIdsRef)
      }
    } catch {
      const durationMs = Math.round(performance.now() - startedAt)
      if (nextTabs.length) {
        const hasError = nextTabs.some((tab) => tab.status === "error")
        const merged = upsertExecutionTabs(queryTabs, nextTabs)
        setQueryTabs(merged.tabs)
        setActiveTabId(merged.activeTabId)
        setLastDurationMs(durationMs)
        setSummaryTone(hasError ? "error" : "success")
        setExecutionSummary(
          hasError
            ? nextTabs.length === 1
              ? "1 consulta processada em uma aba, com erro e interrupção."
              : `${nextTabs.length} consultas processadas em abas, com erro e interrupção.`
            : nextTabs.length === 1
              ? "1 consulta processada antes de ocorrer uma falha."
              : `${nextTabs.length} consultas processadas antes de ocorrer uma falha.`
        )
      } else {
        setLastDurationMs(durationMs)
        setSummaryTone("error")
        setExecutionSummary("Falha inesperada ao executar a consulta.")
      }

      if (mode === "cursor" && executionPlan[0]) {
        highlightExecutedStatement(editor, executionPlan[0].block, highlightDecorationIdsRef)
      }
    } finally {
      setExecuting(false)
    }
  }

  const handleEditorMount = (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco
  ) => {
    editorRef.current = editor

    editor.onMouseMove(() => {
      clearExecutedStatementHighlight(editor, highlightDecorationIdsRef)
    })

    editor.onMouseDown(() => {
      clearExecutedStatementHighlight(editor, highlightDecorationIdsRef)
    })

    editor.onDidChangeCursorPosition(() => {
      clearExecutedStatementHighlight(editor, highlightDecorationIdsRef)
    })

    if (!monacoEnhancementsRegistered) {
      monacoEnhancementsRegistered = true

      monaco.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [" ", ".", ",", "(", "\n"],
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position)
          const { connection: currentConnection, database: currentDatabase } =
            autocompleteContextRef.current
          const autocompleteItems = getAutocompleteSuggestions(
            currentConnection,
            currentDatabase,
            model,
            position
          )
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          }

          return {
            suggestions: [
              ...autocompleteItems.map((item) => ({
                label: item.label,
                kind: item.kind,
                insertText: item.insertText,
                detail: item.detail,
                documentation: item.detail,
                range,
              })),
              {
                label: "SELECT * FROM table",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: "SELECT *\nFROM ${1:table};",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Seleciona todas as colunas de uma tabela.",
                range,
              },
              {
                label: "SELECT with WHERE",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: "SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition};",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Estrutura com filtro WHERE.",
                range,
              },
              {
                label: "INSERT INTO",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText:
                  "INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Insere registros em uma tabela.",
                range,
              },
              {
                label: "UPDATE",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText:
                  "UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Atualiza registros existentes.",
                range,
              },
              {
                label: "DELETE",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: "DELETE FROM ${1:table}\nWHERE ${2:condition};",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Remove registros com segurança.",
                range,
              },
              {
                label: "CREATE TABLE",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText:
                  "CREATE TABLE ${1:table} (\n  ${2:id} ${3:INTEGER} PRIMARY KEY,\n  ${4:name} ${5:TEXT}\n);",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Cria uma tabela com estrutura básica.",
                range,
              },
              {
                label: "INNER JOIN",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText:
                  "SELECT ${1:columns}\nFROM ${2:left_table} AS lt\nINNER JOIN ${3:right_table} AS rt ON ${4:condition};",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "Estrutura de JOIN para relacionar tabelas.",
                range,
              },
            ],
          }
        },
      })
    }

    editor.addAction({
      id: "execute-query",
      label: "Executar consulta atual",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1.5,
      run: () => {
        void handleExecute("cursor")
      },
    })

    editor.addAction({
      id: "execute-full-query",
      label: "Executar consulta completa",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1.6,
      run: () => {
        void handleExecute("full")
      },
    })
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-x border-white/10 bg-[linear-gradient(180deg,#0b1221_0%,#091019_100%)]">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 px-4 py-3">
        <div className="min-w-56">
          <Select
            value={effectiveSelectedDatabaseName}
            onValueChange={(value) => setSelectedDatabaseName(value)}
          >
            <SelectTrigger className="h-9 min-w-56 border-white/10 bg-white/4 text-white hover:bg-white/8">
              <SelectValue placeholder="Selecionar banco" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {availableDatabaseNames.map((databaseName) => (
                  <SelectItem key={databaseName} value={databaseName}>
                    {databaseName}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => void handleExecute("cursor")}
          disabled={executing}
          className="shrink-0 bg-sky-500 text-white hover:bg-sky-400"
        >
          <Play className="size-4" />
          {executing ? "Executando..." : "Executar"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleExecute("full")}
          disabled={executing}
          className="shrink-0 border-white/10 bg-white/4 text-white hover:bg-white/8"
        >
          <Filter className="size-4" />
          Executar tudo
        </Button>
        <div
          className={cn(
            "ml-auto hidden shrink-0 items-center gap-2 text-sm md:flex",
            summaryTone === "success"
              ? "text-emerald-300"
              : summaryTone === "error"
                ? "text-rose-300"
                : "text-white/45"
          )}
        >
          <Sparkles className="size-4" />
          <span>{executionSummary}</span>
          {lastDurationMs !== null ? <span>• {lastDurationMs} ms</span> : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-white/10 px-4 pt-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {editorTabs.map((tab) => (
              <Tab
                key={tab.id}
                active={tab.id === activeEditorTabId}
                onClick={() => setActiveEditorTabId(tab.id)}
                onClose={
                  editorTabs.length > 1
                    ? () => {
                        setEditorTabs((current) => {
                          const nextTabs = current.filter((item) => item.id !== tab.id)
                          if (activeEditorTabId === tab.id) {
                            const nextActive = nextTabs[nextTabs.length - 1] ?? nextTabs[0] ?? null
                            setActiveEditorTabId(nextActive?.id ?? "")
                          }
                          return nextTabs
                        })
                      }
                    : undefined
                }
              >
                <span className="truncate">{tab.title}</span>
              </Tab>
            ))}
            <button
              type="button"
              onClick={() => openSqlInNewEditorTab("SELECT 1;", `Query ${editorTabs.length + 1}.sql`)}
              className="inline-flex h-9 items-center justify-center rounded-t-xl border border-white/10 bg-white/4 px-3 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Nova tab"
            >
              <Plus className="size-4" />
            </button>
            <div className="ml-auto text-xs text-white/45">
              {activeEditorSql.length.toLocaleString("pt-BR")} caracteres
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-white/10 px-4 py-4">
            <div className="h-56 min-h-0 rounded-2xl border border-white/10 bg-[#07111d] p-3 shadow-[0_16px_50px_-34px_rgba(0,0,0,0.95)]">
              <div className="h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[#050913]">
                <MonacoEditor
                  value={activeEditorSql}
                  onChange={(value) => syncEditorSql(value ?? "")}
                  defaultLanguage="sql"
                  language="sql"
                  theme="vs-dark"
                  onMount={handleEditorMount}
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
                  className="h-full min-h-45"
                  loading={<div className="p-4 text-sm text-white/45">Carregando editor SQL...</div>}
                />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-3 overflow-x-auto border-b border-white/10 px-4">
              {queryTabs.length ? (
                queryTabs.map((tab, index) => (
                  <Tab
                    key={tab.id}
                    active={tab.id === activeTab?.id}
                    onClick={() => setActiveTabId(tab.id)}
                    onClose={() => handleCloseTab(tab.id)}
                  >
                    <span className="truncate">{tab.title}</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                      {index + 1}
                    </span>
                  </Tab>
                ))
              ) : (
                <div className="py-3 text-sm text-white/45">
                  As execuções vão abrir abas com o nome da tabela encontrada na query.
                </div>
              )}
              <div className="ml-auto flex items-center gap-2 text-xs text-white/45">
                <Settings2 className="size-4" />
                Exportar
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-4">
              {activeTab ? (
                <QueryTabPanel tab={activeTab} />
              ) : (
                <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#07111d] px-6 py-8 text-sm text-white/50">
                  Execute uma ou mais queries para abrir os resultados em abas separadas.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
})

function QueryTabPanel({ tab }: { tab: QueryExecutionTab }) {
  if (tab.status === "error") {
    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-[#07111d] p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium text-white">{tab.title}</div>
          <div className="text-xs text-white/45">{tab.durationMs} ms</div>
        </div>
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
          {tab.message}
        </div>
        <pre className="overflow-auto rounded-xl border border-white/10 bg-white/4 p-3 text-xs leading-5 text-white/60">
          {tab.sql}
        </pre>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <QueryResults key={tab.id} result={tab.result} />
    </div>
  )
}

function Tab({
  children,
  active = false,
  onClick,
  onClose,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  onClose?: () => void
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-2 rounded-t-lg border px-4 py-2 text-sm transition-colors",
          active
            ? "border-sky-400/20 bg-sky-400/10 text-white"
            : "border-transparent text-white/55 hover:text-white"
        )}
      >
        {children}
      </button>

      {onClose ? (
        <button
          type="button"
          aria-label="Fechar aba"
          onClick={onClose}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-t-lg border border-white/10 bg-white/4 text-white/45 transition-colors hover:bg-white/10 hover:text-white",
            active && "border-sky-400/20 bg-sky-400/10 text-white/70"
          )}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function highlightExecutedStatement(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  block: SqlStatementBlock,
  decorationIdsRef: { current: string[] }
) {
  if (!editor) {
    return
  }

  const model = editor.getModel()
  if (!model) {
    return
  }

  const range = {
    startLineNumber: block.startLine,
    startColumn: 1,
    endLineNumber: block.endLine,
    endColumn: model.getLineMaxColumn(block.endLine),
  }

  decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [
    {
      range,
      options: {
        isWholeLine: true,
        className: "query-execution-highlight",
        linesDecorationsClassName: "query-execution-highlight-gutter",
      },
    },
  ])

  editor.revealRangeInCenter(range)
}

function clearExecutedStatementHighlight(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  decorationIdsRef: { current: string[] }
) {
  if (!editor || decorationIdsRef.current.length === 0) {
    return
  }

  decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
}

function insertTextIntoEditor(editor: Monaco.editor.IStandaloneCodeEditor, text: string) {
  const model = editor.getModel()
  if (!model) {
    return
  }

  const selection = editor.getSelection()
  const position = editor.getPosition()

  if (selection && !selection.isEmpty()) {
    editor.executeEdits("tree-view-insert", [
      {
        range: selection,
        text,
        forceMoveMarkers: true,
      },
    ])
    return
  }

  if (position) {
    editor.executeEdits("tree-view-insert", [
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        text,
        forceMoveMarkers: true,
      },
    ])
    return
  }

  editor.executeEdits("tree-view-insert", [
    {
      range: model.getFullModelRange(),
      text,
      forceMoveMarkers: true,
    },
  ])
}

function getLeafName(tablePath: string) {
  const parts = tablePath.split(".").map((part) => part.trim()).filter(Boolean)
  return parts.at(-1) ?? tablePath
}

function upsertExecutionTabs(
  currentTabs: QueryExecutionTab[],
  incomingTabs: QueryExecutionTab[]
) {
  let nextTabs = [...currentTabs]
  let activeTabId = incomingTabs[0]?.id ?? null

  for (const [index, incomingTab] of incomingTabs.entries()) {
    const existingIndex = nextTabs.findIndex((tab) => tab.title === incomingTab.title)
    let resolvedId = incomingTab.id

    if (existingIndex >= 0) {
      const existingTab = nextTabs[existingIndex]
      resolvedId = existingTab.id
      nextTabs = [
        ...nextTabs.slice(0, existingIndex),
        {
          ...existingTab,
          ...incomingTab,
          id: existingTab.id,
        },
        ...nextTabs.slice(existingIndex + 1),
      ]
    } else {
      nextTabs = [...nextTabs, incomingTab]
    }

    if (index === 0) {
      activeTabId = resolvedId
    }
  }

  return {
    tabs: nextTabs,
    activeTabId,
  }
}

function getExecutionPlan(
  mode: "full" | "cursor",
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  fallbackText: string
): StatementExecutionPlan[] {
  const model = editor?.getModel()
  const baseText = model?.getValue() ?? fallbackText

  if (mode === "full") {
    return getSqlStatements(baseText).map((block) => ({
      text: block.text,
      block,
    }))
  }

  if (!editor || !model) {
    return getSqlStatements(baseText).map((block) => ({
      text: block.text,
      block,
    }))
  }

  const position = editor.getPosition()
  if (!position) {
    return getSqlStatements(baseText).map((block) => ({
      text: block.text,
      block,
    }))
  }

  const statements = getSqlStatements(baseText)
  const statement = pickSqlStatementBlock(statements, position.lineNumber)

  return statement
    ? [
        {
          text: statement.text,
          block: statement,
        },
      ]
    : []
}

function pickSqlStatementBlock(statements: SqlStatementBlock[], cursorLine: number) {
  if (!statements.length) {
    return null
  }

  const currentStatement = statements.find(
    (statement) => cursorLine >= statement.startLine && cursorLine <= statement.endLine
  )

  if (currentStatement) {
    return currentStatement
  }

  const nextStatementIndex = statements.findIndex((statement) => statement.startLine > cursorLine)

  if (nextStatementIndex === -1) {
    return statements.at(-1) ?? null
  }

  if (nextStatementIndex === 0) {
    return statements[0] ?? null
  }

  return statements[nextStatementIndex - 1] ?? null
}

function createQueryTabId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getQueryTabTitle(sql: string, fallbackIndex: number) {
  const tableName = extractTableName(sql)

  return tableName || `Query ${fallbackIndex + 1}`
}

function extractTableName(sql: string) {
  const compactSql = sql.replace(/\s+/g, " ").trim()
  const patterns = [
    /\bfrom\s+([`"\[\]\w.]+)/i,
    /\bjoin\s+([`"\[\]\w.]+)/i,
    /\binsert\s+into\s+([`"\[\]\w.]+)/i,
    /\bupdate\s+([`"\[\]\w.]+)/i,
    /\bdelete\s+from\s+([`"\[\]\w.]+)/i,
    /\btruncate\s+table\s+([`"\[\]\w.]+)/i,
    /\bmerge\s+into\s+([`"\[\]\w.]+)/i,
  ]

  for (const pattern of patterns) {
    const match = compactSql.match(pattern)
    const identifier = match?.[1]

    if (!identifier || identifier.startsWith("(")) {
      continue
    }

    const tableName = normalizeIdentifier(identifier)
    if (tableName) {
      return tableName
    }
  }

  return ""
}

function normalizeIdentifier(identifier: string) {
  const parts = identifier
    .split(".")
    .map((part) => part.trim().replace(/^[`"\[]+|[`"\]]+$/g, ""))
    .filter(Boolean)

  return parts.at(-1) ?? ""
}

function getSqlStatements(text: string) {
  const separators = findSqlSeparators(text)
  const statements: SqlStatementBlock[] = []
  let start = 0

  separators.forEach((separator) => {
    addStatementBlock(statements, text, start, separator + 1)
    start = separator + 1
  })

  addStatementBlock(statements, text, start, text.length)

  return statements.filter((statement) => statement.text.length > 0)
}

function addStatementBlock(
  statements: SqlStatementBlock[],
  text: string,
  rawStart: number,
  rawEnd: number
) {
  const trimmedStart = findTrimmedStart(text, rawStart, rawEnd)
  const trimmedEnd = findTrimmedEnd(text, rawStart, rawEnd)

  if (trimmedEnd < trimmedStart) {
    return
  }

  const startLine = countLinesBefore(text, trimmedStart) + 1
  const endLine = countLinesBefore(text, trimmedEnd) + 1

  statements.push({
    startLine,
    endLine,
    text: text.slice(trimmedStart, trimmedEnd + 1).trim(),
  })
}

function countLinesBefore(text: string, offset: number) {
  let lines = 0

  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      lines += 1
    }
  }

  return lines
}

function findTrimmedStart(text: string, start: number, end: number) {
  let current = start

  while (current < end && /\s/.test(text[current] ?? "")) {
    current += 1
  }

  return current
}

function findTrimmedEnd(text: string, start: number, end: number) {
  let current = end - 1

  while (current >= start && /\s/.test(text[current] ?? "")) {
    current -= 1
  }

  return current
}

function findSqlSeparators(text: string) {
  const separators: number[] = []
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && nextChar === "'") {
        index += 1
        continue
      }

      if (char === "'") {
        inSingleQuote = false
      }
      continue
    }

    if (inDoubleQuote) {
      if (char === '"' && nextChar === '"') {
        index += 1
        continue
      }

      if (char === '"') {
        inDoubleQuote = false
      }
      continue
    }

    if (inBacktick) {
      if (char === "`") {
        inBacktick = false
      }
      continue
    }

    if (char === "-" && nextChar === "-") {
      inLineComment = true
      index += 1
      continue
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true
      index += 1
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      continue
    }

    if (char === "`") {
      inBacktick = true
      continue
    }

    if (char === ";") {
      separators.push(index)
    }
  }

  return separators
}
