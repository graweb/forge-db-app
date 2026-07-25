"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import type { DragEvent } from "react"
import type * as Monaco from "monaco-editor"
import {
  Code2,
  Eye,
  Filter,
  Link2,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QueryResults } from "@/components/dashboard/query-results"
import { cn } from "@/helpers/utils"
import { quoteIdentifier } from "@/helpers/connections"
import type {
  DatabaseStructureDatabase,
  QueryExecutionResult,
  SavedConnection,
  TableDetails,
} from "@/types/connections"
import type {
  DragSource,
  DropPosition,
  ForeignKeySummary,
  FilterConnector,
  ColumnJoinAnchor,
  JoinType,
  SelectedTable,
  SourceTable,
  ViewFilter,
} from "@/types/dashboard-view"
import type { CreateViewModalProps } from "@/types/dashboard-modals"

const JOIN_OPTIONS: Array<{ value: JoinType; label: string }> = [
  { value: "LEFT JOIN", label: "LEFT JOIN" },
  { value: "INNER JOIN", label: "INNER JOIN" },
  { value: "JOIN", label: "JOIN" },
  { value: "CROSS JOIN", label: "CROSS JOIN" },
]

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-80 items-center justify-center rounded-xl border border-white/10 bg-[#050913] text-sm text-white/45">
      Carregando editor SQL...
    </div>
  ),
})

