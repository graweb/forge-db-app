"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Edit,
  GripVertical,
  Plus,
  Trash,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { QueryExecutionResult, SerializedValue } from "@/types/connections"
import type { QueryResultsProps, ResizeState, SortDirection, SortState } from "@/types/dashboard-editor"

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 50]
const MIN_COLUMN_WIDTH = 96
const BODY_FONT = "400 14px Arial, Helvetica, sans-serif"
const HEADER_FONT = "500 14px Arial, Helvetica, sans-serif"

let measurementCanvas: HTMLCanvasElement | null = null

export function QueryResults({ result }: QueryResultsProps) {
  const [sort, setSort] = useState<SortState | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<ResizeState | null>(null)

  const columns = useMemo(() => {
    if (!result) {
      return []
    }

    if (result.columns.length) {
      return result.columns
    }

    return Object.keys(result.rows[0] ?? {})
  }, [result])

  const sortedRows = useMemo(() => {
    if (!result?.rows.length) {
      return []
    }

    const rows = [...result.rows]

    if (!sort) {
      return rows
    }

    return rows.sort((left, right) => compareValues(left[sort.column], right[sort.column], sort.direction))
  }, [result, sort])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const safePage = Math.min(page, totalPages)

  const pagedRows = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize
    return sortedRows.slice(startIndex, startIndex + pageSize)
  }, [pageSize, safePage, sortedRows])

  const resolvedColumnWidths = useMemo(() => {
    const widths: Record<string, number> = {}

    columns.forEach((column) => {
      widths[column] = columnWidths[column] ?? getAutoFitWidth(column, sortedRows)
    })

    return widths
  }, [columnWidths, columns, sortedRows])

  const totalTableWidth = useMemo(() => {
    return 72 + columns.reduce((total, column) => total + (resolvedColumnWidths[column] ?? MIN_COLUMN_WIDTH), 0)
  }, [columns, resolvedColumnWidths])

  useEffect(() => {
    if (!isResizing) {
      return
    }

    document.body.classList.add("cursor-col-resize", "select-none")

    return () => {
      document.body.classList.remove("cursor-col-resize", "select-none")
    }
  }, [isResizing])

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#07111d] px-6 py-10 text-center text-sm text-white/50">
        Execute uma consulta para ver os resultados aqui.
      </div>
    )
  }

  if (!result.rows.length) {
    return (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-[#07111d] px-5 py-5">
        <div className="text-sm text-white/80">{result.message}</div>
        <div className="text-xs text-white/45">{result.rowCount} linha(s) afetada(s).</div>
      </div>
    )
  }

  const startResize = (column: string, startX: number) => {
    const startWidth = resolvedColumnWidths[column] ?? MIN_COLUMN_WIDTH
    resizeRef.current = { column, startX, startWidth }
    setIsResizing(true)

    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeRef.current) {
        return
      }

      event.preventDefault()
      updateResize(event.clientX)
    }

    const handlePointerUp = () => {
      stopResize()
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
  }

  const stopResize = () => {
    resizeRef.current = null
    setIsResizing(false)
  }

  const updateResize = (clientX: number) => {
    const activeResize = resizeRef.current

    if (!activeResize) {
      return
    }

    const nextWidth = Math.max(MIN_COLUMN_WIDTH, activeResize.startWidth + (clientX - activeResize.startX))

    setColumnWidths((current) => ({
      ...current,
      [activeResize.column]: nextWidth,
    }))
  }

  const autoFitColumn = (column: string) => {
    const fitWidth = getAutoFitWidth(column, sortedRows)

    setColumnWidths((current) => {
      const currentWidth = current[column] ?? resolvedColumnWidths[column] ?? MIN_COLUMN_WIDTH

      return {
        ...current,
        [column]: Math.max(currentWidth, fitWidth),
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-[#07111d]">
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium text-white">
          <Button variant="ghost" size="sm">
            <Plus />
          </Button>
          <Button variant="ghost" size="sm">
            <Edit />
          </Button>
          <Button variant="ghost" size="sm">
            <Trash />
          </Button>          
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table
          className="table-fixed"
          wrapperClassName="overflow-visible"
          style={{ width: totalTableWidth }}
        >
          <colgroup>
            <col style={{ width: 72 }} />
            {columns.map((column) => (
              <col key={column} style={{ width: resolvedColumnWidths[column] ?? MIN_COLUMN_WIDTH }} />
            ))}
          </colgroup>

          <TableHeader className="sticky top-0 z-20 bg-[#07111d]">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-18 bg-[#07111d]">#</TableHead>
              {columns.map((column, index) => {
                const active = sort?.column === column
                const isLast = index === columns.length - 1

                return (
                  <TableHead key={column} className="relative bg-[#07111d] p-0">
                    <div className="relative flex h-full items-stretch">
                      <button
                        type="button"
                        onClick={() => {
                          setSort((current) => {
                            if (current?.column === column) {
                              return {
                                column,
                                direction: current.direction === "asc" ? "desc" : "asc",
                              }
                            }

                            return { column, direction: "asc" }
                          })
                        }}
                        className="flex min-h-0 flex-1 items-center gap-2 overflow-hidden px-4 py-3 pr-7 text-left text-white/60 transition-colors hover:text-white"
                      >
                        <span className="truncate">{column}</span>
                        {active ? (
                          sort.direction === "asc" ? (
                            <ArrowUp className="size-4 shrink-0 text-sky-300" />
                          ) : (
                            <ArrowDown className="size-4 shrink-0 text-sky-300" />
                          )
                        ) : (
                          <ArrowUpDown className="size-4 shrink-0 text-white/30" />
                        )}
                      </button>

                      {!isLast ? (
                        <button
                          type="button"
                          aria-label={`Redimensionar coluna ${column}`}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            startResize(column, event.clientX)
                          }}
                          onDoubleClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            autoFitColumn(column)
                          }}
                          className="absolute right-0 top-0 z-30 flex h-full w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center text-white/25 transition-colors hover:text-sky-300"
                        >
                          <GripVertical className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {pagedRows.map((row, index) => {
              const absoluteIndex = (safePage - 1) * pageSize + index + 1

              return (
                <TableRow key={`${absoluteIndex}-${Object.values(row).join("-")}`}>
                  <TableCell className="text-white/45">{absoluteIndex}</TableCell>
                  {columns.map((column) => (
                    <TableCell key={column} className="overflow-hidden text-ellipsis">
                      {formatCell(row[column])}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <span className="border-t border-white/10" />

      <div className="shrink-0 bg-[#07111d] rounded-2xl">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">
              {sortedRows.length.toLocaleString("pt-BR")} linha(s) exibida(s) de{" "}
              {result.rowCount.toLocaleString("pt-BR")}
            </span>
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">
              Ordenação: {sort ? `${sort.column} (${sort.direction})` : "padrão"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-white/55">
              <span>Linhas</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
                className="h-9 rounded-lg border border-white/10 bg-[#050913] px-3 text-sm text-white outline-none transition-colors focus:border-sky-400/60"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
              className="border-white/10 bg-white/4 text-white hover:bg-white/8"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>

            <div className="rounded-lg border border-white/10 bg-white/4 px-3 py-2 text-xs text-white/55">
              Exibindo {(safePage - 1) * pageSize + 1}-
              {Math.min(safePage * pageSize, sortedRows.length)} de {sortedRows.length} linha(s)
            </div>

            <div className="rounded-lg border border-white/10 bg-white/4 px-3 py-2 text-xs text-white/55">
              Página {safePage} de {totalPages}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage >= totalPages}
              className="border-white/10 bg-white/4 text-white hover:bg-white/8"
            >
              Próxima
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatCell(value: SerializedValue) {
  if (value === null) {
    return <span className="text-white/35">NULL</span>
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (typeof value === "number") {
    return value.toLocaleString("pt-BR")
  }

  return String(value)
}

function formatCellText(value: SerializedValue) {
  if (value === null) {
    return "NULL"
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (typeof value === "number") {
    return value.toLocaleString("pt-BR")
  }

  return String(value)
}

function compareValues(left: SerializedValue, right: SerializedValue, direction: SortDirection) {
  const leftRank = getSortRank(left)
  const rightRank = getSortRank(right)

  if (leftRank !== rightRank) {
    return (leftRank - rightRank) * directionFactor(direction)
  }

  switch (leftRank) {
    case 0:
      return 0
    case 1:
      return (Number(left) - Number(right)) * directionFactor(direction)
    case 2:
      return (Number(left) - Number(right)) * directionFactor(direction)
    default:
      return String(left ?? "").localeCompare(String(right ?? ""), "pt-BR", {
        sensitivity: "base",
        numeric: true,
      }) * directionFactor(direction)
  }
}

function getSortRank(value: SerializedValue) {
  if (value === null || value === undefined) {
    return 0
  }

  if (typeof value === "number") {
    return 1
  }

  if (typeof value === "boolean") {
    return 2
  }

  return 3
}

function directionFactor(direction: SortDirection) {
  return direction === "asc" ? 1 : -1
}

function getAutoFitWidth(column: string, rows: Array<Record<string, SerializedValue>>) {
  const headerWidth = getDefaultColumnWidth(column)
  const samples = rows.slice(0, 200)

  const contentWidth = samples.reduce((currentMax, row) => {
    const text = formatCellText(row[column])
    return Math.max(currentMax, measureTextWidth(text, BODY_FONT) + 48)
  }, headerWidth)

  if (column.toLowerCase() === "id" || column.toLowerCase().endsWith("_id")) {
    return Math.max(MIN_COLUMN_WIDTH, Math.min(contentWidth, 128))
  }

  return Math.max(MIN_COLUMN_WIDTH, Math.min(contentWidth, 560))
}

function getDefaultColumnWidth(column: string) {
  const headerWidth = measureTextWidth(column, HEADER_FONT) + 112

  return Math.max(MIN_COLUMN_WIDTH, Math.min(headerWidth, 420))
}

function measureTextWidth(text: string, font: string) {
  if (typeof document === "undefined") {
    return text.length * 8
  }

  if (!measurementCanvas) {
    measurementCanvas = document.createElement("canvas")
  }

  const context = measurementCanvas.getContext("2d")

  if (!context) {
    return text.length * 8
  }

  context.font = font
  return Math.ceil(context.measureText(text).width)
}
