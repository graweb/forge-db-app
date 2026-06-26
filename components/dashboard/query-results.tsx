"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { QueryExecutionResult, SerializedValue } from "@/lib/connections"

type QueryResultsProps = {
  result: QueryExecutionResult | null
}

type SortDirection = "asc" | "desc"

type SortState = {
  column: string
  direction: SortDirection
}

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 50]

export function QueryResults({ result }: QueryResultsProps) {
  const [sort, setSort] = useState<SortState | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

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

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-[#07111d] p-4">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-white">Resultado da consulta</div>
          <div className="text-xs text-white/45">
            {sortedRows.length.toLocaleString("pt-BR")} linha(s) exibida(s) de{" "}
            {result.rowCount.toLocaleString("pt-BR")}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
          <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">
            Ordenação: {sort ? `${sort.column} (${sort.direction})` : "padrão"}
          </span>
          <label className="flex items-center gap-2">
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
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <Table className="min-w-190">
          <TableHeader className="bg-white/4">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20">#</TableHead>
              {columns.map((column) => {
                const active = sort?.column === column

                return (
                  <TableHead key={column} className="min-w-40">
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
                      className="flex w-full items-center gap-2 text-left text-white/60 transition-colors hover:text-white"
                    >
                      <span className="truncate">{column}</span>
                      {active ? (
                        sort?.direction === "asc" ? (
                          <ArrowUp className="size-4 shrink-0 text-sky-300" />
                        ) : (
                          <ArrowDown className="size-4 shrink-0 text-sky-300" />
                        )
                      ) : (
                        <ArrowUpDown className="size-4 shrink-0 text-white/30" />
                      )}
                    </button>
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
                    <TableCell key={column}>{formatCell(row[column])}</TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-white/45">
          Exibindo {(safePage - 1) * pageSize + 1}-
          {Math.min(safePage * pageSize, sortedRows.length)} de {sortedRows.length} linha(s)
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
