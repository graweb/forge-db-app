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
import type { CreateViewModalProps } from "@/types/dashboard-modals"

type TableColumnPreview = {
  name: string
  dataType: string
  size: string
}

type SourceTable = {
  id: string
  schemaName: string
  tableName: string
  reference: string
  columns: TableColumnPreview[]
}

type JoinType = "LEFT JOIN" | "INNER JOIN" | "JOIN" | "CROSS JOIN"

type SelectedTable = SourceTable & {
  joinType: JoinType
  joinCondition: string
}

type ViewFilter = {
  id: string
  expression: string
}

type DragSource = "palette" | "canvas"
type DropPosition = "before" | "after"

type JoinLine = {
  id: string
  d: string
  label: string
  labelX: number
  labelY: number
}

type ForeignKeySummary = {
  constraintName: string
  sourceColumn: string
  referencedTableName: string
  referencedColumnName: string
  onDelete: string
  onUpdate: string
}

const JOIN_OPTIONS: Array<{ value: JoinType; label: string }> = [
  { value: "LEFT JOIN", label: "LEFT JOIN" },
  { value: "INNER JOIN", label: "INNER JOIN" },
  { value: "JOIN", label: "JOIN" },
  { value: "CROSS JOIN", label: "CROSS JOIN" },
]