export function CreateViewModal({
  open,
  connection,
  mode,
  database,
  databaseName,
  schemaName,
  initialView,
  onOpenChange,
  onSaved,
}: CreateViewModalProps) {
  const [viewName, setViewName] = useState("nova_view")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTables, setSelectedTables] = useState<SelectedTable[]>([])
  const [selectedColumnsByTable, setSelectedColumnsByTable] = useState<Record<string, string[]>>({})
  const [wildcardColumnTableIds, setWildcardColumnTableIds] = useState<Set<string>>(() => new Set())
  const [columnJoinAnchor, setColumnJoinAnchor] = useState<ColumnJoinAnchor | null>(null)
  const [filters, setFilters] = useState<ViewFilter[]>([])
  const [sqlText, setSqlText] = useState("")
  const [isManualSql, setIsManualSql] = useState(false)
  const [activeTab, setActiveTab] = useState("builder")
  const [previewResult, setPreviewResult] = useState<QueryExecutionResult | null>(null)
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null)
  const [previewDurationMs, setPreviewDurationMs] = useState<number | null>(null)
  const [executingPreview, setExecutingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDraggingTable, setIsDraggingTable] = useState(false)
  const [isCanvasDropActive, setIsCanvasDropActive] = useState(false)
  const [draggedTableId, setDraggedTableId] = useState<string | null>(null)
  const [dragSource, setDragSource] = useState<DragSource | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null)
  const [tableDetailsById, setTableDetailsById] = useState<Record<string, TableDetails | null>>({})
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const sqlEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const manualSqlSyncVersionRef = useRef(0)
  const resolvedSchemaName = schemaName?.trim() || (connection ? getFallbackSchemaName(connection) : "public")
  const catalog = useMemo(
    () => (connection ? buildCatalog(connection, database, resolvedSchemaName) : []),
    [connection, database, resolvedSchemaName]
  )
  const catalogTables = useMemo(() => catalog.flatMap((group) => group.tables), [catalog])

  useEffect(() => {
    if (!open || !connection) {
      return
    }

    const activeConnection = connection
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      const initialSql = mode === "edit" && initialView?.sqlText ? initialView.sqlText : ""
      const parsedTables = initialSql
        ? parseSelectedTablesFromSql(initialSql, catalogTables, resolvedSchemaName) ?? []
        : []
      const parsedColumns =
        initialSql && parsedTables.length
          ? parseSelectedColumnsFromSql(initialSql, parsedTables)
          : null
      const parsedFilters = initialSql ? parseFiltersFromSql(initialSql) : []

      setViewName(mode === "edit" ? initialView?.viewName || "nova_view" : "nova_view")
      setSearchTerm("")
      setSelectedTables(parsedTables)
      setSelectedColumnsByTable(parsedColumns?.columnsByTable ?? {})
      setWildcardColumnTableIds(parsedColumns?.wildcardTableIds ?? new Set())
      setColumnJoinAnchor(null)
      setFilters(parsedFilters ?? [])
      setActiveTab("builder")
      setPreviewResult(null)
      setPreviewErrorMessage(null)
      setPreviewDurationMs(null)
      setExecutingPreview(false)
      setErrorMessage(null)
      setSaving(false)
      setIsManualSql(mode === "edit" && Boolean(initialSql))
      setIsDraggingTable(false)
      setIsCanvasDropActive(false)
      setDraggedTableId(null)
      setDragSource(null)
      setDropTarget(null)
      setTableDetailsById({})
      setSqlText(
        mode === "edit" && initialSql
          ? initialSql
          : buildViewSql(activeConnection, databaseName, resolvedSchemaName, "nova_view", [], {}, [])
      )
    })

    return () => {
      cancelled = true
    }
  }, [open, connection?.id, databaseName, resolvedSchemaName, connection, mode, initialView, catalogTables])

  useEffect(() => {
    if (!open || !connection || isManualSql) {
      return
    }

    const activeConnection = connection
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setSqlText(
        buildViewSql(
          activeConnection,
          databaseName,
          resolvedSchemaName,
          viewName || "nova_view",
          selectedTables,
          selectedColumnsByTable,
          filters
        )
      )
    })

    return () => {
      cancelled = true
    }
  }, [
    open,
    connection,
    databaseName,
    resolvedSchemaName,
    viewName,
    selectedTables,
    selectedColumnsByTable,
    filters,
    isManualSql,
  ])

  useEffect(() => {
    if (!open || !connection || !isManualSql) {
      return
    }

    const syncVersion = ++manualSqlSyncVersionRef.current
    const parsedTables = parseSelectedTablesFromSql(sqlText, catalogTables, resolvedSchemaName)
    const parsedColumns = parseSelectedColumnsFromSql(sqlText, parsedTables ?? selectedTables)
    const parsedFilters = parseFiltersFromSql(sqlText)
    const normalizedSql = sqlText.trim()

    queueMicrotask(() => {
      if (manualSqlSyncVersionRef.current !== syncVersion) {
        return
      }

      if (!normalizedSql) {
        setSelectedTables([])
        setSelectedColumnsByTable({})
        setWildcardColumnTableIds(new Set())
        setColumnJoinAnchor(null)
        setFilters([])
        return
      }

      if (parsedTables) {
        setSelectedTables((current) => {
          if (areSelectedTablesEqual(current, parsedTables)) {
            return current
          }

          return parsedTables
        })
      }

      if (parsedColumns) {
        setSelectedColumnsByTable((current) => {
          if (areSelectedColumnSelectionsEqual(current, parsedColumns.columnsByTable)) {
            return current
          }

          return parsedColumns.columnsByTable
        })
        setWildcardColumnTableIds((current) =>
          areWildcardTableIdsEqual(current, parsedColumns.wildcardTableIds)
            ? current
            : parsedColumns.wildcardTableIds
        )
      }

      if (parsedFilters !== null) {
        setFilters((current) => {
          if (areViewFiltersEqual(current, parsedFilters)) {
            return current
          }

          return parsedFilters
        })
      }
    })

    return () => {
      manualSqlSyncVersionRef.current += 1
    }
  }, [open, connection, isManualSql, sqlText, catalogTables, resolvedSchemaName, selectedTables])

  useEffect(() => {
    if (!open || !connection || !selectedTables.length) {
      return
    }

    const activeConnection = connection
    const missingTables = selectedTables.filter((table) => tableDetailsById[table.id] === undefined)

    if (!missingTables.length) {
      return
    }

    let cancelled = false

    async function loadTableDetails() {
      const entries = await Promise.all(
        missingTables.map(async (table) => {
          try {
            const response = await fetch(
              `/api/connections/${activeConnection.id}/tables/${encodeURIComponent(table.tableName)}?databaseName=${encodeURIComponent(
                databaseName || activeConnection.databaseName
              )}&schemaName=${encodeURIComponent(table.schemaName)}`
            )

            if (!response.ok) {
              return [table.id, null] as const
            }

            const payload: { success: boolean } & TableDetails = await response.json()

            if (!payload.success) {
              return [table.id, null] as const
            }

            return [table.id, payload] as const
          } catch {
            return [table.id, null] as const
          }
        })
      )

      if (cancelled) {
        return
      }

      setTableDetailsById((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }))
    }

    void loadTableDetails()

    return () => {
      cancelled = true
    }
  }, [open, connection, databaseName, selectedTables, tableDetailsById])

  useEffect(() => {
    if (!open || !connection || isManualSql || selectedTables.length < 2) {
      return
    }

    const databaseType = connection.databaseType
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setSelectedTables((current) => {
        let changed = false
        const next = current.map((table, index) => {
          if (index === 0 || !shouldAutoFillJoinCondition(table.joinCondition)) {
            return table
          }

          const inferredJoinCondition = inferJoinConditionForTable(
            index,
            current,
            tableDetailsById,
            databaseType
          )

          if (!inferredJoinCondition) {
            return table
          }

          changed = true
          return {
            ...table,
            joinType: table.joinType === "CROSS JOIN" ? "LEFT JOIN" : table.joinType,
            joinCondition: inferredJoinCondition,
          }
        })

        return changed ? next : current
      })
    })

    return () => {
      cancelled = true
    }
  }, [open, connection, isManualSql, selectedTables, tableDetailsById])

  const filteredCatalog = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    if (!normalizedSearch) {
      return catalog
    }

    return catalog
      .map((group) => ({
        ...group,
        tables: group.tables.filter((table) =>
          `${table.tableName} ${table.reference} ${table.schemaName}`.toLowerCase().includes(normalizedSearch)
        ),
      }))
      .filter((group) => group.tables.length > 0)
  }, [catalog, searchTerm])

  const generatedSql = connection
    ? buildViewSql(
        connection,
        databaseName,
        resolvedSchemaName,
        viewName.trim() || "nova_view",
        selectedTables,
        selectedColumnsByTable,
        filters
      )
    : ""
  const effectiveSql = isManualSql ? sqlText : generatedSql
  const previewSql = getPreviewSqlFromViewSql(effectiveSql)
  const canExecutePreview = Boolean(previewSql.trim())
  const hasPreviewExecution =
    executingPreview || Boolean(previewResult) || Boolean(previewErrorMessage) || previewDurationMs !== null
  const canCreateView =
    Boolean(viewName.trim()) && Boolean(effectiveSql.trim()) && (isManualSql || selectedTables.length > 0)
  const dialogTitle = mode === "edit" ? "Editar View" : "Nova View"
  const dialogDescription =
    mode === "edit"
      ? "Ajuste a definição carregada, os filtros e as colunas antes de salvar."
      : "Selecione tabelas, ajuste os joins e valide o SQL antes de criar."

  if (!connection) {
    return null
  }

  const activeConnection: SavedConnection = connection

  function addTable(table: SourceTable) {
    setErrorMessage(null)
    exitManualSqlMode()
    setSelectedTables((current) => {
      if (current.some((item) => item.id === table.id)) {
        return current
      }

      return [
        ...current,
        {
          ...table,
          joinType: "LEFT JOIN",
          joinCondition: "1 = 1",
        },
      ]
    })
  }

  function toggleSelectedColumn(tableId: string, columnName: string) {
    setErrorMessage(null)
    exitManualSqlMode()
    const table = selectedTables.find((item) => item.id === tableId)
    const allColumnNames = table?.columns.map((column) => column.name) ?? []
    const isWildcardSelection =
      wildcardColumnTableIds.has(tableId) || !Object.prototype.hasOwnProperty.call(selectedColumnsByTable, tableId)

    setWildcardColumnTableIds((current) => {
      if (!current.has(tableId)) {
        return current
      }

      const next = new Set(current)
      next.delete(tableId)
      return next
    })
    setSelectedColumnsByTable((current) => {
      const next = { ...current }
      const currentColumns = new Set(
        isWildcardSelection && allColumnNames.length ? allColumnNames : next[tableId] ?? []
      )

      if (currentColumns.has(columnName)) {
        currentColumns.delete(columnName)
      } else {
        currentColumns.add(columnName)
      }

      const nextColumns = Array.from(currentColumns)
      if (nextColumns.length) {
        next[tableId] = nextColumns
      } else {
        delete next[tableId]
      }

      return next
    })
  }

  function selectOnlyIdColumn(table: SelectedTable) {
    setErrorMessage(null)
    exitManualSqlMode()

    const idColumn = table.columns.find((column) => column.name.trim().toLowerCase() === "id")
    if (!idColumn) {
      setErrorMessage(`A tabela ${table.tableName} não possui uma coluna id.`)
      return
    }

    setWildcardColumnTableIds((current) => {
      if (!current.has(table.id)) {
        return current
      }

      const next = new Set(current)
      next.delete(table.id)
      return next
    })
    setSelectedColumnsByTable((current) => ({
      ...current,
      [table.id]: [idColumn.name],
    }))
  }

  function handleColumnJoinClick(tableId: string, columnName: string) {
    setErrorMessage(null)
    exitManualSqlMode()

    const selectedIndex = selectedTables.findIndex((table) => table.id === tableId)
    if (selectedIndex === -1) {
      return
    }

    if (!columnJoinAnchor) {
      setColumnJoinAnchor({ tableId, columnName })
      return
    }

    if (columnJoinAnchor.tableId === tableId && columnJoinAnchor.columnName === columnName) {
      setColumnJoinAnchor(null)
      return
    }

    const anchorIndex = selectedTables.findIndex((table) => table.id === columnJoinAnchor.tableId)
    if (anchorIndex === -1) {
      setColumnJoinAnchor({ tableId, columnName })
      return
    }

    const leftIsAnchor = anchorIndex < selectedIndex
    const leftTableId = leftIsAnchor ? columnJoinAnchor.tableId : tableId
    const rightTableId = leftIsAnchor ? tableId : columnJoinAnchor.tableId
    const leftColumnName = leftIsAnchor ? columnJoinAnchor.columnName : columnName
    const rightColumnName = leftIsAnchor ? columnName : columnJoinAnchor.columnName
    const leftIndex = selectedTables.findIndex((table) => table.id === leftTableId)
    const rightIndex = selectedTables.findIndex((table) => table.id === rightTableId)

    if (leftIndex === -1 || rightIndex === -1 || leftIndex === rightIndex) {
      setColumnJoinAnchor({ tableId, columnName })
      return
    }

    setSelectedTables((current) =>
      current.map((item) => {
        if (item.id !== rightTableId) {
          return item
        }

        const aliasLeft = getTableAlias(leftIndex)
        const aliasRight = getTableAlias(rightIndex)

        return {
          ...item,
          joinType: item.joinType === "CROSS JOIN" ? "LEFT JOIN" : item.joinType,
          joinCondition: `${aliasLeft}.${quoteIdentifier(activeConnection.databaseType, leftColumnName)} = ${aliasRight}.${quoteIdentifier(activeConnection.databaseType, rightColumnName)}`,
        }
      })
    )

    setColumnJoinAnchor(null)
  }

  function insertSelectedTable(table: SourceTable, index: number) {
    setErrorMessage(null)
    exitManualSqlMode()
    setSelectedTables((current) => {
      if (current.some((item) => item.id === table.id)) {
        return current
      }

      const next = [...current]
      next.splice(Math.max(0, Math.min(index, next.length)), 0, {
        ...table,
        joinType: "LEFT JOIN",
        joinCondition: "1 = 1",
      })
      return next
    })
  }

  function addTableById(tableId: string) {
    const table = findTableById(catalog, tableId)
    if (!table) {
      return
    }

    addTable(table)
  }

  function moveSelectedTable(tableId: string, targetId: string, position: DropPosition) {
    setErrorMessage(null)
    exitManualSqlMode()
    setSelectedTables((current) => {
      const draggedIndex = current.findIndex((item) => item.id === tableId)
      const targetIndex = current.findIndex((item) => item.id === targetId)

      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
        return current
      }

      const next = [...current]
      const [dragged] = next.splice(draggedIndex, 1)
      const adjustedTargetIndex = next.findIndex((item) => item.id === targetId)

      if (adjustedTargetIndex === -1) {
        return current
      }

      const insertIndex = position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1
      next.splice(insertIndex, 0, dragged)

      return next
    })
  }

  function handleDragStart(tableId: string, source: DragSource, event: DragEvent<HTMLElement>) {
    event.dataTransfer.effectAllowed = "copy"
    event.dataTransfer.setData("text/plain", tableId)
    event.dataTransfer.setData("application/x-forge-db-dnd-source", source)
    setIsDraggingTable(true)
    setDraggedTableId(tableId)
    setDragSource(source)
    setDropTarget(null)
  }

  function handleDragEnd() {
    clearDragState()
  }

  function handleCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = dragSource === "canvas" ? "move" : "copy"
    setIsCanvasDropActive(true)
  }

  function handleCanvasDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) {
      setIsCanvasDropActive(false)
      setDropTarget(null)
    }
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const tableId = event.dataTransfer.getData("text/plain")
    const source = event.dataTransfer.getData("application/x-forge-db-dnd-source") as DragSource | ""

    if (tableId && source === "canvas") {
      if (draggedTableId && dropTarget && draggedTableId !== dropTarget.id) {
        moveSelectedTable(draggedTableId, dropTarget.id, dropTarget.position)
      } else if (draggedTableId) {
        setSelectedTables((current) => {
          const draggedIndex = current.findIndex((item) => item.id === draggedTableId)
          if (draggedIndex === -1) {
            return current
          }

          const next = [...current]
          const [dragged] = next.splice(draggedIndex, 1)
          next.push(dragged)
          return next
        })
      }
    } else if (tableId) {
      addTableById(tableId)
    }

    clearDragState()
  }

  function handleSelectedTableDragOver(
    event: DragEvent<HTMLDivElement>,
    tableId: string
  ) {
    if (!draggedTableId) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = dragSource === "canvas" ? "move" : "copy"

    const rect = event.currentTarget.getBoundingClientRect()
    const isUpperHalf = event.clientY < rect.top + rect.height / 2

    setIsCanvasDropActive(true)
    setDropTarget({
      id: tableId,
      position: isUpperHalf ? "before" : "after",
    })
  }

  function handleSelectedTableDrop(
    event: DragEvent<HTMLDivElement>,
    tableId: string
  ) {
    event.preventDefault()
    if (!draggedTableId) {
      return
    }

    const position =
      dropTarget?.id === tableId ? dropTarget.position : "after"

    if (dragSource === "canvas" && draggedTableId !== tableId) {
      moveSelectedTable(draggedTableId, tableId, position)
    } else if (dragSource !== "canvas") {
      const sourceTable = findTableById(catalog, draggedTableId)
      if (sourceTable) {
        const targetIndex = selectedTables.findIndex((item) => item.id === tableId)
        const insertBefore = position === "before" ? targetIndex : targetIndex + 1
        insertSelectedTable(sourceTable, insertBefore)
      }
    }

    clearDragState()
  }

  function clearDragState() {
    setIsDraggingTable(false)
    setIsCanvasDropActive(false)
    setDraggedTableId(null)
    setDragSource(null)
    setDropTarget(null)
  }

  function exitManualSqlMode() {
    manualSqlSyncVersionRef.current += 1
    setIsManualSql(false)
  }

  function toggleTable(table: SourceTable) {
    setErrorMessage(null)
    exitManualSqlMode()
    setSelectedTables((current) =>
      current.some((item) => item.id === table.id)
        ? current.filter((item) => item.id !== table.id)
        : [
            ...current,
            {
              ...table,
              joinType: "LEFT JOIN",
              joinCondition: "1 = 1",
            },
          ]
    )
  }

  function updateSelectedTable(index: number, patch: Partial<SelectedTable>) {
    setErrorMessage(null)
    exitManualSqlMode()
    setSelectedTables((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    )
  }

  function removeSelectedTable(index: number) {
    setErrorMessage(null)
    exitManualSqlMode()
    const removed = selectedTables[index]
    if (removed) {
      setSelectedColumnsByTable((columnsCurrent) => {
        const columnsNext = { ...columnsCurrent }
        delete columnsNext[removed.id]
        return columnsNext
      })

      setColumnJoinAnchor((anchor) => (anchor?.tableId === removed.id ? null : anchor))
      setWildcardColumnTableIds((current) => {
        if (!current.has(removed.id)) {
          return current
        }

        const next = new Set(current)
        next.delete(removed.id)
        return next
      })
    }

    setSelectedTables((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function addFilter() {
    setErrorMessage(null)
    exitManualSqlMode()
    setFilters((current) => [
      ...current,
      {
        id: createId(),
        expression: "",
        connector: current.length ? "AND" : undefined,
      },
    ])
  }

  function updateFilter(index: number, value: string) {
    setErrorMessage(null)
    exitManualSqlMode()
    setFilters((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, expression: value } : item))
    )
  }

  function updateFilterConnector(index: number, connector: FilterConnector) {
    setErrorMessage(null)
    exitManualSqlMode()
    setFilters((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, connector: index === 0 ? undefined : connector } : item
      )
    )
  }

  function removeFilter(index: number) {
    setErrorMessage(null)
    exitManualSqlMode()
    setFilters((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index)

      if (next.length) {
        next[0] = {
          ...next[0],
          connector: undefined,
        }
      }

      return next
    })
  }

  async function handleExecutePreview() {
    if (!previewSql.trim()) {
      setPreviewResult(null)
      setPreviewErrorMessage("Não há SQL para executar.")
      setActiveTab("result")
      return
    }

    setExecutingPreview(true)
    setActiveTab("result")
    setPreviewErrorMessage(null)
    setPreviewDurationMs(null)

    const startedAt = performance.now()

    try {
      const response = await fetch(`/api/connections/${activeConnection.id}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: previewSql,
          databaseName: databaseName || activeConnection.databaseName,
        }),
      })

      const payload: {
        success: boolean
        message: string
        details?: string
        columns?: string[]
        rows?: QueryExecutionResult["rows"]
        rowCount?: number
        affectedRows?: number
      } = await response.json()

      setPreviewDurationMs(Math.round(performance.now() - startedAt))

      if (!response.ok || !payload.success) {
        setPreviewResult(null)
        setPreviewErrorMessage(payload.details || payload.message || "Não foi possível executar a consulta.")
        return
      }

      setPreviewResult({
        columns: payload.columns ?? [],
        rows: payload.rows ?? [],
        rowCount: payload.rowCount ?? payload.rows?.length ?? 0,
        affectedRows: payload.affectedRows,
        message: payload.message,
      })
    } catch {
      setPreviewResult(null)
      setPreviewErrorMessage("Não foi possível executar a consulta.")
    } finally {
      setExecutingPreview(false)
    }
  }

  function handleSqlEditorMount(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco
  ) {
    sqlEditorRef.current = editor

    editor.addAction({
      id: "execute-view-preview",
      label: "Executar prévia da view",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1.5,
      run: () => {
        void handleExecutePreview()
      },
    })
  }

  async function handleCreateView() {
    const normalizedViewName = viewName.trim()

    if (!normalizedViewName) {
      setErrorMessage("Informe o nome da view antes de continuar.")
      return
    }

    if (viewNameAlreadyExists(database, resolvedSchemaName, normalizedViewName, initialView, mode)) {
      setErrorMessage(`Já existe uma view chamada ${normalizedViewName} neste schema.`)
      return
    }

    setSaving(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/connections/${activeConnection.id}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: effectiveSql,
          databaseName: databaseName || activeConnection.databaseName,
        }),
      })

      const payload: {
        success: boolean
        message?: string
        details?: string
      } = await response.json()

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.details || payload.message || "Não foi possível criar a view.")
        return
      }

      await onSaved({
        message: payload.message || "View criada",
        details: payload.details || "A view foi criada com sucesso.",
        viewName: normalizedViewName,
      })
    } catch {
      setErrorMessage("Não foi possível executar o SQL da view.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="bottom"
        className="h-[calc(100dvh-0.5rem)] overflow-hidden border-t border-white/10 bg-[#050a14] p-0 text-white shadow-[0_-36px_90px_-45px_rgba(0,0,0,0.95)]"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-white/10 px-4 py-2.5 lg:px-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] xl:items-end">
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
                    <Eye className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-white sm:text-xl">{dialogTitle}</div>
                    <div className="line-clamp-1 text-sm text-white/55">{dialogDescription}</div>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 pr-10 text-xs text-white/45 xl:justify-end xl:pr-12">
                <span
                  className="max-w-[min(14rem,45vw)] truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
                  title={activeConnection.connectionName}
                >
                  {activeConnection.connectionName}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {activeConnection.databaseType.toUpperCase()}
                </span>
                <span
                  className="max-w-[min(12rem,35vw)] truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
                  title={resolvedSchemaName}
                >
                  {resolvedSchemaName}
                </span>
              </div>
            </div>
          </div>

          <Tabs
            defaultValue="builder"
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 border-b border-white/10 px-5 lg:px-6">
              <TabsList className="h-auto rounded-none border-0 bg-transparent p-0">
                <TabsTrigger value="builder" className="h-11 rounded-none px-5">
                  Selecionar Tabelas
                </TabsTrigger>
                <TabsTrigger value="sql" className="h-11 rounded-none px-5">
                  SQL Editor
                </TabsTrigger>
                <TabsTrigger value="result" className="h-11 rounded-none px-5">
                  Resultado
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-4 lg:px-5">
              <TabsContent value="builder" className="mt-0 flex h-full min-h-0 overflow-y-auto">
                <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(14rem,18rem)_minmax(17rem,21rem)_minmax(0,1fr)] 2xl:grid-cols-[320px_360px_minmax(0,1fr)]">
                  <div className="order-1 flex min-h-0 flex-col gap-4">
                    <Card className="flex min-h-64 flex-1 flex-col border-white/10 bg-white/4">
                      <CardHeader className="shrink-0 space-y-4 pb-3">
                        <div className="space-y-1">
                          <CardTitle className="text-base text-white">Estrutura do Banco</CardTitle>
                          <CardDescription className="text-white/50">
                            Escolha as tabelas disponíveis no schema atual.
                          </CardDescription>
                        </div>
                        <div className="space-y-3">
                          <Input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Buscar tabelas..."
                            className="h-10 border-white/10 bg-white/5 text-white placeholder:text-white/30"
                          />
                          <div className="flex items-center justify-between text-xs text-white/40">
                            <span>
                              {filteredCatalog.reduce((count, group) => count + group.tables.length, 0)} tabelas
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                              {catalog.length ? "Disponível" : "Sem estrutura"}
                            </span>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
                        <div className="space-y-4">
                          {filteredCatalog.length ? (
                            filteredCatalog.map((group) => (
                              <div key={`${group.schemaName}-${group.label}`} className="space-y-2">
                                <div className="flex items-center justify-between text-sm text-white/75">
                                  <span>{group.label}</span>
                                  <span className="text-xs text-white/35">{group.tables.length}</span>
                                </div>
                                <div className="space-y-1">
                                  {group.tables.map((table) => {
                                    const isSelected = selectedTables.some((item) => item.id === table.id)

                                    return (
                                      <button
                                        key={table.id}
                                        type="button"
                                        draggable
                                        onDragStart={(event) => handleDragStart(table.id, "palette", event)}
                                        onDragEnd={handleDragEnd}
                                        onClick={() => toggleTable(table)}
                                        onDoubleClick={() => addTable(table)}
                                        className={cn(
                                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                                          isSelected
                                            ? "border-sky-400/30 bg-sky-400/12 text-white"
                                            : "border-white/10 bg-white/3 text-white/80 hover:border-white/20 hover:bg-white/6",
                                          isDraggingTable && "cursor-grab active:cursor-grabbing"
                                        )}
                                      >
                                        <div
                                          className={cn(
                                            "flex size-8 items-center justify-center rounded-lg border",
                                            isSelected
                                              ? "border-sky-400/20 bg-sky-400/15 text-sky-300"
                                              : "border-white/10 bg-white/5 text-white/60"
                                          )}
                                        >
                                          <Table2 className="size-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-sm font-medium">{table.tableName}</div>
                                          <div className="truncate text-xs text-white/40">{table.reference}</div>
                                        </div>
                                        {table.columns.length ? (
                                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/45">
                                            {table.columns.length} colunas
                                          </span>
                                        ) : null}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-6 text-sm leading-6 text-white/45">
                              Nenhuma tabela encontrada. Ajuste a busca ou atualize a estrutura da conexão.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="order-3 flex min-h-0 flex-col gap-3 lg:col-span-2 xl:order-2 xl:col-span-1">
                    <Card className="flex min-h-0 flex-1 flex-col border-white/10 bg-white/4">
                      <CardHeader className="shrink-0 pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle className="text-base text-white">Joins</CardTitle>
                            <CardDescription className="text-white/50">
                              Ajuste os relacionamentos entre as tabelas adicionadas.
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-0">
                        {selectedTables.length > 1 ? (
                          <div className="space-y-3">
                            {selectedTables.slice(1).map((table, index) => {
                              const absoluteIndex = index + 1

                              return (
                                <div
                                  key={table.id}
                                  className="space-y-3 rounded-2xl border border-white/10 bg-white/3 p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-white">{table.tableName}</div>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/45">
                                      t{absoluteIndex + 1}
                                    </span>
                                  </div>

                                  <div className="grid gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                                        Tipo de join
                                      </Label>
                                      <Select
                                        value={table.joinType}
                                        onValueChange={(value) =>
                                          updateSelectedTable(absoluteIndex, {
                                            joinType: value as JoinType,
                                          })
                                        }
                                      >
                                        <SelectTrigger className="h-10 border-white/10 bg-white/5 text-white">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {JOIN_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                              {option.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                                        Condição
                                      </Label>
                                      <Input
                                        value={table.joinCondition}
                                        onChange={(event) =>
                                          updateSelectedTable(absoluteIndex, {
                                            joinCondition: event.target.value,
                                          })
                                        }
                                        placeholder="t1.id = t2.customer_id"
                                        className="h-10 border-white/10 bg-white/5 text-white placeholder:text-white/30"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm leading-6 text-white/45">
                            Adicione pelo menos duas tabelas para configurar joins.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="flex min-h-52 shrink-0 flex-col border-white/10 bg-white/4 lg:h-[clamp(12rem,24dvh,16rem)]">
                      <CardHeader className="shrink-0 pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle className="text-base text-white">Filtros</CardTitle>
                            <CardDescription className="text-white/50">
                              Aplique condições extras para o `WHERE`.
                            </CardDescription>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addFilter}
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                          >
                            <Plus className="size-4" />
                            Adicionar filtro
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto pt-0">
                        {filters.length ? (
                          filters.map((filter, index) => (
                            <div
                              key={filter.id}
                              className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/3 p-3"
                            >
                              <Filter className="mt-2 size-4 shrink-0 text-sky-300/80" />
                              {index > 0 ? (
                                <Select
                                  value={filter.connector ?? "AND"}
                                  onValueChange={(value) =>
                                    updateFilterConnector(index, value as FilterConnector)
                                  }
                                >
                                  <SelectTrigger className="h-10 w-20 border-white/10 bg-white/5 text-[11px] text-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="AND">AND</SelectItem>
                                    <SelectItem value="OR">OR</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : null}
                              <Input
                                value={filter.expression}
                                onChange={(event) => updateFilter(index, event.target.value)}
                                placeholder="status = 'ativo'"
                                className="h-10 flex-1 border-white/10 bg-white/5 text-white placeholder:text-white/30"
                              />
                              <button
                                type="button"
                                onClick={() => removeFilter(index)}
                                className="inline-flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/45 transition-colors hover:bg-white/10 hover:text-rose-300"
                                aria-label="Remover filtro"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm leading-6 text-white/45">
                            Nenhum filtro configurado.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="order-2 flex h-full min-h-0 flex-col border-white/10 bg-white/4 xl:order-3">
                    <CardHeader className="shrink-0 pb-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <CardTitle className="text-base text-white">Tabelas e colunas selecionadas</CardTitle>
                          <CardDescription className="text-white/50">
                            Marque as colunas que entram no `SELECT` e conecte pares para montar os joins.
                          </CardDescription>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleExecutePreview}
                          disabled={executingPreview || !canExecutePreview}
                          className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                        >
                          {executingPreview ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                          Executar
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="min-h-0 flex-1 pt-0">
                      <div
                        onDragOver={handleCanvasDragOver}
                        onDragLeave={handleCanvasDragLeave}
                        onDrop={handleCanvasDrop}
                        className={cn(
                          "relative h-full min-h-[clamp(22rem,52dvh,34rem)] overflow-auto rounded-2xl border bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_40%),linear-gradient(180deg,rgba(6,11,20,0.96),rgba(4,8,14,0.96))] p-2.5 transition-colors",
                          isCanvasDropActive
                            ? "border-sky-400/40 shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_18px_60px_-30px_rgba(56,189,248,0.35)]"
                          : "border-white/10",
                          draggedTableId && !isCanvasDropActive ? "border-white/15" : ""
                        )}
                        ref={canvasRef}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] bg-size-[20px_20px]" />
                        <div className="relative flex h-full min-h-0 items-stretch justify-stretch">
                          {selectedTables.length ? (
                            <div className="relative z-10 grid w-full gap-2 self-start xl:grid-cols-2 2xl:grid-cols-3">
                              {selectedTables.map((table, index) => {
                                const tableDetails = tableDetailsById[table.id]
                                const outgoingForeignKeys = (tableDetails?.foreignKeys ?? [])
                                  .map((value) => parseForeignKeySummary(value))
                                  .filter((foreignKey): foreignKey is ForeignKeySummary => Boolean(foreignKey))
                                const outgoingForeignKeyColumnNames = new Set(
                                  outgoingForeignKeys.map((foreignKey) => foreignKey.sourceColumn.trim().toLowerCase())
                                )
                                const incomingForeignKeys = selectedTables.flatMap((sourceTable) => {
                                  const sourceDetails = tableDetailsById[sourceTable.id]
                                  const sourceForeignKeys = (sourceDetails?.foreignKeys ?? [])
                                    .map((value) => parseForeignKeySummary(value))
                                    .filter((foreignKey): foreignKey is ForeignKeySummary => Boolean(foreignKey))

                                  return sourceForeignKeys
                                    .filter(
                                      (foreignKey) =>
                                        foreignKey.referencedTableName === table.tableName ||
                                        foreignKey.referencedTableName === table.reference ||
                                        foreignKey.referencedTableName.endsWith(`.${table.tableName}`)
                                    )
                                    .map((foreignKey) => ({
                                      ...foreignKey,
                                      sourceTableId: sourceTable.id,
                                    }))
                                })
                                const selectedColumnNames = selectedColumnsByTable[table.id] ?? []
                                const selectedColumnSet = new Set(selectedColumnNames)
                                const usesWildcardColumns =
                                  wildcardColumnTableIds.has(table.id) ||
                                  !Object.prototype.hasOwnProperty.call(selectedColumnsByTable, table.id)

                                return (
                                  <div
                                    key={table.id}
                                    draggable
                                    onDragStart={(event) => handleDragStart(table.id, "canvas", event)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(event) => handleSelectedTableDragOver(event, table.id)}
                                    onDrop={(event) => handleSelectedTableDrop(event, table.id)}
                                    className={cn(
                                      "relative rounded-md border border-white/10 bg-[#0a1321]/90 p-2 shadow-[0_8px_24px_-20px_rgba(0,0,0,0.9)] transition-transform",
                                      isDraggingTable && "cursor-grab active:cursor-grabbing",
                                      dropTarget?.id === table.id && "border-sky-400/40 bg-[#0c1728]"
                                    )}
                                  >
                                    {dropTarget?.id === table.id && dropTarget.position === "before" ? (
                                      <div className="absolute left-3 right-3 top-1 rounded-full border-t-2 border-sky-400/80" />
                                    ) : null}
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 space-y-0.5">
                                        <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-sky-300/80">
                                          <Sparkles className="size-3" />
                                          t{index + 1}
                                        </div>
                                        <div className="truncate text-sm font-semibold text-white">{table.tableName}</div>
                                        <div className="truncate text-xs text-white/45">{table.reference}</div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeSelectedTable(index)}
                                        className="inline-flex size-5 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 text-white/45 transition-colors hover:bg-white/10 hover:text-rose-300"
                                        aria-label={`Remover ${table.tableName}`}
                                      >
                                        <Trash2 className="size-2.5" />
                                      </button>
                                    </div>

                                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          selectOnlyIdColumn(table)
                                        }}
                                        className="rounded-full border border-white/10 bg-white/5 px-1.5 py-px transition-colors hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-sky-100"
                                        title="Selecionar somente a coluna id"
                                      >
                                        {table.columns.length} colunas
                                      </button>
                                      {outgoingForeignKeys.length ? (
                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-px text-emerald-200">
                                          {outgoingForeignKeys.length} FK
                                        </span>
                                      ) : null}
                                      {incomingForeignKeys.length ? (
                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-px text-emerald-200">
                                          {incomingForeignKeys.length} ref
                                        </span>
                                      ) : null}
                                    </div>

                                    {dropTarget?.id === table.id && dropTarget.position === "after" ? (
                                      <div className="absolute inset-x-3 bottom-1 rounded-full border-b-2 border-sky-400/80" />
                                    ) : null}

                                    <Separator className="my-1.5 bg-white/10" />

                                    <div className="space-y-1 text-white/70">
                                      {table.columns.length ? (
                                        <div className="max-h-36 space-y-1 overflow-y-auto pr-1 xl:max-h-44">
                                          {table.columns.map((column) => {
                                            const isSelected = usesWildcardColumns || selectedColumnSet.has(column.name)
                                            const isForeignKeyColumn = outgoingForeignKeyColumnNames.has(
                                              column.name.trim().toLowerCase()
                                            )
                                            const isActiveAnchor =
                                              columnJoinAnchor?.tableId === table.id &&
                                              columnJoinAnchor.columnName === column.name

                                            return (
                                              <div
                                                key={`${table.id}-${column.name}`}
                                                className={cn(
                                                  "flex items-stretch gap-1 rounded border px-1 py-0.5 transition-colors",
                                                  isSelected
                                                    ? "border-sky-400/30 bg-sky-400/10"
                                                    : "border-white/8 bg-white/3"
                                                )}
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() => toggleSelectedColumn(table.id, column.name)}
                                                  className="flex min-w-0 flex-1 items-center justify-between gap-1.5 rounded px-1 py-0.5 text-left"
                                                >
                                                  <span
                                                    className={cn(
                                                      "flex min-w-0 items-center gap-1.5 text-sm",
                                                      isSelected
                                                        ? "text-sky-100"
                                                        : "text-white/80"
                                                    )}
                                                  >
                                                    <span className="truncate">{column.name}</span>
                                                    {isForeignKeyColumn ? (
                                                      <span className="shrink-0 rounded border border-amber-300/30 bg-amber-300/12 px-1 py-px text-[9px] font-semibold leading-none text-amber-100">
                                                        FK
                                                      </span>
                                                    ) : null}
                                                  </span>
                                                  <span
                                                    className={cn(
                                                      "shrink-0 text-[10px]",
                                                      isSelected
                                                        ? "text-sky-200/80"
                                                        : "text-white/35"
                                                    )}
                                                  >
                                                    {column.dataType}
                                                    {column.size ? `(${column.size})` : ""}
                                                  </span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleColumnJoinClick(table.id, column.name)}
                                                  aria-label={
                                                    isActiveAnchor
                                                      ? "Coluna de origem selecionada. Clique em outra coluna para criar o join."
                                                      : "Relacionar coluna. Clique para iniciar ou completar um join manual."
                                                  }
                                                  className={cn(
                                                    "group relative inline-flex size-6 shrink-0 items-center justify-center rounded border transition-colors",
                                                    isActiveAnchor
                                                      ? "border-amber-300/80 bg-amber-300/15 text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.2)]"
                                                      : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                                  )}
                                                >
                                                  <Link2 className="size-3" />
                                                  <span className="pointer-events-none absolute right-0 top-full z-[9999] mt-2 w-52 rounded-lg border border-white/10 bg-[#111827] px-2.5 py-2 text-left text-[11px] normal-case leading-4 tracking-normal text-white/80 opacity-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.9)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                                    {isActiveAnchor
                                                      ? "Origem selecionada. Clique em outra coluna para criar o join."
                                                      : "Criar join manual entre esta coluna e outra coluna."}
                                                  </span>
                                                </button>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      ) : (
                                        <div className="rounded-lg border border-dashed border-white/10 px-2.5 py-3 text-xs text-white/35">
                                          Nenhuma coluna disponível.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="flex h-full min-h-0 w-full items-stretch justify-center rounded-2xl border border-dashed border-white/10 bg-white/2 text-center">
                              <div className="flex h-full w-full max-w-sm flex-col items-center justify-center space-y-3 px-4">
                                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/40">
                                  <Table2 className="size-6" />
                                </div>
                                <div className="text-lg font-medium text-white/85">
                                  Nenhuma tabela adicionada
                                </div>
                                <p className="text-sm leading-6 text-white/50">
                                  Arraste tabelas para este painel ou clique na lista da esquerda para começar.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="sql" className="mt-0 flex h-full min-h-0">
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <Card className="flex min-h-0 flex-col border-white/10 bg-white/4">
                    <CardHeader className="shrink-0 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <CardTitle className="text-base text-white">SQL Editor</CardTitle>
                          <CardDescription className="text-white/50">
                            Revise o comando final antes de executar.
                          </CardDescription>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleExecutePreview}
                          disabled={executingPreview || !canExecutePreview}
                          className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                        >
                          {executingPreview ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                          Executar
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 pt-0">
                      <div className="flex h-full min-h-[clamp(15rem,40dvh,24rem)] flex-col rounded-2xl border border-white/10 bg-[#07111d] p-2 shadow-[0_16px_50px_-34px_rgba(0,0,0,0.95)] sm:p-3">
                        <div className="h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[#050913]">
                          <MonacoEditor
                            value={effectiveSql}
                            onChange={(value) => {
                              setSqlText(value ?? "")
                              setIsManualSql(true)
                            }}
                            defaultLanguage="sql"
                            language="sql"
                            theme="vs-dark"
                            onMount={handleSqlEditorMount}
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
                    </CardContent>
                  </Card>

                  <Card className="flex min-h-0 flex-col border-white/10 bg-white/4">
                    <CardHeader className="shrink-0 pb-3">
                      <CardTitle className="text-base text-white">Resumo</CardTitle>
                      <CardDescription className="text-white/50">
                        Visão rápida do que será criado.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-0">
                      <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/35">
                          View
                        </div>
                        <div className="mt-2 text-sm text-white">{viewName || "nova_view"}</div>
                        <div className="mt-1 text-xs text-white/45">
                          {resolvedSchemaName} · {activeConnection.databaseType.toUpperCase()}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/35">
                          Tabelas selecionadas
                        </div>
                        <div className="mt-3 space-y-2">
                          {selectedTables.length ? (
                            selectedTables.map((table, index) => (
                                <div key={table.id} className="flex items-center justify-between text-sm">
                                <span className="text-white/80">
                                  {table.tableName}
                                  {selectedColumnsByTable[table.id]?.length ? (
                                    <span className="ml-2 text-xs text-emerald-200">
                                      {selectedColumnsByTable[table.id].length} col.
                                    </span>
                                  ) : null}
                                </span>
                                <span className="text-xs text-white/45">t{index + 1}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-white/45">Nenhuma tabela adicionada.</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/3 p-4 text-sm leading-6 text-white/55">
                        {selectedTables.length > 0
                          ? "O SQL abaixo será executado na conexão selecionada quando você clicar em Criar View."
                          : "Adicione tabelas no builder visual ou escreva o SQL manualmente para habilitar a criação."}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="result" className="mt-0 flex h-full min-h-0 overflow-hidden">
                <Card className="flex min-h-0 min-w-0 flex-1 flex-col border-white/10 bg-white/4">
                  <CardHeader className="shrink-0 pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base text-white">Resultado</CardTitle>
                        <CardDescription className="text-white/50">
                          Prévia dos dados retornados pelo SELECT da view.
                        </CardDescription>
                      </div>
                      {previewDurationMs !== null ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/45">
                          {previewDurationMs} ms
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>

                  <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
                    {!hasPreviewExecution ? (
                      <div className="flex h-full min-h-[clamp(18rem,48dvh,28rem)] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#07111d] px-6 text-center text-sm leading-6 text-white/50">
                        Clique em Executar nas abas Selecionar Tabelas ou SQL Editor para visualizar o resultado aqui.
                      </div>
                    ) : executingPreview ? (
                      <div className="flex h-full min-h-[clamp(18rem,48dvh,28rem)] items-center justify-center rounded-2xl border border-white/10 bg-[#07111d] text-sm text-white/55">
                        <Loader2 className="mr-2 size-4 animate-spin text-sky-300" />
                        Executando consulta...
                      </div>
                    ) : previewErrorMessage ? (
                      <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-sm leading-6 text-rose-100">
                        {previewErrorMessage}
                      </div>
                    ) : (
                      <div className="flex h-full min-h-0 min-w-0 max-w-full flex-1 overflow-hidden">
                        <QueryResults result={previewResult} showActions={false} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>

          <div className="shrink-0 border-t border-white/10 px-4 py-3 lg:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-white/45">
                <Code2 className="size-3.5" />
                {effectiveSql.split("\n").length} linhas no editor
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="w-full min-w-56 max-w-xs sm:w-64">
                  <Input
                    value={viewName}
                    onChange={(event) => {
                      setViewName(event.target.value)
                      setIsManualSql(false)
                    }}
                    placeholder="Informe o nome da view"
                    className="h-11 w-full border-white/10 bg-white/5 text-white placeholder:text-white/30"
                  />
                </div>
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
                  onClick={handleCreateView}
                  disabled={saving || !canCreateView}
                  className="bg-linear-to-r from-[#3f7bff] to-[#2457da] text-white shadow-[0_18px_45px_-18px_rgba(59,113,255,0.9)] hover:from-[#4a84ff] hover:to-[#1f4fd0]"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {saving ? (mode === "edit" ? "Salvando..." : "Criando...") : mode === "edit" ? "Salvar View" : "Criar View"}
                </Button>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div className="shrink-0 border-t border-rose-400/20 bg-rose-400/10 px-5 py-3 text-sm text-rose-100 lg:px-6">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function parseForeignKeySummary(value: string): ForeignKeySummary | null {
  const match = value.trim().match(/^(?:(.+?):\s*)?(.+?)\s*->\s*(.+)$/)

  if (!match) {
    return null
  }

  const referencedWithActions = match[3].trim()
  const actionIndex = referencedWithActions.search(/\s+ON\s+(DELETE|UPDATE)\s+/i)
  const referenced = (actionIndex >= 0 ? referencedWithActions.slice(0, actionIndex) : referencedWithActions).trim()
  const actions = actionIndex >= 0 ? referencedWithActions.slice(actionIndex).trim() : ""
  const lastDot = referenced.lastIndexOf(".")
  const deleteMatch = actions.match(/\bON DELETE\s+(.+?)(?=\s+ON UPDATE\s+|$)/i)
  const updateMatch = actions.match(/\bON UPDATE\s+(.+)$/i)

  return {
    constraintName: match[1]?.trim() ?? "",
    sourceColumn: match[2].trim(),
    referencedTableName: lastDot >= 0 ? referenced.slice(0, lastDot).trim() : referenced,
    referencedColumnName: lastDot >= 0 ? referenced.slice(lastDot + 1).trim() : "",
    onDelete: deleteMatch?.[1]?.trim() ?? "",
    onUpdate: updateMatch?.[1]?.trim() ?? "",
  }
}

function shouldAutoFillJoinCondition(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase()
  return !normalized || normalized === "1 = 1"
}

function inferJoinConditionForTable(
  tableIndex: number,
  selectedTables: SelectedTable[],
  tableDetailsById: Record<string, TableDetails | null>,
  databaseType: SavedConnection["databaseType"]
) {
  const currentTable = selectedTables[tableIndex]
  const currentDetails = tableDetailsById[currentTable.id]

  for (let previousIndex = tableIndex - 1; previousIndex >= 0; previousIndex -= 1) {
    const previousTable = selectedTables[previousIndex]
    const previousDetails = tableDetailsById[previousTable.id]

    const currentToPrevious = findForeignKeyRelation(currentTable, currentDetails, previousTable)
    if (currentToPrevious.length) {
      return buildJoinConditionFromForeignKeys(
        previousIndex,
        tableIndex,
        currentToPrevious.map((foreignKey) => ({
          leftColumnName: foreignKey.referencedColumnName,
          rightColumnName: foreignKey.sourceColumn,
        })),
        databaseType
      )
    }

    const previousToCurrent = findForeignKeyRelation(previousTable, previousDetails, currentTable)
    if (previousToCurrent.length) {
      return buildJoinConditionFromForeignKeys(
        previousIndex,
        tableIndex,
        previousToCurrent.map((foreignKey) => ({
          leftColumnName: foreignKey.sourceColumn,
          rightColumnName: foreignKey.referencedColumnName,
        })),
        databaseType
      )
    }
  }

  return ""
}

function findForeignKeyRelation(
  sourceTable: SelectedTable,
  sourceDetails: TableDetails | null | undefined,
  targetTable: SelectedTable
) {
  const matchingForeignKeys = (sourceDetails?.foreignKeys ?? [])
    .map((value) => parseForeignKeySummary(value))
    .filter((foreignKey): foreignKey is ForeignKeySummary => {
      if (!foreignKey) {
        return false
      }

      return (
        Boolean(foreignKey.sourceColumn) &&
        Boolean(foreignKey.referencedColumnName) &&
        tableMatchesReference(targetTable, foreignKey.referencedTableName)
      )
    })

  if (!matchingForeignKeys.length) {
    return []
  }

  const firstConstraintName = matchingForeignKeys[0].constraintName
  if (firstConstraintName) {
    return matchingForeignKeys.filter((foreignKey) => foreignKey.constraintName === firstConstraintName)
  }

  return [matchingForeignKeys[0]]
}

function buildJoinConditionFromForeignKeys(
  leftTableIndex: number,
  rightTableIndex: number,
  columnPairs: Array<{ leftColumnName: string; rightColumnName: string }>,
  databaseType: SavedConnection["databaseType"]
) {
  const leftAlias = getTableAlias(leftTableIndex)
  const rightAlias = getTableAlias(rightTableIndex)

  return columnPairs
    .map(
      (pair) =>
        `${leftAlias}.${quoteIdentifier(databaseType, pair.leftColumnName)} = ${rightAlias}.${quoteIdentifier(
          databaseType,
          pair.rightColumnName
        )}`
    )
    .join(" AND ")
}

function tableMatchesReference(table: SourceTable, referencedTableName: string) {
  const normalizedReference = normalizeIdentifierPath(referencedTableName)

  if (!normalizedReference) {
    return false
  }

  const candidates = [
    table.tableName,
    table.reference,
    `${table.schemaName}.${table.tableName}`,
  ].map((value) => normalizeIdentifierPath(value))

  if (candidates.includes(normalizedReference)) {
    return true
  }

  return !normalizedReference.includes(".") && normalizeIdentifierPath(table.tableName) === normalizedReference
}

function normalizeIdentifierPath(value: string) {
  return value
    .split(".")
    .map((part) => part.trim().replace(/^[`"[]+|[`"\]]+$/g, ""))
    .filter(Boolean)
    .join(".")
    .toLowerCase()
}

