"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { DragEvent } from "react"
import {
  ArrowRight,
  Code2,
  Filter,
  Loader2,
  Plus,
  Sparkles,
  Table2,
  Trash2,
  Wand2,
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/helpers/utils"
import { quoteIdentifier } from "@/helpers/connections"
import type {
  DatabaseStructureDatabase,
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
  const [columnJoinAnchor, setColumnJoinAnchor] = useState<ColumnJoinAnchor | null>(null)
  const [filters, setFilters] = useState<ViewFilter[]>([])
  const [sqlText, setSqlText] = useState("")
  const [isManualSql, setIsManualSql] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDraggingTable, setIsDraggingTable] = useState(false)
  const [isCanvasDropActive, setIsCanvasDropActive] = useState(false)
  const [draggedTableId, setDraggedTableId] = useState<string | null>(null)
  const [dragSource, setDragSource] = useState<DragSource | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null)
  const [tableDetailsById, setTableDetailsById] = useState<Record<string, TableDetails | null>>({})
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const manualSqlSyncVersionRef = useRef(0)
  const resolvedSchemaName = schemaName?.trim() || (connection ? getFallbackSchemaName(connection) : "public")
  const catalog = useMemo(
    () => (connection ? buildCatalog(connection, database, resolvedSchemaName) : []),
    [connection, database, resolvedSchemaName]
  )
  const catalogTables = catalog.flatMap((group) => group.tables)

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
          ? parseSelectedColumnsFromSql(initialSql, parsedTables, catalogTables)
          : null
      const parsedFilters = initialSql ? parseFiltersFromSql(initialSql) : []

      setViewName(mode === "edit" ? initialView?.viewName || "nova_view" : "nova_view")
      setSearchTerm("")
      setSelectedTables(parsedTables)
      setSelectedColumnsByTable(parsedColumns ?? {})
      setColumnJoinAnchor(null)
      setFilters(parsedFilters ?? [])
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
    const parsedColumns = parsedTables
      ? parseSelectedColumnsFromSql(sqlText, parsedTables, catalogTables)
      : null
    const parsedFilters = parseFiltersFromSql(sqlText)
    const normalizedSql = sqlText.trim()

    queueMicrotask(() => {
      if (manualSqlSyncVersionRef.current !== syncVersion) {
        return
      }

      if (!normalizedSql) {
        setSelectedTables([])
        setSelectedColumnsByTable({})
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
          if (areSelectedColumnSelectionsEqual(current, parsedColumns)) {
            return current
          }

          return parsedColumns
        })
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
  }, [open, connection, isManualSql, sqlText, catalogTables, resolvedSchemaName])

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
        viewName || "nova_view",
        selectedTables,
        selectedColumnsByTable,
        filters
      )
    : ""
  const effectiveSql = isManualSql ? sqlText : generatedSql
  const canCreateView = Boolean(effectiveSql.trim()) && (isManualSql || selectedTables.length > 0)
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
    setSelectedColumnsByTable((current) => {
      const next = { ...current }
      const currentColumns = new Set(next[tableId] ?? [])

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

  function syncGeneratedSql() {
    exitManualSqlMode()
    setSqlText(generatedSql)
  }

  function formatSqlText() {
    setSqlText((current) => current.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim())
    setIsManualSql(true)
  }

  async function handleCreateView() {
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
        className="h-[calc(100dvh-0.75rem)] overflow-hidden border-t border-white/10 bg-[#050a14] p-0 text-white shadow-[0_-36px_90px_-45px_rgba(0,0,0,0.95)]"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-white/10 px-5 py-4 lg:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
                    <Sparkles className="size-5" />
                  </div>
                  <div>
                    <div className="text-xl font-semibold text-white">{dialogTitle}</div>
                    <div className="text-sm text-white/55">{dialogDescription}</div>
                  </div>
                </div>
                <div className="w-full max-w-xs space-y-2">
                  <Label className="text-xs uppercase tracking-[0.2em] text-white/35">
                    Nome da view
                  </Label>
                  <Input
                    value={viewName}
                    onChange={(event) => {
                      setViewName(event.target.value)
                      setIsManualSql(false)
                    }}
                    placeholder="nova_view"
                    className="h-11 w-full border-white/10 bg-white/5 text-white placeholder:text-white/30"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-white/45 xl:pt-7 mt-6">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {activeConnection.connectionName}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {activeConnection.databaseType.toUpperCase()}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {resolvedSchemaName}
                </span>
              </div>
            </div>
          </div>

          <Tabs defaultValue="builder" className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-white/10 px-5 lg:px-6">
              <TabsList className="h-auto rounded-none border-0 bg-transparent p-0">
                <TabsTrigger value="builder" className="h-11 rounded-none px-5">
                  Selecionar Tabelas
                </TabsTrigger>
                <TabsTrigger value="sql" className="h-11 rounded-none px-5">
                  SQL Editor
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-5 lg:px-6">
              <TabsContent
                value="builder"
                className="mt-0 flex h-full min-h-0 overflow-y-auto xl:overflow-hidden"
              >
                <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[380px_420px_minmax(0,1fr)]">
                  <div className="flex min-h-0 flex-col gap-4">
                    <Card className="flex min-h-72 flex-1 flex-col border-white/10 bg-white/4">
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

                  <div className="flex min-h-0 flex-col gap-4">
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

                    <Card className="flex h-64 shrink-0 flex-col border-white/10 bg-white/4">
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

                  <Card className="flex h-full min-h-0 flex-col border-white/10 bg-white/4">
                    <CardHeader className="shrink-0 pb-3">
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
                          onClick={syncGeneratedSql}
                          className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                        >
                          <Wand2 className="size-4" />
                          Gerar SQL
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="min-h-0 flex-1 pt-0">
                      <div
                        onDragOver={handleCanvasDragOver}
                        onDragLeave={handleCanvasDragLeave}
                        onDrop={handleCanvasDrop}
                        className={cn(
                          "relative h-full min-h-[clamp(16rem,36dvh,30rem)] overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_40%),linear-gradient(180deg,rgba(6,11,20,0.96),rgba(4,8,14,0.96))] p-3 transition-colors",
                          isCanvasDropActive
                            ? "border-sky-400/40 shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_18px_60px_-30px_rgba(56,189,248,0.35)]"
                          : "border-white/10",
                          draggedTableId && !isCanvasDropActive ? "border-white/15" : ""
                        )}
                        ref={canvasRef}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] bg-size-[20px_20px]" />
                        {columnJoinAnchor ? (
                          <div className="absolute left-3 top-3 z-20 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-[11px] text-sky-100 shadow-[0_10px_20px_-16px_rgba(56,189,248,0.7)]">
                            Selecionando join:{" "}
                            {selectedTables.find((table) => table.id === columnJoinAnchor.tableId)?.tableName ??
                              columnJoinAnchor.tableId}
                            .{columnJoinAnchor.columnName}
                          </div>
                        ) : null}
                        <div className="relative flex h-full min-h-0 items-stretch justify-stretch">
                          {selectedTables.length ? (
                            <div className="relative z-10 grid w-full gap-2 self-start sm:grid-cols-2 2xl:grid-cols-3">
                              {selectedTables.map((table, index) => {
                                const tableDetails = tableDetailsById[table.id]
                                const outgoingForeignKeys = (tableDetails?.foreignKeys ?? [])
                                  .map((value) => parseForeignKeySummary(value))
                                  .filter((foreignKey): foreignKey is ForeignKeySummary => Boolean(foreignKey))
                                const outgoingForeignKeyColumns = new Set(
                                  outgoingForeignKeys.map((foreignKey) => foreignKey.sourceColumn)
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
                                const incomingForeignKeyColumns = new Set(
                                  incomingForeignKeys.map((foreignKey) => foreignKey.referencedColumnName)
                                )
                                const selectedColumnNames = selectedColumnsByTable[table.id] ?? []
                                const selectedColumnSet = new Set(selectedColumnNames)
                                const relatedColumnNames = new Set([
                                  ...outgoingForeignKeyColumns,
                                  ...incomingForeignKeyColumns,
                                ])

                                return (
                                  <div
                                    key={table.id}
                                    draggable
                                    onDragStart={(event) => handleDragStart(table.id, "canvas", event)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(event) => handleSelectedTableDragOver(event, table.id)}
                                    onDrop={(event) => handleSelectedTableDrop(event, table.id)}
                                    className={cn(
                                      "relative rounded-xl border border-white/10 bg-[#0a1321]/90 p-3 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.9)] transition-transform",
                                      index === 0 && "sm:col-span-2 2xl:col-span-1",
                                      isDraggingTable && "cursor-grab active:cursor-grabbing",
                                      dropTarget?.id === table.id && "border-sky-400/40 bg-[#0c1728]"
                                    )}
                                  >
                                    {dropTarget?.id === table.id && dropTarget.position === "before" ? (
                                      <div className="absolute left-3 right-3 top-1 rounded-full border-t-2 border-sky-400/80" />
                                    ) : null}
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-sky-300/80">
                                          <Sparkles className="size-3" />
                                          t{index + 1}
                                        </div>
                                        <div className="text-base font-semibold text-white">{table.tableName}</div>
                                        <div className="text-xs text-white/45">{table.reference}</div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeSelectedTable(index)}
                                        className="inline-flex size-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/45 transition-colors hover:bg-white/10 hover:text-rose-300"
                                        aria-label={`Remover ${table.tableName}`}
                                      >
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
                                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                                        {table.columns.length} colunas
                                      </span>
                                      {outgoingForeignKeys.length ? (
                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
                                          {outgoingForeignKeys.length} FK
                                        </span>
                                      ) : null}
                                      {incomingForeignKeys.length ? (
                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
                                          {incomingForeignKeys.length} ref
                                        </span>
                                      ) : null}
                                    </div>

                                    {dropTarget?.id === table.id && dropTarget.position === "after" ? (
                                      <div className="absolute inset-x-3 bottom-1 rounded-full border-b-2 border-sky-400/80" />
                                    ) : null}

                                    <Separator className="my-3 bg-white/10" />

                                    <div className="space-y-2 text-sm text-white/70">
                                      {table.columns.length ? (
                                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                                          {table.columns.map((column) => {
                                            const isSelected = selectedColumnSet.has(column.name)
                                            const isRelated = relatedColumnNames.has(column.name)
                                            const isActiveAnchor =
                                              columnJoinAnchor?.tableId === table.id &&
                                              columnJoinAnchor.columnName === column.name

                                            return (
                                              <div
                                                key={`${table.id}-${column.name}`}
                                                className={cn(
                                                  "flex items-stretch gap-2 rounded-lg border p-1.5 transition-colors",
                                                  isSelected
                                                    ? "border-sky-400/30 bg-sky-400/10"
                                                    : isRelated
                                                      ? "border-emerald-400/25 bg-emerald-400/10"
                                                      : "border-white/8 bg-white/3"
                                                )}
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() => toggleSelectedColumn(table.id, column.name)}
                                                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 py-1 text-left"
                                                >
                                                  <span
                                                    className={cn(
                                                      "truncate text-sm",
                                                      isSelected
                                                        ? "text-sky-100"
                                                        : isRelated
                                                          ? "text-emerald-100"
                                                          : "text-white/80"
                                                    )}
                                                  >
                                                    {column.name}
                                                  </span>
                                                  <span
                                                    className={cn(
                                                      "shrink-0 text-[11px]",
                                                      isSelected
                                                        ? "text-sky-200/80"
                                                        : isRelated
                                                          ? "text-emerald-200/80"
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
                                                  className={cn(
                                                    "inline-flex min-w-20 items-center justify-center rounded-md border px-2 text-[11px] uppercase tracking-[0.14em] transition-colors",
                                                    isActiveAnchor
                                                      ? "border-sky-400/30 bg-sky-400/15 text-sky-100"
                                                      : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                                  )}
                                                >
                                                  {isActiveAnchor ? "Âncora" : "Ligar"}
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
                <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <Card className="flex min-h-0 flex-col border-white/10 bg-white/4">
                    <CardHeader className="shrink-0 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <CardTitle className="text-base text-white">SQL Editor</CardTitle>
                          <CardDescription className="text-white/50">
                            Revise o comando final antes de executar.
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={syncGeneratedSql}
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                          >
                            <Wand2 className="size-4" />
                            Gerar SQL
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={formatSqlText}
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                          >
                            <Code2 className="size-4" />
                            Formatar
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 pt-0">
                      <div className="flex h-full min-h-112 flex-col rounded-2xl border border-white/10 bg-[#02050c]">
                        <Textarea
                          value={effectiveSql}
                          onChange={(event) => {
                            setSqlText(event.target.value)
                            setIsManualSql(true)
                          }}
                          className="min-h-112 flex-1 resize-none rounded-2xl border-0 bg-transparent p-4 font-mono text-sm leading-6 text-white/80 placeholder:text-white/25 focus-visible:ring-0"
                          placeholder="-- O SQL da view será gerado aqui"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/40">
                        <span className="flex items-center gap-2">
                          <ArrowRight className="size-3.5" />
                          {isManualSql ? "Edição manual ativa" : "Sincronizado com o builder visual"}
                        </span>
                        <span>{effectiveSql.split("\n").length} linhas</span>
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
            </div>
          </Tabs>

          <div className="shrink-0 border-t border-white/10 px-5 py-4 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-white/45">
                <Code2 className="size-3.5" />
                {effectiveSql.split("\n").length} linhas no editor
              </div>

              <div className="flex flex-wrap gap-3">
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
  selectedTables: SelectedTable[],
  catalogTables: SourceTable[]
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
  let matchedAnyColumn = false

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
        const catalogTable = findCatalogTableByReference(catalogTables, table.reference)
        const columnNames = catalogTable?.columns.map((column) => column.name) ?? []
        if (columnNames.length) {
          nextColumnsByTable[table.id] = columnNames
          matchedAnyColumn = true
        }
      })
      continue
    }

    const starMatch = expression.match(/^(.+?)\.\*$/)
    if (starMatch) {
      const sourceTable = findSelectedTableBySqlReference(selectedTables, starMatch[1])
      if (sourceTable) {
        const catalogTable = findCatalogTableByReference(catalogTables, sourceTable.reference)
        const columnNames = catalogTable?.columns.map((column) => column.name) ?? []
        if (columnNames.length) {
          nextColumnsByTable[sourceTable.id] = columnNames
          matchedAnyColumn = true
        }
      }
      continue
    }

    const columnMatch = expression.match(/^(.+?)\.([^\.\s]+)$/)
    if (columnMatch) {
      const sourceTable = findSelectedTableBySqlReference(selectedTables, columnMatch[1])
      if (sourceTable) {
        const columnName = stripIdentifierQuotes(columnMatch[2])
        nextColumnsByTable[sourceTable.id] = [...(nextColumnsByTable[sourceTable.id] ?? []), columnName]
        matchedAnyColumn = true
      }
      continue
    }

    if (selectedTables.length === 1 && /^[`"\[\]\w]+$/.test(expression)) {
      const columnName = stripIdentifierQuotes(expression)
      nextColumnsByTable[selectedTables[0].id] = [...(nextColumnsByTable[selectedTables[0].id] ?? []), columnName]
      matchedAnyColumn = true
    }
  }

  if (!matchedAnyColumn) {
    return null
  }

  return nextColumnsByTable
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
  const segment = clauseText.replace(/\s+\bON\b[\s\S]*$/i, "").trim()
  const match = segment.match(/^([^\s;()]+(?:\.[^\s;()]+)*)(?:\s+(?:AS\s+)?([^\s,()]+))?$/i)

  return match?.[1]?.trim() ?? null
}

function getTableAliasFromClauseText(clauseText: string, tableReference: string | null) {
  const segment = clauseText.replace(/\s+\bON\b[\s\S]*$/i, "").trim()
  const match = segment.match(/^([^\s;()]+(?:\.[^\s;()]+)*)(?:\s+(?:AS\s+)?([^\s,()]+))?$/i)

  if (!match) {
    return null
  }

  const alias = match[2]?.trim() ?? ""
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
  return onMatch?.[1]?.trim() || "1 = 1"
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
  const alias = table.alias?.trim()
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