export function CreateViewModal({
  open,
  connection,
  database,
  databaseName,
  schemaName,
  onOpenChange,
  onSaved,
}: CreateViewModalProps) {
  const [viewName, setViewName] = useState("nova_view")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTables, setSelectedTables] = useState<SelectedTable[]>([])
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
  const [joinLines, setJoinLines] = useState<JoinLine[]>([])
  const [tableDetailsById, setTableDetailsById] = useState<Record<string, TableDetails | null>>({})
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const tableCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const resolvedSchemaName = schemaName?.trim() || (connection ? getFallbackSchemaName(connection) : "public")

  useEffect(() => {
    if (!open || !connection) {
      return
    }

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setViewName("nova_view")
      setSearchTerm("")
      setSelectedTables([])
      setFilters([])
      setErrorMessage(null)
      setSaving(false)
      setIsManualSql(false)
      setIsDraggingTable(false)
      setIsCanvasDropActive(false)
      setDraggedTableId(null)
      setDragSource(null)
      setDropTarget(null)
      setJoinLines([])
      setTableDetailsById({})
      setSqlText(buildViewSql(connection, databaseName, resolvedSchemaName, "nova_view", [], []))
    })

    return () => {
      cancelled = true
    }
  }, [open, connection?.id, databaseName, resolvedSchemaName, connection])

  useEffect(() => {
    if (!open || !connection || isManualSql) {
      return
    }

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setSqlText(
        buildViewSql(connection, databaseName, resolvedSchemaName, viewName || "nova_view", selectedTables, filters)
      )
    })

    return () => {
      cancelled = true
    }
  }, [open, connection, databaseName, resolvedSchemaName, viewName, selectedTables, filters, isManualSql])

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
    if (!open || !connection) {
      queueMicrotask(() => {
        setJoinLines([])
      })
      return
    }

    const updateJoinLines = () => {
      const canvasElement = canvasRef.current
      if (!canvasElement || selectedTables.length < 2) {
        queueMicrotask(() => {
          setJoinLines([])
        })
        return
      }

      const canvasRect = canvasElement.getBoundingClientRect()
      const nextLines: JoinLine[] = []
      const parsedForeignKeys = selectedTables.flatMap((table) => {
        const tableDetails = tableDetailsById[table.id]
        const foreignKeys = tableDetails?.foreignKeys ?? []

        return foreignKeys
          .map((value) => parseForeignKeySummary(value))
          .filter((foreignKey): foreignKey is ForeignKeySummary => Boolean(foreignKey))
          .map((foreignKey, index) => ({
            ...foreignKey,
            sourceTableId: table.id,
            sourceTableName: table.tableName,
            sourceIndex: index,
          }))
      })

      for (const foreignKey of parsedForeignKeys) {
        const sourceCard = tableCardRefs.current[foreignKey.sourceTableId]
        const targetTable = selectedTables.find((table) => table.tableName === foreignKey.referencedTableName)
        if (!targetTable) {
          continue
        }

        const targetCard = tableCardRefs.current[targetTable.id]

        if (!sourceCard || !targetCard) {
          continue
        }

        const fromRect = sourceCard.getBoundingClientRect()
        const toRect = targetCard.getBoundingClientRect()

        const startX = fromRect.left - canvasRect.left + fromRect.width
        const startY = fromRect.top - canvasRect.top + fromRect.height / 2
        const endX = toRect.left - canvasRect.left
        const endY = toRect.top - canvasRect.top + toRect.height / 2
        const curveOffset = Math.max(72, Math.abs(endX - startX) * 0.45)
        const control1X = startX + curveOffset
        const control2X = endX - curveOffset

        nextLines.push({
          id: `${foreignKey.sourceTableId}->${targetTable.id}:${foreignKey.sourceColumn}:${foreignKey.referencedColumnName}`,
          d: `M ${startX} ${startY} C ${control1X} ${startY}, ${control2X} ${endY}, ${endX} ${endY}`,
          label: `${foreignKey.sourceColumn} → ${foreignKey.referencedColumnName}`,
          labelX: (startX + endX) / 2,
          labelY: (startY + endY) / 2 - 16,
        })
      }

      setJoinLines(nextLines)
    }

    const raf = window.requestAnimationFrame(updateJoinLines)
    const observer = new ResizeObserver(() => updateJoinLines())

    if (canvasRef.current) {
      observer.observe(canvasRef.current)
    }

    window.addEventListener("resize", updateJoinLines)

    return () => {
      window.cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener("resize", updateJoinLines)
    }
  }, [open, connection, selectedTables, tableDetailsById, isCanvasDropActive, dropTarget, draggedTableId])

  const catalog = useMemo(
    () => (connection ? buildCatalog(connection, database, resolvedSchemaName) : []),
    [connection, database, resolvedSchemaName]
  )
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
        filters
      )
    : ""
  const effectiveSql = isManualSql ? sqlText : generatedSql
  const canCreateView = Boolean(effectiveSql.trim()) && (isManualSql || selectedTables.length > 0)

  if (!connection) {
    return null
  }

  function addTable(table: SourceTable) {
    setErrorMessage(null)
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

  function insertSelectedTable(table: SourceTable, index: number) {
    setErrorMessage(null)
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

  function setTableCardRef(tableId: string, element: HTMLDivElement | null) {
    tableCardRefs.current[tableId] = element
  }

  function toggleTable(table: SourceTable) {
    setErrorMessage(null)
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
    setSelectedTables((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    )
  }

  function removeSelectedTable(index: number) {
    setErrorMessage(null)
    setSelectedTables((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function addFilter() {
    setErrorMessage(null)
    setFilters((current) => [
      ...current,
      {
        id: createId(),
        expression: "",
      },
    ])
  }

  function updateFilter(index: number, value: string) {
    setErrorMessage(null)
    setFilters((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, expression: value } : item))
    )
  }

  function removeFilter(index: number) {
    setErrorMessage(null)
    setFilters((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function syncGeneratedSql() {
    setIsManualSql(false)
    setSqlText(generatedSql)
  }

  function formatSqlText() {
    setSqlText((current) => current.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim())
    setIsManualSql(true)
  }

  async function handleCreateView() {
    if (!connection) {
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
          sql: effectiveSql,
          databaseName: databaseName || connection.databaseName,
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
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
                    <Sparkles className="size-5" />
                  </div>
                  <div>
                    <div className="text-xl font-semibold text-white">Nova View</div>
                    <div className="text-sm text-white/55">
                      Selecione tabelas, ajuste os joins e valide o SQL antes de criar.
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    {connection.connectionName}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    {connection.databaseType.toUpperCase()}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    {resolvedSchemaName}
                  </span>
                </div>
              </div>

              <div className="w-full max-w-xs space-y-2 xl:pt-1">
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
                  className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/30"
                />
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
                <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[350px_380px_minmax(0,1fr)]">
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

                    <Card className="flex shrink-0 flex-col border-white/10 bg-white/4 xl:min-h-56">
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
                              <Input
                                value={filter.expression}
                                onChange={(event) => updateFilter(index, event.target.value)}
                                placeholder="status = 'ativo'"
                                className="h-10 border-white/10 bg-white/5 text-white placeholder:text-white/30"
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
                          <CardTitle className="text-base text-white">Tabelas selecionadas</CardTitle>
                          <CardDescription className="text-white/50">
                            Veja as tabelas adicionadas e as relações de FK entre elas.
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
                          "relative h-full min-h-[clamp(16rem,36dvh,30rem)] overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_40%),linear-gradient(180deg,rgba(6,11,20,0.96),rgba(4,8,14,0.96))] p-4 transition-colors",
                          isCanvasDropActive
                            ? "border-sky-400/40 shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_18px_60px_-30px_rgba(56,189,248,0.35)]"
                          : "border-white/10",
                          draggedTableId && !isCanvasDropActive ? "border-white/15" : ""
                        )}
                        ref={canvasRef}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] bg-size-[20px_20px]" />
                        {joinLines.length ? (
                          <svg
                            className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
                            aria-hidden="true"
                          >
                            <defs>
                              <marker
                                id="view-join-arrow"
                                markerWidth="8"
                                markerHeight="8"
                                refX="6"
                                refY="4"
                                orient="auto"
                                markerUnits="strokeWidth"
                              >
                                <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(56,189,248,0.95)" />
                              </marker>
                            </defs>
                            {joinLines.map((line) => (
                              <g key={line.id}>
                                <path
                                  d={line.d}
                                  fill="none"
                                  stroke="rgba(56,189,248,0.72)"
                                  strokeWidth="2.5"
                                  strokeDasharray="7 7"
                                  markerEnd="url(#view-join-arrow)"
                                />
                                <g transform={`translate(${line.labelX} ${line.labelY})`}>
                                  <rect
                                    x="-42"
                                    y="-12"
                                    width="84"
                                    height="24"
                                    rx="999"
                                    fill="rgba(8,15,26,0.95)"
                                    stroke="rgba(56,189,248,0.2)"
                                  />
                                  <text
                                    x="0"
                                    y="4"
                                    fill="rgba(226,232,240,0.95)"
                                    fontSize="10"
                                    textAnchor="middle"
                                    style={{ fontFamily: "Arial, Helvetica, sans-serif", letterSpacing: "0.12em" }}
                                  >
                                    {line.label}
                                  </text>
                                </g>
                              </g>
                            ))}
                          </svg>
                        ) : null}
                        <div className="relative flex h-full min-h-[clamp(16rem,36dvh,30rem)] items-center justify-center">
                          {selectedTables.length ? (
                            <div className="relative z-10 grid w-full gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                              {selectedTables.map((table, index) => {
                                const tableDetails = tableDetailsById[table.id]
                                const outgoingForeignKeys = (tableDetails?.foreignKeys ?? [])
                                  .map((value) => parseForeignKeySummary(value))
                                  .filter((foreignKey): foreignKey is ForeignKeySummary => Boolean(foreignKey))
                                const incomingCount = selectedTables.reduce((count, sourceTable) => {
                                  const sourceDetails = tableDetailsById[sourceTable.id]
                                  const sourceForeignKeys = (sourceDetails?.foreignKeys ?? [])
                                    .map((value) => parseForeignKeySummary(value))
                                    .filter((foreignKey): foreignKey is ForeignKeySummary => Boolean(foreignKey))

                                  return (
                                    count +
                                    sourceForeignKeys.filter(
                                      (foreignKey) => foreignKey.referencedTableName === table.tableName
                                    ).length
                                  )
                                }, 0)

                                return (
                                  <div
                                    key={table.id}
                                    draggable
                                    onDragStart={(event) => handleDragStart(table.id, "canvas", event)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(event) => handleSelectedTableDragOver(event, table.id)}
                                    onDrop={(event) => handleSelectedTableDrop(event, table.id)}
                                    ref={(element) => setTableCardRef(table.id, element)}
                                    className={cn(
                                      "relative rounded-2xl border border-white/10 bg-[#0a1321]/90 p-4 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.9)] transition-transform",
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
                                          <Sparkles className="size-3.5" />
                                          t{index + 1}
                                        </div>
                                        <div className="text-lg font-semibold text-white">{table.tableName}</div>
                                        <div className="text-xs text-white/45">{table.reference}</div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeSelectedTable(index)}
                                        className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/45 transition-colors hover:bg-white/10 hover:text-rose-300"
                                        aria-label={`Remover ${table.tableName}`}
                                      >
                                        <Trash2 className="size-4" />
                                      </button>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
                                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                                        {table.columns.length} colunas
                                      </span>
                                      {outgoingForeignKeys.length ? (
                                        <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-sky-200">
                                          {outgoingForeignKeys.length} FK
                                        </span>
                                      ) : null}
                                      {incomingCount ? (
                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                                          {incomingCount} ref
                                        </span>
                                      ) : null}
                                    </div>

                                    {outgoingForeignKeys.length ? (
                                      <div className="mt-3 space-y-1.5">
                                        {outgoingForeignKeys.slice(0, 3).map((foreignKey) => (
                                          <div
                                            key={`${table.id}-${foreignKey.sourceColumn}-${foreignKey.referencedTableName}-${foreignKey.referencedColumnName}`}
                                            className="rounded-xl border border-sky-400/15 bg-sky-400/8 px-3 py-2 text-xs leading-5 text-sky-50/85"
                                          >
                                            <span className="font-medium text-sky-200">{foreignKey.sourceColumn}</span>
                                            <span className="text-white/45"> → </span>
                                            <span className="font-medium text-white/80">
                                              {foreignKey.referencedTableName}.{foreignKey.referencedColumnName}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}

                                    {dropTarget?.id === table.id && dropTarget.position === "after" ? (
                                      <div className="absolute inset-x-3 bottom-1 rounded-full border-b-2 border-sky-400/80" />
                                    ) : null}

                                    <Separator className="my-4 bg-white/10" />

                                    <div className="space-y-3 text-sm text-white/70">
                                      {table.columns.slice(0, 4).map((column) => (
                                        <div
                                          key={`${table.id}-${column.name}`}
                                          className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2"
                                        >
                                          <span className="truncate text-white/80">{column.name}</span>
                                          <span className="ml-3 shrink-0 text-xs text-white/35">
                                            {column.dataType}
                                            {column.size ? `(${column.size})` : ""}
                                          </span>
                                        </div>
                                      ))}
                                      {!table.columns.length ? (
                                        <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-white/35">
                                          Nenhuma coluna disponível.
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="flex min-h-[clamp(16rem,36dvh,30rem)] w-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/2 text-center">
                              <div className="max-w-sm space-y-3 px-4">
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
                <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
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
                          {resolvedSchemaName} · {connection.databaseType.toUpperCase()}
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
                                <span className="text-white/80">{table.tableName}</span>
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
                  {saving ? "Criando..." : "Criar View"}
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

  const selectList = selectedTables
    .map((_, index) => `${getTableAlias(index)}.*`)
    .join(",\n  ")

  const clauses = [
    createStatement,
    "SELECT",
    `  ${selectList}`,
    `FROM ${selectedTables[0].reference} ${getTableAlias(0)}`,
  ]

  selectedTables.slice(1).forEach((table, index) => {
    const alias = getTableAlias(index + 1)
    if (table.joinType === "CROSS JOIN") {
      clauses.push(`CROSS JOIN ${table.reference} ${alias}`)
      return
    }

    clauses.push(`${table.joinType} ${table.reference} ${alias} ON ${table.joinCondition.trim() || "1 = 1"}`)
  })

  if (filters.length) {
    const filterExpressions = filters
      .map((item) => item.expression.trim())
      .filter(Boolean)
      .map((expression) => `(${expression})`)

    if (filterExpressions.length) {
      clauses.push(`WHERE ${filterExpressions.join("\n  AND ")}`)
    }
  }

  clauses.push(";")

  return clauses.join("\n")
}

function getTableAlias(index: number) {
  return `t${index + 1}`
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