function findTableById(groups: Array<{ tables: SourceTable[] }>, tableId: string) {
  for (const group of groups) {
    const table = group.tables.find((item) => item.id === tableId)
    if (table) {
      return table
    }
  }

  return null
}

function buildCatalog(
  connection: SavedConnection,
  database: DatabaseStructureDatabase | null | undefined,
  schemaName: string
) {
  const schemaGroups =
    connection.databaseType === "mysql" || connection.databaseType === "mariadb"
      ? database?.groups ?? []
      : database?.schemas.find((schema) => schema.name === schemaName)?.groups ??
        database?.groups ??
        []

  const tablesGroup = schemaGroups.find((group) => group.label === "Tabelas")
  const tables = tablesGroup?.items ?? []
  const columnsByTable = tablesGroup?.columnsDetailsByItem ?? {}

  return [
    {
      schemaName: schemaName || getFallbackSchemaName(connection),
      label: `Tabelas (${tables.length})`,
      tables: tables.map((tableName) => {
        const reference = getTableReference(
          connection,
          schemaName || getFallbackSchemaName(connection),
          tableName,
          database?.name
        )

        return {
          id: `${schemaName || getFallbackSchemaName(connection)}-${tableName}`,
          schemaName: schemaName || getFallbackSchemaName(connection),
          tableName,
          reference,
          columns:
            columnsByTable[tableName]?.map((column) => ({
              name: column.name,
              dataType: column.dataType,
              size: column.size,
            })) ?? [],
        }
      }),
    },
  ]
}

