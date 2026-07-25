import type * as Monaco from "monaco-editor"

import type {
  DatabaseStructure,
  QueryExecutionResult,
  SavedConnection,
} from "@/types/connections"

export type DashboardEditorWorkspaceProps = {
  connection: SavedConnection
  databaseStructure: DatabaseStructure
}

export type DashboardEditorWorkspaceHandle = {
  insertText: (text: string) => void
  openSqlInNewTab: (sql: string, options?: { title?: string; databaseName?: string }) => void
  executeSqlText: (
    sql: string,
    options?: {
      title?: string
      databaseName?: string
      insertIntoEditor?: boolean
      sourceKind?: "table" | "view" | "query"
      editorTabId?: string
    }
  ) => Promise<void>
  previewTable: (tablePath: string) => Promise<void>
  executeTable: (tablePath: string) => Promise<void>
  runTableQuery: (tablePath: string, databaseName?: string, sourceKind?: "table" | "view") => Promise<void>
  clearDeletedObjectQuery: (
    objectPath: string,
    objectName: string,
    sourceKind: "table" | "view",
    databaseName?: string
  ) => void
}

export type QueryTabStatus = "success" | "error"

export type QueryExecutionTab = {
  id: string
  title: string
  sql: string
  status: QueryTabStatus
  message: string
  durationMs: number
  result: QueryExecutionResult | null
  sourceKind?: "table" | "view" | "query"
  editorTabId?: string
}

export type SqlAutocompleteSuggestion = {
  label: string
  insertText: string
  detail: string
  kind: Monaco.languages.CompletionItemKind
}

export type AutocompleteContext = {
  mode: "objects" | "columns"
  sourceReference: string | null
}

export type AutocompleteObject = {
  reference: string
  leafName: string
  detail: string
  kind: Monaco.languages.CompletionItemKind
  alias?: string | null
  columns: string[]
}

export type ParsedAutocompleteSource = {
  reference: string
  alias: string | null
}

export type ExecuteSqlOptions = {
  title?: string
  databaseName?: string
  insertIntoEditor?: boolean
  sourceKind?: "table" | "view" | "query"
  editorTabId?: string
}

export type OpenSqlTabOptions = {
  title?: string
  databaseName?: string
}

export type StatementExecutionPlan = {
  text: string
  block: SqlStatementBlock
}

export type SqlStatementBlock = {
  startLine: number
  endLine: number
  text: string
}

export type QueryResultsProps = {
  result: QueryExecutionResult | null
  showActions?: boolean
}

export type SortDirection = "asc" | "desc"

export type SortState = {
  column: string
  direction: SortDirection
}

export type ResizeState = {
  column: string
  startX: number
  startWidth: number
}
