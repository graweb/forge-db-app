"use client"

import dynamic from "next/dynamic"
import { useRef, useState } from "react"
import type { ReactNode } from "react"
import { Brackets, Filter, Play, Settings2, Sparkles } from "lucide-react"
import type * as Monaco from "monaco-editor"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { QueryExecutionResult, SavedConnection } from "@/lib/connections"

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

type DashboardEditorWorkspaceProps = {
  connection: SavedConnection
}

type QueryHistoryEntry = {
  sql: string
  status: "success" | "error"
  message: string
  durationMs?: number
  timestamp: string
}

function getDefaultQuery(databaseType: SavedConnection["databaseType"]) {
  if (databaseType === "sqlite") {
    return `SELECT 1 AS id, 'example' AS name, CURRENT_TIMESTAMP AS created_at;`
  }

  return `SELECT 1 AS id, 'example' AS name, CURRENT_TIMESTAMP AS created_at;`
}

export function DashboardEditorWorkspace({ connection }: DashboardEditorWorkspaceProps) {
  const [sqlText, setSqlText] = useState(() => getDefaultQuery(connection.databaseType))
  const [activeTab, setActiveTab] = useState<"resultado" | "mensagens" | "historico">("resultado")
  const [queryResult, setQueryResult] = useState<QueryExecutionResult | null>(null)
  const [resultNonce, setResultNonce] = useState(0)
  const [executionMessage, setExecutionMessage] = useState<string>(
    "Execute uma consulta para ver o resultado aqui."
  )
  const [history, setHistory] = useState<QueryHistoryEntry[]>([])
  const [executing, setExecuting] = useState(false)
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const handleExecute = async (mode: "full" | "cursor" = "cursor") => {
    const statement = getExecutionStatement(mode, editorRef.current, sqlText)

    if (!statement) {
      setActiveTab("mensagens")
      setExecutionMessage("Digite uma consulta SQL antes de executar.")
      return
    }

    setExecuting(true)
    setExecutionMessage("")
    setQueryResult(null)

    const startedAt = performance.now()

    try {
      const response = await fetch(`/api/connections/${connection.id}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: statement }),
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

      const durationMs = Math.round(performance.now() - startedAt)
      setLastDurationMs(durationMs)

      if (!response.ok || !payload.success) {
        const message = payload.details || payload.message || "Não foi possível executar a consulta."
        const entry: QueryHistoryEntry = {
          sql: statement,
          status: "error",
          message,
          durationMs,
          timestamp: new Date().toLocaleTimeString("pt-BR"),
        }

        setActiveTab("mensagens")
        setExecutionMessage(message)
        setHistory((current) => [entry, ...current].slice(0, 8))
        return
      }

      const result: QueryExecutionResult = {
        columns: payload.columns ?? [],
        rows: payload.rows ?? [],
        rowCount: payload.rowCount ?? payload.rows?.length ?? 0,
        affectedRows: payload.affectedRows,
        message: payload.message,
      }

      setQueryResult(result)
      setResultNonce((current) => current + 1)
      setExecutionMessage(payload.message)
      setActiveTab("resultado")
      const entry: QueryHistoryEntry = {
        sql: statement,
        status: "success",
        message: payload.message,
        durationMs,
        timestamp: new Date().toLocaleTimeString("pt-BR"),
      }

      setHistory((current) => [entry, ...current].slice(0, 8))
    } catch {
      const durationMs = Math.round(performance.now() - startedAt)
      setLastDurationMs(durationMs)
      const message = "Falha inesperada ao executar a consulta."
      const entry: QueryHistoryEntry = {
        sql: statement,
        status: "error",
        message,
        durationMs,
        timestamp: new Date().toLocaleTimeString("pt-BR"),
      }

      setActiveTab("mensagens")
      setExecutionMessage(message)
      setHistory((current) => [entry, ...current].slice(0, 8))
    } finally {
      setExecuting(false)
    }
  }

  const handleEditorMount = (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco
  ) => {
    editorRef.current = editor

    if (!monacoEnhancementsRegistered) {
      monacoEnhancementsRegistered = true

      monaco.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [" ", ".", ",", "(", "\n"],
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position)
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          }

          return {
            suggestions: [
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
        <div className="ml-auto hidden shrink-0 items-center gap-2 text-sm text-emerald-300 md:flex">
          <Sparkles className="size-4" />
          {lastDurationMs ? `Execução concluída em ${lastDurationMs} ms` : "Pronto para executar"}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-white/10 px-4 pt-3">
          <div className="flex items-center gap-2">
            <div className="rounded-t-xl border border-b-0 border-white/10 bg-white/8 px-4 py-2 text-sm text-white">
              Query 1.sql
            </div>
            <div className="rounded-t-xl border border-white/10 px-3 py-2 text-white/40">
              <Brackets className="size-4" />
            </div>
            <div className="ml-auto text-xs text-white/45">
              {sqlText.length.toLocaleString("pt-BR")} caracteres
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-white/10 px-4 py-4">
            <div className="h-56 min-h-0 rounded-2xl border border-white/10 bg-[#07111d] p-3 shadow-[0_16px_50px_-34px_rgba(0,0,0,0.95)]">
              <div className="h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[#050913]">
                <MonacoEditor
                  value={sqlText}
                  onChange={(value) => setSqlText(value ?? "")}
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

          <div className="grid min-h-0 flex-1 grid-rows-[48px_minmax(0,1fr)]">
            <div className="flex items-center gap-3 border-b border-white/10 px-4">
              <Tab active={activeTab === "resultado"} onClick={() => setActiveTab("resultado")}>
                Resultado
              </Tab>
              <Tab active={activeTab === "mensagens"} onClick={() => setActiveTab("mensagens")}>
                Mensagens
              </Tab>
              <Tab active={activeTab === "historico"} onClick={() => setActiveTab("historico")}>
                Histórico
              </Tab>
              <div className="ml-auto flex items-center gap-2 text-xs text-white/45">
                <Settings2 className="size-4" />
                Exportar
              </div>
            </div>

            <div className="min-h-0 overflow-hidden p-4">
              {activeTab === "resultado" ? (
                <div className="flex h-full min-h-0 flex-col">
                  <QueryResults
                    key={queryResult ? resultNonce : "empty-result"}
                    result={queryResult}
                  />
                </div>
              ) : null}

              {activeTab === "mensagens" ? (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-[#07111d] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-white">Mensagens</div>
                    <div className="text-xs text-white/45">
                      {lastDurationMs ? `${lastDurationMs} ms` : "Sem execução"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/4 p-4 text-sm leading-6 text-white/75">
                    {executionMessage}
                  </div>
                </div>
              ) : null}

              {activeTab === "historico" ? (
                <div className="space-y-3">
                  {history.length ? (
                    history.map((entry) => (
                      <div
                        key={`${entry.timestamp}-${entry.durationMs ?? 0}`}
                        className="rounded-2xl border border-white/10 bg-[#07111d] p-4"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              entry.status === "success" ? "bg-emerald-400" : "bg-red-400"
                            )}
                          />
                          <div className="text-sm text-white">{entry.message}</div>
                          <div className="ml-auto text-xs text-white/45">
                            {entry.timestamp}
                            {entry.durationMs ? ` · ${entry.durationMs} ms` : ""}
                          </div>
                        </div>
                        <pre className="mt-3 overflow-auto rounded-xl border border-white/10 bg-white/4 p-3 text-xs leading-5 text-white/60">
                          {entry.sql}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-[#07111d] px-6 py-8 text-sm text-white/50">
                      Nenhuma execução registrada ainda.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Tab({
  children,
  active = false,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-t-lg border px-4 py-2 text-sm transition-colors",
        active
          ? "border-sky-400/20 bg-sky-400/10 text-white"
          : "border-transparent text-white/55 hover:text-white"
      )}
    >
      {children}
    </button>
  )
}

function getExecutionStatement(
  mode: "full" | "cursor",
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  fallbackText: string
) {
  const model = editor?.getModel()
  const baseText = model?.getValue() ?? fallbackText

  if (mode === "full") {
    return baseText.trim()
  }

  if (!editor || !model) {
    return baseText.trim()
  }

  const selection = editor.getSelection()
  if (selection && !selection.isEmpty()) {
    const selectedText = model.getValueInRange(selection).trim()
    if (selectedText) {
      return selectedText
    }
  }

  const position = editor.getPosition()
  if (!position) {
    return baseText.trim()
  }

  const text = baseText
  const cursorLine = position.lineNumber
  const statements = getSqlStatements(text)
  const statement = pickSqlStatement(statements, cursorLine)

  return statement || text.trim()
}

type SqlStatementBlock = {
  startLine: number
  endLine: number
  text: string
}

function pickSqlStatement(statements: SqlStatementBlock[], cursorLine: number) {
  if (!statements.length) {
    return ""
  }

  const currentStatement = statements.find(
    (statement) => cursorLine >= statement.startLine && cursorLine <= statement.endLine
  )

  if (currentStatement) {
    return currentStatement.text
  }

  const nextStatementIndex = statements.findIndex((statement) => statement.startLine > cursorLine)

  if (nextStatementIndex === -1) {
    return statements.at(-1)?.text ?? ""
  }

  if (nextStatementIndex === 0) {
    return statements[0]?.text ?? ""
  }

  return statements[nextStatementIndex - 1]?.text ?? ""
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

      if (char === "'" ) {
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