function buildViewSql(
  connection: SavedConnection,
  databaseName: string | undefined,
  schemaName: string,
  viewName: string,
  selectedTables: SelectedTable[],
  selectedColumnsByTable: Record<string, string[]>,
  filters: ViewFilter[]
) {
  const qualifiedViewName = getViewReference(
    connection,
    schemaName,
    viewName,
    databaseName || connection.databaseName
  )
  const createStatement =
    connection.databaseType === "sqlserver"
      ? `CREATE OR ALTER VIEW ${qualifiedViewName} AS`
      : connection.databaseType === "sqlite"
        ? `CREATE VIEW ${qualifiedViewName} AS`
        : `CREATE OR REPLACE VIEW ${qualifiedViewName} AS`

  if (!selectedTables.length) {
    return `${createStatement}\nSELECT 1 AS example;`
  }

  const hasSelectedColumns = Object.values(selectedColumnsByTable).some((columns) => columns.length > 0)
  const selectList = selectedTables
    .flatMap((table, index) => {
      const alias = getTableAliasForTable(table, index)
      const selectedColumns = selectedColumnsByTable[table.id] ?? []

      if (!hasSelectedColumns || !selectedColumns.length) {
        return [`${alias}.*`]
      }

      return selectedColumns.map((columnName) => {
        const quotedColumnName = quoteIdentifier(connection.databaseType, columnName)
        const resultAlias = quoteIdentifier(connection.databaseType, `${alias}_${columnName}`)
        return `${alias}.${quotedColumnName} AS ${resultAlias}`
      })
    })
    .join(",\n  ")

  const clauses = [
    createStatement,
    "SELECT",
    `  ${selectList}`,
    `FROM ${selectedTables[0].reference}${getTableAliasForTable(selectedTables[0], 0) ? ` ${getTableAliasForTable(selectedTables[0], 0)}` : ""}`,
  ]

  selectedTables.slice(1).forEach((table, index) => {
    const alias = getTableAliasForTable(table, index + 1)
    if (table.joinType === "CROSS JOIN") {
      clauses.push(`CROSS JOIN ${table.reference}${alias ? ` ${alias}` : ""}`)
      return
    }

    clauses.push(
      `${table.joinType} ${table.reference}${alias ? ` ${alias}` : ""} ON ${table.joinCondition.trim() || "1 = 1"}`
    )
  })

  if (filters.length) {
    const filterExpressions = filters
      .map((item, index) => ({
        connector: index === 0 ? null : item.connector ?? "AND",
        expression: item.expression.trim(),
      }))
      .filter((item) => item.expression)
      .map((item) => ({
        connector: item.connector,
        expression: `(${item.expression})`,
      }))

    if (filterExpressions.length) {
      clauses.push(
        `WHERE ${filterExpressions
          .map((item, index) => (index === 0 ? item.expression : `${item.connector} ${item.expression}`))
          .join("\n  ")}`
      )
    }
  }

  clauses.push(";")

  return clauses.join("\n")
}

function getPreviewSqlFromViewSql(sqlText: string) {
  const trimmedSql = sqlText.trim()

  if (!trimmedSql) {
    return ""
  }

  if (/^select\b/i.test(trimmedSql) || /^with\b/i.test(trimmedSql)) {
    return trimmedSql
  }

  const createViewMatch = trimmedSql.match(/\bAS\s+((?:SELECT|WITH)\b[\s\S]*)$/i)
  if (!createViewMatch?.[1]) {
    return trimmedSql
  }

  return createViewMatch[1].trim()
}

function viewNameAlreadyExists(
  database: DatabaseStructureDatabase | null | undefined,
  schemaName: string,
  viewName: string,
  initialView: CreateViewModalProps["initialView"],
  mode: CreateViewModalProps["mode"]
) {
  const normalizedViewName = normalizeObjectName(viewName)

  if (!database || !normalizedViewName) {
    return false
  }

  if (mode === "edit" && normalizeObjectName(initialView?.viewName ?? "") === normalizedViewName) {
    return false
  }

  return getExistingViewNames(database, schemaName).some(
    (existingViewName) => normalizeObjectName(existingViewName) === normalizedViewName
  )
}

function getExistingViewNames(database: DatabaseStructureDatabase, schemaName: string) {
  const schema = database.schemas.find((item) => normalizeObjectName(item.name) === normalizeObjectName(schemaName))
  const groups = schema?.groups ?? database.groups
  const viewsGroup = groups.find((group) => group.label === "Views")

  return viewsGroup?.items ?? []
}

function normalizeObjectName(value: string) {
  return value.trim().replace(/^[`"[]+|[`"\]]+$/g, "").toLowerCase()
}

function parseSelectedTablesFromSql(
  sqlText: string,
  catalogTables: SourceTable[],
  fallbackSchemaName: string
) {
  const normalizedSql = sqlText
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim()

  if (!normalizedSql) {
    return []
  }

  const clauseMatches = findTopLevelTableClauseMatches(normalizedSql)

  const parsedTables: SelectedTable[] = []
  const seenReferences = new Set<string>()

  for (let index = 0; index < clauseMatches.length; index += 1) {
    const match = clauseMatches[index]
    const clauseKind = match.text.toUpperCase()
    const clauseEnd = match.index + match.text.length
    const nextClauseStart = clauseMatches[index + 1]?.index ?? normalizedSql.length
    const clauseText = normalizedSql.slice(clauseEnd, nextClauseStart).trim()

    if (!clauseText) {
      continue
    }

    const joinCondition = getJoinConditionFromClauseText(clauseText, clauseKind)
    const tableReference = getTableReferenceFromClauseText(clauseText)
    const tableAlias = getTableAliasFromClauseText(clauseText, tableReference)

    if (!tableReference) {
      continue
    }

    const normalizedReference = normalizeSqlIdentifier(tableReference)
    if (!normalizedReference || seenReferences.has(`${clauseKind}:${normalizedReference}`)) {
      continue
    }

    seenReferences.add(`${clauseKind}:${normalizedReference}`)

    const catalogTable =
      findCatalogTableByReference(catalogTables, tableReference) ??
      findCatalogTableByReference(catalogTables, stripTrailingAlias(tableReference))

    if (catalogTable) {
      parsedTables.push({
        ...catalogTable,
        joinType: getJoinTypeFromClauseKind(clauseKind),
        joinCondition,
        alias: tableAlias || undefined,
      })
      continue
    }

    const fallbackParts = stripIdentifierQuotes(tableReference)
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean)

    const tableName = fallbackParts.at(-1) || tableReference
    const schemaName = fallbackParts.length > 1 ? fallbackParts.at(-2) || fallbackSchemaName : fallbackSchemaName

    parsedTables.push({
      id: `sql-${parsedTables.length}-${normalizedReference}`,
      schemaName,
      tableName,
      reference: tableReference,
      columns: [],
      joinType: getJoinTypeFromClauseKind(clauseKind),
      joinCondition,
      alias: tableAlias || undefined,
    })
  }

  return parsedTables.length ? parsedTables : null
}

function findTopLevelTableClauseMatches(sqlText: string) {
  const matches: Array<{ index: number; text: string }> = []
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let inBracketQuote = false

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index]
    const prevChar = sqlText[index - 1]

    if (char === "'" && !inDoubleQuote && !inBacktick && !inBracketQuote && prevChar !== "\\") {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote && !inBacktick && !inBracketQuote && prevChar !== "\\") {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (char === "`" && !inSingleQuote && !inDoubleQuote && !inBracketQuote && prevChar !== "\\") {
      inBacktick = !inBacktick
      continue
    }

    if (char === "[" && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      inBracketQuote = true
      continue
    }

    if (char === "]" && inBracketQuote) {
      inBracketQuote = false
      continue
    }

    if (inSingleQuote || inDoubleQuote || inBacktick || inBracketQuote) {
      continue
    }

    if (char === "(") {
      depth += 1
      continue
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (depth !== 0 || !isWordStart(char)) {
      continue
    }

    const { word, end } = readSqlWord(sqlText, index)
    const upperWord = word.toUpperCase()

    if (upperWord === "FROM" || upperWord === "JOIN") {
      matches.push({ index, text: word })
      index = end - 1
      continue
    }

    if (["LEFT", "RIGHT", "INNER", "FULL", "CROSS"].includes(upperWord)) {
      let nextIndex = end
      while (nextIndex < sqlText.length && /\s/.test(sqlText[nextIndex])) {
        nextIndex += 1
      }

      const maybeOuterWord = readSqlWord(sqlText, nextIndex)
      const joinWordStart = maybeOuterWord.word.toUpperCase() === "OUTER" ? maybeOuterWord.end : nextIndex
      const joinWord = readSqlWord(sqlText, joinWordStart)

      if (joinWord.word.toUpperCase() === "JOIN") {
        const clauseText = maybeOuterWord.word.toUpperCase() === "OUTER"
          ? `${word} ${maybeOuterWord.word} ${joinWord.word}`
          : `${word} ${joinWord.word}`
        matches.push({ index, text: clauseText })
        index = joinWord.end - 1
      }
    }
  }

  return matches
}

function parseSelectedColumnsFromSql(
  sqlText: string,
  selectedTables: SelectedTable[]
) {
  const normalizedSql = sqlText
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim()

  if (!normalizedSql || !selectedTables.length) {
    return null
  }

  const selectBody = extractTopLevelSelectBody(normalizedSql)
  if (!selectBody) {
    return null
  }

  const selectItems = splitTopLevelSqlItems(selectBody)
  const nextColumnsByTable: Record<string, string[]> = {}
  const wildcardTableIds = new Set<string>()

  for (const rawItem of selectItems) {
    const item = rawItem.trim()
    if (!item) {
      continue
    }

    const expression = stripSqlSelectAlias(item)
    if (!expression) {
      continue
    }

    if (expression === "*") {
      selectedTables.forEach((table) => {
        wildcardTableIds.add(table.id)
      })
      continue
    }

    const starMatch = expression.match(/^(.+?)\.\*$/)
    if (starMatch) {
      const sourceTable = findSelectedTableBySqlReference(selectedTables, starMatch[1])
      if (sourceTable) {
        wildcardTableIds.add(sourceTable.id)
      }
      continue
    }

    const columnMatch = expression.match(/^(.+?)\.([^\.\s]+)$/)
    if (columnMatch) {
      const sourceTable = findSelectedTableBySqlReference(selectedTables, columnMatch[1])
      if (sourceTable) {
        const columnName = stripIdentifierQuotes(columnMatch[2])
        nextColumnsByTable[sourceTable.id] = [...(nextColumnsByTable[sourceTable.id] ?? []), columnName]
      }
      continue
    }

    if (selectedTables.length === 1 && /^[`"\[\]\w]+$/.test(expression)) {
      const columnName = stripIdentifierQuotes(expression)
      nextColumnsByTable[selectedTables[0].id] = [...(nextColumnsByTable[selectedTables[0].id] ?? []), columnName]
    }
  }

  return {
    columnsByTable: nextColumnsByTable,
    wildcardTableIds,
  }
}

function extractTopLevelSelectBody(sqlText: string) {
  const normalizedSql = sqlText.trim()
  const selectMatch = normalizedSql.match(/\bSELECT\b/i)
  if (!selectMatch || selectMatch.index === undefined) {
    return null
  }

  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let inBracketQuote = false

  for (let index = selectMatch.index + selectMatch[0].length; index < normalizedSql.length; index += 1) {
    const char = normalizedSql[index]
    const prevChar = normalizedSql[index - 1]

    if (char === "'" && !inDoubleQuote && !inBacktick && !inBracketQuote && prevChar !== "\\") {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote && !inBacktick && !inBracketQuote && prevChar !== "\\") {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (char === "`" && !inSingleQuote && !inDoubleQuote && !inBracketQuote && prevChar !== "\\") {
      inBacktick = !inBacktick
      continue
    }

    if (char === "[" && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      inBracketQuote = true
      continue
    }

    if (char === "]" && inBracketQuote) {
      inBracketQuote = false
      continue
    }

    if (inSingleQuote || inDoubleQuote || inBacktick || inBracketQuote) {
      continue
    }

    if (char === "(") {
      depth += 1
      continue
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (depth === 0) {
      const nextWord = readSqlWord(normalizedSql, index)
      if (nextWord.word.toUpperCase() === "FROM") {
        return normalizedSql.slice(selectMatch.index + selectMatch[0].length, index).trim()
      }
    }
  }

  return null
}

function splitTopLevelSqlItems(value: string) {
  const items: string[] = []
  let current = ""
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let inBracketQuote = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const prevChar = value[index - 1]

    if (char === "'" && !inDoubleQuote && !inBacktick && !inBracketQuote && prevChar !== "\\") {
      inSingleQuote = !inSingleQuote
      current += char
      continue
    }

    if (char === '"' && !inSingleQuote && !inBacktick && !inBracketQuote && prevChar !== "\\") {
      inDoubleQuote = !inDoubleQuote
      current += char
      continue
    }

    if (char === "`" && !inSingleQuote && !inDoubleQuote && !inBracketQuote && prevChar !== "\\") {
      inBacktick = !inBacktick
      current += char
      continue
    }

    if (char === "[" && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      inBracketQuote = true
      current += char
      continue
    }

    if (char === "]" && inBracketQuote) {
      inBracketQuote = false
      current += char
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inBracketQuote) {
      if (char === "(") {
        depth += 1
      } else if (char === ")") {
        depth = Math.max(0, depth - 1)
      }

      if (char === "," && depth === 0) {
        const trimmed = current.trim()
        if (trimmed) {
          items.push(trimmed)
        }
        current = ""
        continue
      }
    }

    current += char
  }

  const trimmed = current.trim()
  if (trimmed) {
    items.push(trimmed)
  }

  return items
}

function stripSqlSelectAlias(value: string) {
  const asMatch = value.match(/^(.*?)(?:\s+AS\s+|\s+)([`"\[\]\w]+)$/i)
  if (asMatch) {
    const expression = asMatch[1].trim()
    if (expression && !/\)$/.test(expression)) {
      return expression
    }
  }

  return value.trim()
}

function findSelectedTableBySqlReference(selectedTables: SelectedTable[], reference: string) {
  const normalizedReference = normalizeSqlIdentifier(reference)
  if (!normalizedReference) {
    return null
  }

  return (
    selectedTables.find((table, index) => {
      const candidates = [
        table.tableName,
        table.reference,
        `${table.schemaName}.${table.tableName}`,
        getTableAlias(index),
        table.alias ?? "",
      ]

      return candidates.some((candidate) => normalizeSqlIdentifier(candidate) === normalizedReference)
    }) ?? null
  )
}

function areSelectedColumnSelectionsEqual(
  left: Record<string, string[]>,
  right: Record<string, string[]>
) {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) {
      return false
    }

    const leftColumns = [...new Set(left[key] ?? [])].sort()
    const rightColumns = [...new Set(right[key] ?? [])].sort()

    return leftColumns.length === rightColumns.length && leftColumns.every((column, columnIndex) => column === rightColumns[columnIndex])
  })
}

function areWildcardTableIdsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false
    }
  }

  return true
}

function parseFiltersFromSql(sqlText: string) {
  const normalizedSql = sqlText
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim()

  if (!normalizedSql) {
    return []
  }

  const whereMatch = normalizedSql.match(
    /\bWHERE\b([\s\S]*?)(?=\bGROUP\b|\bORDER\b|\bHAVING\b|\bLIMIT\b|\bOFFSET\b|;|$)/i
  )

  if (!whereMatch) {
    return []
  }

  const expressions = splitSqlFilterExpressions(whereMatch[1])

  return expressions
    .map((item, index) => ({
      connector: index === 0 ? undefined : item.connector,
      expression: stripOuterSqlParens(item.expression.trim()),
    }))
    .filter((item) => item.expression)
    .map((item) => ({
      id: createId(),
      expression: item.expression,
      connector: item.connector,
    }))
}

function splitSqlFilterExpressions(value: string) {
  const parts: Array<{ connector?: FilterConnector; expression: string }> = []
  let current = ""
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let inBracketQuote = false
  let betweenActive = false
  let pendingNot = false
  let currentConnector: FilterConnector | undefined
  let caseDepth = 0

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const prevChar = value[index - 1]

    if (char === "'" && !inDoubleQuote && !inBacktick && prevChar !== "\\") {
      inSingleQuote = !inSingleQuote
      current += char
      continue
    }

    if (char === '"' && !inSingleQuote && !inBacktick && prevChar !== "\\") {
      inDoubleQuote = !inDoubleQuote
      current += char
      continue
    }

    if (char === "`" && !inSingleQuote && !inDoubleQuote && prevChar !== "\\") {
      inBacktick = !inBacktick
      current += char
      continue
    }

    if (char === "[" && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      inBracketQuote = true
      current += char
      continue
    }

    if (char === "]" && inBracketQuote) {
      inBracketQuote = false
      current += char
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inBracketQuote) {
      if (char === "(") {
        depth += 1
      } else if (char === ")") {
        depth = Math.max(0, depth - 1)
      }

      if (depth === 0 && isWordStart(char)) {
        const { word, end } = readSqlWord(value, index)
        const upperWord = word.toUpperCase()

        if (upperWord === "CASE") {
          caseDepth += 1
          current += value.slice(index, end)
          index = end - 1
          pendingNot = false
          continue
        }

        if (upperWord === "END" && caseDepth > 0) {
          caseDepth = Math.max(0, caseDepth - 1)
          current += value.slice(index, end)
          index = end - 1
          pendingNot = false
          continue
        }

        if (caseDepth > 0) {
          current += value.slice(index, end)
          index = end - 1
          pendingNot = false
          continue
        }

        if (upperWord === "NOT") {
          pendingNot = true
          current += value.slice(index, end)
          index = end - 1
          continue
        }

        if (upperWord === "BETWEEN") {
          betweenActive = true
          pendingNot = false
          current += value.slice(index, end)
          index = end - 1
          continue
        }

        if (upperWord === "AND" || upperWord === "OR") {
          if (betweenActive && upperWord === "AND") {
            betweenActive = false
            pendingNot = false
            current += value.slice(index, end)
            index = end - 1
            continue
          }

          if (pendingNot && upperWord === "AND") {
            pendingNot = false
            current += value.slice(index, end)
            index = end - 1
            continue
          }

          const trimmed = current.trim()
          if (trimmed) {
            parts.push({ connector: currentConnector, expression: trimmed })
          }

          current = ""
          currentConnector = upperWord as FilterConnector
          betweenActive = false
          pendingNot = false
          index = end - 1
          continue
        }

        current += value.slice(index, end)
        index = end - 1
        pendingNot = false
        continue
      }
    }

    current += char
  }

  const trimmed = current.trim()
  if (trimmed) {
    parts.push({ connector: currentConnector, expression: trimmed })
  }

  return parts
}

function readSqlWord(value: string, startIndex: number) {
  let end = startIndex

  while (end < value.length && /[A-Za-z0-9_]/.test(value[end])) {
    end += 1
  }

  return {
    word: value.slice(startIndex, end),
    end,
  }
}

function isWordStart(char: string) {
  return /[A-Za-z_]/.test(char)
}

function stripOuterSqlParens(value: string) {
  let expression = value.trim()

  while (expression.startsWith("(") && expression.endsWith(")") && hasBalancedOuterParens(expression)) {
    expression = expression.slice(1, -1).trim()
  }

  return expression
}

function hasBalancedOuterParens(value: string) {
  let depth = 0

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]

    if (char === "(") {
      depth += 1
    } else if (char === ")") {
      depth -= 1
      if (depth === 0 && index < value.length - 1) {
        return false
      }
    }

    if (depth < 0) {
      return false
    }
  }

  return depth === 0
}

function areViewFiltersEqual(left: ViewFilter[], right: ViewFilter[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((filter, index) => {
    const next = right[index]
    return (
      filter.expression === next?.expression &&
      (filter.connector ?? undefined) === (next?.connector ?? undefined)
    )
  })
}

function getTableReferenceFromClauseText(clauseText: string) {
  const segment = normalizeTableClauseSegment(clauseText.replace(/\s+\bON\b[\s\S]*$/i, ""))
  const match = segment.match(/^([^\s;()]+(?:\.[^\s;()]+)*)(?:\s+(?:AS\s+)?([^\s,()]+))?$/i)

  return match?.[1]?.trim() ?? null
}

function getTableAliasFromClauseText(clauseText: string, tableReference: string | null) {
  const segment = normalizeTableClauseSegment(clauseText.replace(/\s+\bON\b[\s\S]*$/i, ""))
  const match = segment.match(/^([^\s;()]+(?:\.[^\s;()]+)*)(?:\s+(?:AS\s+)?([^\s,()]+))?$/i)

  if (!match) {
    return null
  }

  const alias = normalizeSqlIdentifierToken(match[2] ?? "")
  const normalizedReference = normalizeSqlIdentifier(tableReference ?? "")
  const normalizedAlias = normalizeSqlIdentifier(alias)

  if (!normalizedAlias || normalizedAlias === normalizedReference) {
    return null
  }

  return stripIdentifierQuotes(alias)
}

function getJoinConditionFromClauseText(clauseText: string, clauseKind: string) {
  if (clauseKind === "FROM" || clauseKind === "CROSS JOIN") {
    return "1 = 1"
  }

  const onMatch = clauseText.match(/\bON\b\s+([\s\S]+)$/i)
  return normalizeSqlStatementTail(onMatch?.[1] ?? "")
    .replace(/\s+\b(?:WHERE|GROUP|ORDER|HAVING|LIMIT|OFFSET|UNION)\b[\s\S]*$/i, "")
    .trim() || "1 = 1"
}

function normalizeTableClauseSegment(value: string) {
  return normalizeSqlStatementTail(value)
    .replace(/\s+\b(?:WHERE|GROUP|ORDER|HAVING|LIMIT|OFFSET|UNION)\b[\s\S]*$/i, "")
    .trim()
    .replace(/\s+/g, " ")
}

function normalizeSqlStatementTail(value: string) {
  return value.trim().replace(/;+\s*$/, "").trim()
}

function normalizeSqlIdentifierToken(value: string) {
  return normalizeSqlStatementTail(value).replace(/^[`"[]+|[`"\]]+$/g, "")
}

function getJoinTypeFromClauseKind(clauseKind: string): JoinType {
  const normalizedClauseKind = clauseKind.replace(/\s+OUTER\s+/i, " ")

  if (normalizedClauseKind === "CROSS JOIN") {
    return "CROSS JOIN"
  }

  if (normalizedClauseKind === "INNER JOIN") {
    return "INNER JOIN"
  }

  if (normalizedClauseKind === "RIGHT JOIN" || normalizedClauseKind === "FULL JOIN") {
    return "JOIN"
  }

  if (normalizedClauseKind === "LEFT JOIN") {
    return "LEFT JOIN"
  }

  return normalizedClauseKind === "JOIN" ? "JOIN" : "LEFT JOIN"
}

function areSelectedTablesEqual(left: SelectedTable[], right: SelectedTable[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every(
    (table, index) =>
      table.id === right[index]?.id &&
      table.reference === right[index]?.reference &&
      table.joinType === right[index]?.joinType &&
      table.joinCondition === right[index]?.joinCondition &&
      (table.alias ?? "") === (right[index]?.alias ?? "")
  )
}

function findCatalogTableByReference(catalogTables: SourceTable[], reference: string) {
  const normalizedReference = normalizeSqlIdentifier(reference)

  if (!normalizedReference) {
    return null
  }

  return (
    catalogTables.find((table) => {
      const candidates = [table.reference, table.tableName, `${table.schemaName}.${table.tableName}`]
      return candidates.some((candidate) => {
        const normalizedCandidate = normalizeSqlIdentifier(candidate)
        return (
          normalizedCandidate === normalizedReference ||
          normalizedCandidate.endsWith(`.${normalizedReference}`) ||
          normalizedReference.endsWith(`.${normalizedCandidate}`)
        )
      })
    }) ?? null
  )
}

function stripTrailingAlias(reference: string) {
  return reference.trim().replace(/\s+(?:AS\s+)?[^\s,()]+$/i, "")
}

function stripIdentifierQuotes(value: string) {
  return value.replace(/[\[\]"`]/g, "")
}

function normalizeSqlIdentifier(value: string) {
  return stripIdentifierQuotes(value).replace(/\s+/g, "").toLowerCase()
}

function getTableAlias(index: number) {
  return `t${index + 1}`
}

function getTableAliasForTable(table: SelectedTable, index: number) {
  const alias = normalizeSqlIdentifierToken(table.alias ?? "")
  return alias || getTableAlias(index)
}

function getTableReference(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  databaseName?: string
) {
  const normalizedSchema = schemaName.trim()
  const normalizedTable = tableName.trim()
  const normalizedDatabase = databaseName?.trim() ?? ""

  if (!normalizedSchema || !normalizedTable) {
    return normalizedTable || normalizedSchema
  }

  if (connection.databaseType === "sqlite" && normalizedSchema === "main") {
    return quoteIdentifier(connection.databaseType, normalizedTable)
  }

  if (connection.databaseType === "postgresql" && normalizedSchema === "public") {
    return quoteIdentifier(connection.databaseType, normalizedTable)
  }

  if (
    (connection.databaseType === "mysql" || connection.databaseType === "mariadb") &&
    normalizedSchema === connection.databaseName.trim()
  ) {
    return quoteIdentifier(connection.databaseType, normalizedTable)
  }

  if (connection.databaseType === "sqlserver") {
    const qualifiedDatabase = normalizedDatabase
      ? `${quoteIdentifier(connection.databaseType, normalizedDatabase)}.`
      : ""
    return `${qualifiedDatabase}${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
      connection.databaseType,
      normalizedTable
    )}`
  }

  return `${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
    connection.databaseType,
    normalizedTable
  )}`
}

function getViewReference(
  connection: SavedConnection,
  schemaName: string,
  viewName: string,
  databaseName?: string
) {
  const normalizedSchema = schemaName.trim()
  const normalizedView = viewName.trim() || "nova_view"
  const normalizedDatabase = databaseName?.trim() ?? ""

  if (connection.databaseType === "sqlite") {
    return quoteIdentifier(connection.databaseType, normalizedView)
  }

  if (connection.databaseType === "postgresql" && normalizedSchema === "public") {
    return quoteIdentifier(connection.databaseType, normalizedView)
  }

  if (
    (connection.databaseType === "mysql" || connection.databaseType === "mariadb") &&
    normalizedSchema === connection.databaseName.trim()
  ) {
    return quoteIdentifier(connection.databaseType, normalizedView)
  }

  if (connection.databaseType === "sqlserver") {
    const qualifiedDatabase = normalizedDatabase
      ? `${quoteIdentifier(connection.databaseType, normalizedDatabase)}.`
      : ""
    return `${qualifiedDatabase}${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
      connection.databaseType,
      normalizedView
    )}`
  }

  return `${quoteIdentifier(connection.databaseType, normalizedSchema)}.${quoteIdentifier(
    connection.databaseType,
    normalizedView
  )}`
}

function getFallbackSchemaName(connection: SavedConnection) {
  if (connection.databaseType === "sqlite") {
    return "main"
  }

  if (connection.databaseType === "sqlserver") {
    return "dbo"
  }

  return connection.databaseName.trim() || "public"
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
