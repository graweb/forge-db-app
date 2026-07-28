"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { AlertTriangle, GripVertical } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import type { DatabaseStructure, DatabaseStructureDatabase, SavedConnection } from "@/types/connections"
import type { ViewDetails } from "@/types/connections"
import type {
  DashboardEditorWorkspaceHandle,
} from "@/types/dashboard-editor"
import type { RoutineKind } from "@/types/dashboard-modals"
import type { DashboardShellProps, ShellNotice, TableTarget } from "@/types/dashboard-shell"

import { ConnectionModal } from "@/components/connections/connection-modal"
import { CreateDatabaseModal } from "./create-database-modal"
import { CreateRoutineModal } from "./create-routine-modal"
import { CreateViewModal } from "./create-view-modal"
import { CreateUserModal } from "./create-user-modal"
import { CreateTableModal } from "./create-table-modal"
import { DeleteTableModal } from "./delete-table-modal"
import { DeleteViewModal } from "./delete-view-modal"
import { DeleteDatabaseModal } from "./delete-database-modal"
import { DeleteConnectionModal } from "./delete-connection-modal"
import { DashboardEditorWorkspace } from "./editor-workspace"
import { DashboardSidebar } from "./sidebar"
import { DashboardStatusbar } from "./statusbar"

function getEffectiveTableDatabaseName(
  connection: SavedConnection,
  database: DatabaseStructureDatabase
) {
  if (connection.databaseType === "mysql" || connection.databaseType === "mariadb") {
    return database.name
  }

  if (connection.databaseType === "sqlserver") {
    return database.name
  }

  if (connection.databaseType === "postgresql") {
    return database.name
  }

  return connection.databaseName || database.name
}

const SIDEBAR_WIDTH_STORAGE_KEY = "forge-db:dashboard-sidebar-width"
const DEFAULT_SIDEBAR_WIDTH = 320
const MIN_SIDEBAR_WIDTH = 272
const MAX_SIDEBAR_WIDTH = 520

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
}

function getStoredSidebarWidth() {
  const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
  return Number.isFinite(storedWidth) ? clampSidebarWidth(storedWidth) : DEFAULT_SIDEBAR_WIDTH
}

function storeSidebarWidth(width: number) {
  window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)))
}

export function DashboardShell({
  connection,
  connections,
  connectionAvailabilityById,
  databaseStructure,
  databaseStructuresById,
}: DashboardShellProps) {
  const activeConnectionAvailability = connection
    ? connectionAvailabilityById[connection.id]
    : undefined
  const hasActiveConnection = Boolean(connection && activeConnectionAvailability?.available !== false)
  const [activePane, setActivePane] = useState<"connections" | "editor">("editor")
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false)
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false)
  const [databaseModalMode, setDatabaseModalMode] = useState<"create" | "edit">("create")
  const [databaseModalKey, setDatabaseModalKey] = useState(0)
  const [isTableModalOpen, setIsTableModalOpen] = useState(false)
  const [tableModalKey, setTableModalKey] = useState(0)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [viewModalMode, setViewModalMode] = useState<"create" | "edit">("create")
  const [viewModalKey, setViewModalKey] = useState(0)
  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false)
  const [routineModalKey, setRoutineModalKey] = useState(0)
  const [routineInitialKind, setRoutineInitialKind] = useState<RoutineKind>("procedure")
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [userModalKey, setUserModalKey] = useState(0)
  const [tableTargetConnection, setTableTargetConnection] = useState<SavedConnection | null>(null)
  const [tableTargetDatabase, setTableTargetDatabase] = useState<DatabaseStructureDatabase | null>(
    null
  )
  const [tableTargetSchema, setTableTargetSchema] = useState<string>("")
  const [tableTarget, setTableTarget] = useState<TableTarget | null>(null)
  const [tableModalMode, setTableModalMode] = useState<"create" | "edit">("create")
  const [viewTargetConnection, setViewTargetConnection] = useState<SavedConnection | null>(null)
  const [viewTargetDatabase, setViewTargetDatabase] = useState<DatabaseStructureDatabase | null>(
    null
  )
  const [viewTargetSchema, setViewTargetSchema] = useState<string>("")
  const [viewTarget, setViewTarget] = useState<ViewDetails | null>(null)
  const [routineTargetConnection, setRoutineTargetConnection] = useState<SavedConnection | null>(null)
  const [routineTargetDatabase, setRoutineTargetDatabase] = useState<DatabaseStructureDatabase | null>(null)
  const [routineTargetSchema, setRoutineTargetSchema] = useState<string>("")
  const [deleteViewTarget, setDeleteViewTarget] = useState<{
    connection: SavedConnection
    database: DatabaseStructureDatabase
    schemaName: string
    viewPath: string
    viewName: string
  } | null>(null)
  const [isDeleteViewModalOpen, setIsDeleteViewModalOpen] = useState(false)
  const [userTargetConnection, setUserTargetConnection] = useState<SavedConnection | null>(null)
  const [userTargetDatabaseName, setUserTargetDatabaseName] = useState<string>("")
  const [userTargetSchemaName, setUserTargetSchemaName] = useState<string>("")
  const [isDeleteTableModalOpen, setIsDeleteTableModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null)
  const [deleteConnectionTarget, setDeleteConnectionTarget] = useState<SavedConnection | null>(null)
  const [isDeleteConnectionModalOpen, setIsDeleteConnectionModalOpen] = useState(false)
  const [databaseTargetConnection, setDatabaseTargetConnection] = useState<SavedConnection | null>(null)
  const [databaseTarget, setDatabaseTarget] = useState<DatabaseStructureDatabase | null>(null)
  const [deleteTargetConnection, setDeleteTargetConnection] = useState<SavedConnection | null>(null)
  const [deleteTargetDatabase, setDeleteTargetDatabase] = useState<DatabaseStructureDatabase | null>(
    null
  )
  const [isDeleteDatabaseModalOpen, setIsDeleteDatabaseModalOpen] = useState(false)
  const [workspaceSessionKey, setWorkspaceSessionKey] = useState(0)
  const [treeResetToken, setTreeResetToken] = useState(0)
  const [localViewAdditions, setLocalViewAdditions] = useState<
    Record<string, Array<{ databaseName: string; schemaName: string; viewName: string }>>
  >({})
  const [localObjectRemovals, setLocalObjectRemovals] = useState<
    Record<string, Array<{ databaseName: string; schemaName: string; groupLabel: "Tabelas" | "Views"; objectName: string }>>
  >({})
  const [localGroupReplacements, setLocalGroupReplacements] = useState<
    Record<
      string,
      Array<{
        databaseName: string
        schemaName: string
        groupLabel: "Procedures" | "Funções"
        group: DatabaseStructure["groups"][number]
      }>
    >
  >({})
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [notice, setNotice] = useState<ShellNotice | null>(null)
  const editorWorkspaceRef = useRef<DashboardEditorWorkspaceHandle | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const localDatabaseStructuresById = useMemo(
    () =>
      Object.entries(localViewAdditions).reduce((structures, [connectionId, additions]) => {
        const structure = structures[connectionId]

        if (!structure || !additions.length) {
          return structures
        }

        return {
          ...structures,
          [connectionId]: additions.reduce(
            (nextStructure, addition) =>
              addViewToDatabaseStructure(
                nextStructure,
                addition.databaseName,
                addition.schemaName,
                addition.viewName
              ),
            structure
          ),
        }
      }, applyLocalGroupReplacements(applyLocalObjectRemovals(databaseStructuresById, localObjectRemovals), localGroupReplacements)),
    [databaseStructuresById, localViewAdditions, localObjectRemovals, localGroupReplacements]
  )
  const activeDatabaseStructure = connection
    ? localDatabaseStructuresById[connection.id] ?? databaseStructure
    : databaseStructure

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setSidebarWidth(getStoredSidebarWidth())
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  useEffect(() => {
    if (!isResizingSidebar) {
      return
    }

    document.body.classList.add("cursor-col-resize", "select-none")

    return () => {
      document.body.classList.remove("cursor-col-resize", "select-none")
    }
  }, [isResizingSidebar])

  function startSidebarResize(clientX: number) {
    sidebarResizeRef.current = {
      startX: clientX,
      startWidth: sidebarWidth,
    }
    setIsResizingSidebar(true)

    const handlePointerMove = (event: PointerEvent) => {
      const activeResize = sidebarResizeRef.current

      if (!activeResize) {
        return
      }

      event.preventDefault()
      const nextWidth = clampSidebarWidth(activeResize.startWidth + event.clientX - activeResize.startX)
      setSidebarWidth(nextWidth)
      storeSidebarWidth(nextWidth)
    }

    const handlePointerUp = () => {
      sidebarResizeRef.current = null
      setIsResizingSidebar(false)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
  }

  function showNotice(nextNotice: ShellNotice) {
    setNotice(nextNotice)

    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current)
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null)
      noticeTimerRef.current = null
    }, 4500)
  }

  function addViewToLocalStructure({
    connectionId,
    databaseName,
    schemaName,
    viewName,
  }: {
    connectionId: string
    databaseName: string
    schemaName: string
    viewName: string
  }) {
    const normalizedViewName = viewName.trim()

    if (!normalizedViewName) {
      return
    }

    setLocalViewAdditions((current) => {
      const additions = current[connectionId] ?? []
      const alreadyAdded = additions.some(
        (addition) =>
          addition.databaseName === databaseName &&
          addition.schemaName === schemaName &&
          addition.viewName === normalizedViewName
      )

      if (alreadyAdded) {
        return current
      }

      return {
        ...current,
        [connectionId]: [...additions, { databaseName, schemaName, viewName: normalizedViewName }],
      }
    })
  }

  function removeObjectFromLocalStructure({
    connectionId,
    databaseName,
    schemaName,
    groupLabel,
    objectName,
  }: {
    connectionId: string
    databaseName: string
    schemaName: string
    groupLabel: "Tabelas" | "Views"
    objectName: string
  }) {
    const normalizedObjectName = objectName.trim()

    if (!normalizedObjectName) {
      return
    }

    if (groupLabel === "Views") {
      setLocalViewAdditions((current) => {
        const additions = current[connectionId] ?? []
        const nextAdditions = additions.filter(
          (addition) =>
            addition.databaseName !== databaseName ||
            addition.schemaName !== schemaName ||
            addition.viewName !== normalizedObjectName
        )

        if (nextAdditions.length === additions.length) {
          return current
        }

        return {
          ...current,
          [connectionId]: nextAdditions,
        }
      })
    }

    setLocalObjectRemovals((current) => {
      const removals = current[connectionId] ?? []
      const alreadyRemoved = removals.some(
        (removal) =>
          removal.databaseName === databaseName &&
          removal.schemaName === schemaName &&
          removal.groupLabel === groupLabel &&
          removal.objectName === normalizedObjectName
      )

      if (alreadyRemoved) {
        return current
      }

      return {
        ...current,
        [connectionId]: [
          ...removals,
          { databaseName, schemaName, groupLabel, objectName: normalizedObjectName },
        ],
      }
    })
  }

  async function refreshRoutineGroup({
    connectionToUse,
    databaseToUse,
    schemaName,
    groupLabel,
  }: {
    connectionToUse: SavedConnection
    databaseToUse: DatabaseStructureDatabase
    schemaName: string
    groupLabel: "Procedures" | "Funções"
  }) {
    try {
      const response = await fetch(`/api/connections/${connectionToUse.id}/databases`)
      const payload: {
        success: boolean
        message?: string
        details?: string
        databaseStructure?: DatabaseStructure
      } = await response.json()

      if (!response.ok || !payload.success || !payload.databaseStructure) {
        showNotice({
          title: "Não foi possível atualizar",
          message: payload.details || payload.message || "Tente novamente em instantes.",
        })
        return
      }

      const updatedGroup = findGroupInStructure(
        payload.databaseStructure,
        databaseToUse.name,
        schemaName,
        groupLabel
      )

      if (!updatedGroup) {
        showNotice({
          title: "Grupo não encontrado",
          message: `Não foi possível encontrar ${groupLabel.toLowerCase()} neste schema.`,
        })
        return
      }

      setLocalGroupReplacements((current) => {
        const replacements = current[connectionToUse.id] ?? []
        const nextReplacement = {
          databaseName: databaseToUse.name,
          schemaName,
          groupLabel,
          group: updatedGroup,
        }

        return {
          ...current,
          [connectionToUse.id]: [
            ...replacements.filter(
              (item) =>
                item.databaseName !== nextReplacement.databaseName ||
                item.schemaName !== nextReplacement.schemaName ||
                item.groupLabel !== nextReplacement.groupLabel
            ),
            nextReplacement,
          ],
        }
      })

      showNotice({
        title: `${groupLabel} atualizadas`,
        message: `A lista de ${groupLabel.toLowerCase()} foi recarregada sem fechar o treeview.`,
      })
    } catch {
      showNotice({
        title: "Erro ao atualizar",
        message: `Não foi possível atualizar ${groupLabel.toLowerCase()}.`,
      })
    }
  }

  return (
    <main className="relative h-dvh min-w-0 overflow-hidden bg-[linear-gradient(180deg,#060a11_0%,#080e17_100%)] text-white">
      {notice ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-50 flex w-full max-w-2xl -translate-x-1/2 px-4">
          <div className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-amber-400/20 bg-[#111827]/95 px-4 py-3 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-md">
            <div className="mt-0.5 rounded-full bg-amber-400/15 p-2 text-amber-300">
              <AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">{notice.title}</div>
              <div className="mt-1 text-sm leading-6 text-white/65">{notice.message}</div>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded-lg px-2 py-1 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-white/80"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setActivePane("connections")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm transition-colors ${
              activePane === "connections"
                ? "bg-sky-400/15 text-white"
                : "bg-white/5 text-white/60"
            }`}
          >
            Conexões
          </button>
          <button
            type="button"
            onClick={() => setActivePane("editor")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm transition-colors ${
              activePane === "editor" ? "bg-sky-400/15 text-white" : "bg-white/5 text-white/60"
            }`}
          >
            Editor SQL
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div
            className={`min-h-0 w-full overflow-hidden lg:h-full lg:w-[var(--dashboard-sidebar-width)] lg:flex-none ${
              activePane === "connections" ? "flex-1" : "hidden lg:block"
            }`}
            style={
              {
                "--dashboard-sidebar-width": `${sidebarWidth}px`,
              } as CSSProperties
            }
          >
            <DashboardSidebar
              activeConnectionId={hasActiveConnection ? connection?.id ?? null : null}
              connections={connections}
              connectionAvailabilityById={connectionAvailabilityById}
              databaseStructuresById={localDatabaseStructuresById}
              treeResetToken={treeResetToken}
              onAddConnection={() => {
                setEditingConnection(null)
                setIsConnectionModalOpen(true)
              }}
              onRefreshConnections={() => {
                router.refresh()
                showNotice({
                  title: "Conexões atualizadas",
                  message: "A lista de conexões existentes foi recarregada.",
                })
              }}
              onCreateDatabase={(connectionToUse) => {
                setDatabaseModalMode("create")
                setDatabaseTargetConnection(connectionToUse)
                setDatabaseTarget(null)
                setDatabaseModalKey((current) => current + 1)
                setIsDatabaseModalOpen(true)
              }}
              onCreateView={(connectionToUse, databaseToUse, schemaName) => {
                setViewTargetConnection(connectionToUse)
                setViewTargetDatabase(databaseToUse)
                setViewTargetSchema(schemaName)
                setViewTarget(null)
                setViewModalMode("create")
                setViewModalKey((current) => current + 1)
                setIsViewModalOpen(true)
              }}
              onCreateRoutine={(connectionToUse, databaseToUse, schemaName, kind) => {
                setRoutineTargetConnection(connectionToUse)
                setRoutineTargetDatabase(databaseToUse)
                setRoutineTargetSchema(schemaName)
                setRoutineInitialKind(kind)
                setRoutineModalKey((current) => current + 1)
                setIsRoutineModalOpen(true)
              }}
              onRefreshRoutineGroup={(connectionToUse, databaseToUse, schemaName, groupLabel) =>
                refreshRoutineGroup({
                  connectionToUse,
                  databaseToUse,
                  schemaName,
                  groupLabel,
                })
              }
              onEditView={async (connectionToUse, databaseToUse, schemaName, _viewPath, viewName) => {
                const databaseName = getEffectiveTableDatabaseName(connectionToUse, databaseToUse)

                setActivePane("editor")
                setViewTargetConnection(connectionToUse)
                setViewTargetDatabase(databaseToUse)
                setViewTargetSchema(schemaName)
                setViewModalMode("edit")
                setViewModalKey((current) => current + 1)

                try {
                  const response = await fetch(
                    `/api/connections/${connectionToUse.id}/views/${encodeURIComponent(viewName)}?databaseName=${encodeURIComponent(
                      databaseName
                    )}&schemaName=${encodeURIComponent(schemaName)}`
                  )

                  const payload: {
                    success: boolean
                    message?: string
                    details?: string
                    databaseName?: string
                    schemaName?: string
                    viewName?: string
                    sqlText?: string
                  } = await response.json()

                  if (!response.ok || !payload.success || !payload.sqlText) {
                    showNotice({
                      title: "Não foi possível carregar a view",
                      message: payload.details || payload.message || "Tente novamente em instantes.",
                    })
                    return
                  }

                  setViewTarget({
                    databaseName: payload.databaseName || databaseName,
                    schemaName: payload.schemaName || schemaName,
                    viewName: payload.viewName || viewName,
                    sqlText: payload.sqlText,
                  })
                  setIsViewModalOpen(true)
                } catch {
                  showNotice({
                    title: "Erro ao carregar view",
                    message: "Não foi possível abrir a view para edição.",
                  })
                }
              }}
              onDeleteView={(connectionToUse, databaseToUse, schemaName, viewPath, viewName) => {
                setDeleteViewTarget({
                  connection: connectionToUse,
                  database: databaseToUse,
                  schemaName,
                  viewPath,
                  viewName,
                })
                setIsDeleteViewModalOpen(true)
              }}
              onCreateUser={(connectionToUse, target) => {
                setUserTargetConnection(connectionToUse)
                setUserTargetDatabaseName(target?.databaseName ?? connectionToUse.databaseName)
                setUserTargetSchemaName(target?.schemaName ?? "")
                setUserModalKey((current) => current + 1)
                setIsUserModalOpen(true)
              }}
              onCreateTable={(connectionToUse, databaseToUse, schemaName) => {
                setTableModalMode("create")
                setTableTarget(null)
                setTableTargetConnection(connectionToUse)
                setTableTargetDatabase(databaseToUse)
                setTableTargetSchema(schemaName)
                setTableModalKey((current) => current + 1)
                setIsTableModalOpen(true)
              }}
              onEditTable={async (connectionToUse, databaseToUse, schemaName, tableName) => {
                const databaseName = getEffectiveTableDatabaseName(connectionToUse, databaseToUse)

                setActivePane("editor")
                setTableModalMode("edit")

                try {
                  const response = await fetch(
                    `/api/connections/${connectionToUse.id}/tables/${encodeURIComponent(tableName)}?databaseName=${encodeURIComponent(
                      databaseName
                    )}&schemaName=${encodeURIComponent(schemaName)}`
                  )

                  const payload: {
                    success: boolean
                    message: string
                    details: string
                    databaseName?: string
                    schemaName?: string
                    tableName?: string
                    comment?: string
                    columns?: Array<{
                      name: string
                      dataType: string
                      size: string
                      notNull: boolean
                      primaryKey: boolean
                      unique?: boolean
                      autoIncrement: boolean
                      defaultValue: string
                      comment: string
                    }>
                    foreignKeys?: string[]
                    indexes?: Array<{
                      name: string
                      columns: string[]
                      unique: boolean
                      primaryKey: boolean
                    }>
                    triggers?: Array<{
                      name: string
                      description: string
                      timing: string
                      event: string
                      body: string
                    }>
                    functions?: string[]
                  } = await response.json()

                  if (!response.ok || !payload.success) {
                    showNotice({
                      title: "Não foi possível carregar a tabela",
                      message: payload.details || payload.message || "Tente novamente em instantes.",
                    })
                    return
                  }

                  setTableTarget({
                    connection: connectionToUse,
                    database: databaseToUse,
                    schemaName: payload.schemaName || schemaName,
                    tableName: payload.tableName || tableName,
                    comment: payload.comment ?? "",
                    columns: payload.columns ?? [],
                    foreignKeys: payload.foreignKeys ?? [],
                    indexes: payload.indexes ?? [],
                    triggers: payload.triggers ?? [],
                    functions: payload.functions ?? [],
                  })
                  setTableTargetConnection(connectionToUse)
                  setTableTargetDatabase(databaseToUse)
                  setTableTargetSchema(payload.schemaName || schemaName)
                  setTableModalKey((current) => current + 1)
                  setIsTableModalOpen(true)
                } catch {
                  showNotice({
                    title: "Erro ao carregar tabela",
                    message: "Não foi possível abrir a tabela para edição.",
                  })
                }
              }}
              onDeleteTable={(connectionToUse, databaseToUse, schemaName, tableName) => {
                setTableTarget({
                  connection: connectionToUse,
                  database: databaseToUse,
                  schemaName,
                  tableName,
                  comment: "",
                  columns: [],
                  foreignKeys: [],
                  indexes: [],
                  triggers: [],
                  functions: [],
                })
                setIsDeleteTableModalOpen(true)
              }}
              onSelect100Rows={(connectionToUse, databaseToUse, schemaName, tableName, sourceKind = "table") => {
                const databaseName = getEffectiveTableDatabaseName(connectionToUse, databaseToUse)

                const tablePath =
                  connectionToUse.databaseType === "sqlserver"
                    ? `[${databaseName}].[${schemaName}].[${tableName}]`
                    : connectionToUse.databaseType === "postgresql"
                      ? `"${schemaName}"."${tableName}"`
                      : tableName

                setActivePane("editor")
                editorWorkspaceRef.current?.executeSqlText(`SELECT *\nFROM ${tablePath}\nLIMIT 100;`, {
                  title: `Selecionar 100 linhas: ${tableName}`,
                  databaseName,
                  insertIntoEditor: true,
                  sourceKind,
                })
              }}
              onEditDatabase={(connectionToUse, databaseToEdit) => {
                setDatabaseModalMode("edit")
                setDatabaseTargetConnection(connectionToUse)
                setDatabaseTarget(databaseToEdit)
                setDatabaseModalKey((current) => current + 1)
                setIsDatabaseModalOpen(true)
              }}
              onDeleteDatabase={(connectionToUse, databaseToDelete) => {
                setDeleteTargetConnection(connectionToUse)
                setDeleteTargetDatabase(databaseToDelete)
                setIsDeleteDatabaseModalOpen(true)
              }}
              onDisconnectConnection={() => {
                setTreeResetToken((current) => current + 1)
                setActivePane("editor")
                setIsConnectionModalOpen(false)
                setEditingConnection(null)
                setWorkspaceSessionKey((current) => current + 1)
                router.replace("/")
              }}
              onSelectConnection={(connectionItem) => {
                const availability = connectionAvailabilityById[connectionItem.id]
                const connectionPath = `/dashboard/${connectionItem.id}`

                if (availability?.available === false) {
                  showNotice({
                    title: "Ambiente indisponível",
                    message:
                      availability.message ||
                      `O ambiente da conexão "${connectionItem.connectionName}" não está disponível no momento.`,
                  })
                  return
                }

                setActivePane("editor")

                if (pathname === connectionPath) {
                  return
                }

                router.push(connectionPath)
              }}
              onEditConnection={(connectionToEdit) => {
                setEditingConnection(connectionToEdit)
                setIsConnectionModalOpen(true)
              }}
              onDeleteConnection={(connectionToDelete) => {
                setDeleteConnectionTarget(connectionToDelete)
                setIsDeleteConnectionModalOpen(true)
              }}
              onRefreshStructure={() => {
                router.refresh()
                showNotice({
                  title: "Estrutura atualizada",
                  message: "Tabelas, campos, views e procedures foram recarregados.",
                })
              }}
              onOpenSqlInNewTab={(sql, title) => {
                setActivePane("editor")
                editorWorkspaceRef.current?.openSqlInNewTab(sql, { title })
              }}
              onRefreshDatabaseStructure={() => {
                router.refresh()
                showNotice({
                  title: "Banco atualizado",
                  message: "A estrutura do banco selecionado foi recarregada.",
                })
              }}
              onInsertText={(text) => {
                editorWorkspaceRef.current?.insertText(text)
                setActivePane("editor")
              }}
              onPreviewTable={(tablePath) => {
                setActivePane("editor")
                return editorWorkspaceRef.current?.previewTable(tablePath)
              }}
              onExecuteTable={(tablePath) => {
                setActivePane("editor")
                return editorWorkspaceRef.current?.executeTable(tablePath)
              }}
              onRunTableQuery={(tablePath, databaseName, sourceKind) => {
                setActivePane("editor")
                return editorWorkspaceRef.current?.runTableQuery(tablePath, databaseName, sourceKind)
              }}
            />
          </div>
          <button
            type="button"
            className={`group relative hidden h-full w-3 shrink-0 cursor-col-resize items-center justify-center border-r border-white/10 bg-[#07111d] text-white/25 transition-colors hover:bg-sky-400/10 hover:text-sky-300 lg:flex ${
              isResizingSidebar ? "bg-sky-400/15 text-sky-200" : ""
            }`}
            aria-label="Redimensionar menu lateral"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-valuenow={sidebarWidth}
            onPointerDown={(event) => {
              event.preventDefault()
              startSidebarResize(event.clientX)
            }}
            onDoubleClick={() => {
              setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
              storeSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
            }}
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 transition-colors group-hover:bg-sky-300/40" />
            <GripVertical className="relative z-10 size-3.5" />
          </button>
          <div
            className={`min-h-0 flex-1 overflow-hidden ${
              activePane === "editor" ? "flex" : "hidden lg:flex"
            }`}
          >
            {hasActiveConnection && connection && activeDatabaseStructure ? (
              <DashboardEditorWorkspace
                key={`${connection.id}-${workspaceSessionKey}`}
                ref={editorWorkspaceRef}
                connection={connection}
                databaseStructure={activeDatabaseStructure}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(72,116,255,0.12),transparent_40%),linear-gradient(180deg,#060a11_0%,#080e17_100%)] px-6">
                <div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_30px_80px_-50px_rgba(0,0,0,0.85)] backdrop-blur-sm">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/35">
                    Forge DB
                  </div>
                  <h1 className="mt-3 text-3xl font-semibold text-white">
                    Nenhuma conexão ativa
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-white/60">
                    Selecione uma conexão no sidebar ou clique em adicionar para criar uma nova.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {hasActiveConnection && connection ? (
          <DashboardStatusbar connection={connection} />
        ) : (
          <footer className="flex h-11 items-center justify-between border-t border-white/10 bg-[#09111b]/95 px-4 text-xs text-white/55">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-white/20" />
              Nenhuma conexão ativa
            </div>
            <div className="hidden items-center gap-6 md:flex">
              <span>Selecione uma conexão no sidebar</span>
            </div>
          </footer>
        )}
      </div>

      <ConnectionModal
        open={isConnectionModalOpen}
        mode={editingConnection ? "edit" : "create"}
        connectionId={editingConnection?.id}
        initialValues={editingConnection ?? undefined}
        onOpenChange={(open) => {
          setIsConnectionModalOpen(open)
          if (!open) {
            setEditingConnection(null)
          }
        }}
        onSaved={() => {
          router.refresh()
        }}
      />

      <DeleteConnectionModal
        open={isDeleteConnectionModalOpen}
        connection={deleteConnectionTarget}
        onOpenChange={(open) => {
          setIsDeleteConnectionModalOpen(open)
          if (!open) {
            setDeleteConnectionTarget(null)
          }
        }}
        onDeleted={async () => {
          const deletedConnectionId = deleteConnectionTarget?.id

          setIsDeleteConnectionModalOpen(false)
          setDeleteConnectionTarget(null)

          if (deletedConnectionId && connection?.id === deletedConnectionId) {
            setTreeResetToken((current) => current + 1)
            setWorkspaceSessionKey((current) => current + 1)
            router.replace("/")
            router.refresh()
            showNotice({
              title: "Conexão removida",
              message: "A conexão foi removida e o editor voltou para a tela inicial.",
            })
            return
          }

          router.refresh()
          showNotice({
            title: "Conexão removida",
            message: "A lista de conexões foi atualizada.",
          })
        }}
      />

      <CreateDatabaseModal
        key={`${databaseTargetConnection?.id ?? "none"}-${databaseTarget?.name ?? "new"}-${databaseModalMode}-${databaseModalKey}`}
        open={isDatabaseModalOpen}
        mode={databaseModalMode}
        connection={databaseTargetConnection}
        database={databaseTarget ?? undefined}
        onOpenChange={(open) => {
          setIsDatabaseModalOpen(open)
          if (!open) {
            setDatabaseTargetConnection(null)
            setDatabaseTarget(null)
          }
        }}
        onSaved={async () => {
          setIsDatabaseModalOpen(false)
          setDatabaseTargetConnection(null)
          setDatabaseTarget(null)
          router.refresh()
          showNotice(
            databaseModalMode === "edit"
              ? {
                  title: "Banco de dados atualizado",
                  message: "A estrutura foi atualizada após a edição do banco.",
                }
              : {
                  title: "Banco de dados criado",
                  message: "A estrutura foi atualizada após a criação do novo banco.",
                }
          )
        }}
      />

      <CreateTableModal
        key={`${tableModalMode}-${tableTargetConnection?.id ?? "none"}-${tableTargetDatabase?.name ?? "none"}-${tableTargetSchema}-${tableTarget?.tableName ?? "new"}-${tableModalKey}`}
        open={isTableModalOpen}
        connection={tableTargetConnection}
        databaseName={tableTargetDatabase?.name}
        database={tableTargetDatabase}
        schemaName={tableTargetSchema}
        schemaOptions={tableTargetDatabase?.schemas.map((schema) => schema.name) ?? []}
        mode={tableModalMode}
        table={
          tableModalMode === "edit" && tableTarget
            ? {
                databaseName: tableTarget.database.name,
                schemaName: tableTarget.schemaName,
                tableName: tableTarget.tableName,
                comment: tableTarget.comment,
                columns: tableTarget.columns,
                foreignKeys: tableTarget.foreignKeys,
                indexes: tableTarget.indexes,
                triggers: tableTarget.triggers,
                functions: tableTarget.functions,
              }
            : null
        }
        onOpenChange={(open) => {
          setIsTableModalOpen(open)
          if (!open) {
            setTableTargetConnection(null)
            setTableTargetDatabase(null)
            setTableTargetSchema("")
            setTableTarget(null)
          }
        }}
        onSaved={async () => {
          setIsTableModalOpen(false)
          setTableTargetConnection(null)
          setTableTargetDatabase(null)
          setTableTargetSchema("")
          setTableTarget(null)
          router.refresh()
          showNotice({
            title: tableModalMode === "edit" ? "Tabela atualizada" : "Tabela criada",
            message:
              tableModalMode === "edit"
                ? "A estrutura foi atualizada após a edição da tabela."
                : "A estrutura foi atualizada após a criação da tabela.",
          })
        }}
      />

      <CreateViewModal
        key={`${viewTargetConnection?.id ?? "none"}-${viewTargetDatabase?.name ?? "none"}-${viewTargetSchema}-${viewModalKey}`}
        open={isViewModalOpen}
        connection={viewTargetConnection}
        mode={viewModalMode}
        database={viewTargetDatabase}
        databaseName={viewTargetDatabase?.name}
        schemaName={viewTargetSchema}
        initialView={viewModalMode === "edit" ? viewTarget : null}
        onOpenChange={(open) => {
          setIsViewModalOpen(open)
          if (!open) {
            setViewTargetConnection(null)
            setViewTargetDatabase(null)
            setViewTargetSchema("")
            setViewTarget(null)
            setViewModalMode("create")
          }
        }}
        onSaved={async ({ message, details, viewName }) => {
          if (viewModalMode === "create" && viewTargetConnection && viewTargetDatabase) {
            addViewToLocalStructure({
              connectionId: viewTargetConnection.id,
              databaseName: viewTargetDatabase.name,
              schemaName: viewTargetSchema,
              viewName,
            })
          } else {
            router.refresh()
          }

          setIsViewModalOpen(false)
          setViewTargetConnection(null)
          setViewTargetDatabase(null)
          setViewTargetSchema("")
          setViewTarget(null)
          setViewModalMode("create")
          showNotice({
            title: message,
            message: details,
          })
        }}
      />

      <CreateRoutineModal
        key={`${routineTargetConnection?.id ?? "none"}-${routineTargetDatabase?.name ?? "none"}-${routineTargetSchema}-${routineInitialKind}-${routineModalKey}`}
        open={isRoutineModalOpen}
        connection={routineTargetConnection}
        database={routineTargetDatabase}
        databaseName={routineTargetDatabase?.name}
        schemaName={routineTargetSchema}
        initialKind={routineInitialKind}
        onOpenChange={(open) => {
          setIsRoutineModalOpen(open)
          if (!open) {
            setRoutineTargetConnection(null)
            setRoutineTargetDatabase(null)
            setRoutineTargetSchema("")
          }
        }}
        onSaved={async ({ message, details, kind }) => {
          if (routineTargetConnection && routineTargetDatabase) {
            await refreshRoutineGroup({
              connectionToUse: routineTargetConnection,
              databaseToUse: routineTargetDatabase,
              schemaName: routineTargetSchema,
              groupLabel: kind === "procedure" ? "Procedures" : "Funções",
            })
          }

          showNotice({
            title: message,
            message: details,
          })
        }}
      />

      <CreateUserModal
        key={`${userTargetConnection?.id ?? "none"}-${userTargetDatabaseName}-${userTargetSchemaName}-${userModalKey}`}
        open={isUserModalOpen}
        connection={userTargetConnection}
        databaseName={userTargetDatabaseName}
        schemaName={userTargetSchemaName}
        onOpenChange={(open) => {
          setIsUserModalOpen(open)
          if (!open) {
            setUserTargetConnection(null)
            setUserTargetDatabaseName("")
            setUserTargetSchemaName("")
          }
        }}
        onSaved={() => {
          router.refresh()
          showNotice({
            title: "Usuário criado",
            message: "O novo usuário foi adicionado e a árvore foi atualizada.",
          })
        }}
      />

      <DeleteTableModal
        open={isDeleteTableModalOpen}
        connection={tableTarget?.connection ?? null}
        database={tableTarget?.database ?? null}
        schemaName={tableTarget?.schemaName}
        tableName={tableTarget?.tableName}
        onOpenChange={(open) => {
          setIsDeleteTableModalOpen(open)
          if (!open) {
            setTableTarget(null)
          }
        }}
        onDeleted={async () => {
          if (tableTarget) {
            setActivePane("editor")
            editorWorkspaceRef.current?.clearDeletedObjectQuery(
              tableTarget.tableName,
              tableTarget.tableName,
              "table",
              tableTarget.database.name
            )
            removeObjectFromLocalStructure({
              connectionId: tableTarget.connection.id,
              databaseName: tableTarget.database.name,
              schemaName: tableTarget.schemaName,
              groupLabel: "Tabelas",
              objectName: tableTarget.tableName,
            })
          }

          setIsDeleteTableModalOpen(false)
          setTableTarget(null)
          showNotice({
            title: "Tabela excluída",
            message: "A tabela foi removida da lista sem fechar o tree view.",
          })
        }}
      />

      <DeleteDatabaseModal
        open={isDeleteDatabaseModalOpen}
        connection={deleteTargetConnection}
        database={deleteTargetDatabase}
        onOpenChange={(open) => {
          setIsDeleteDatabaseModalOpen(open)
          if (!open) {
            setDeleteTargetConnection(null)
            setDeleteTargetDatabase(null)
          }
        }}
        onDeleted={async () => {
          setIsDeleteDatabaseModalOpen(false)
          setDeleteTargetConnection(null)
          setDeleteTargetDatabase(null)
          router.refresh()
          showNotice({
            title: "Banco de dados excluído",
            message: "A estrutura foi atualizada após a exclusão.",
          })
        }}
      />

      <DeleteViewModal
        open={isDeleteViewModalOpen}
        connection={deleteViewTarget?.connection ?? null}
        database={deleteViewTarget?.database ?? null}
        schemaName={deleteViewTarget?.schemaName}
        viewName={deleteViewTarget?.viewName}
        viewPath={deleteViewTarget?.viewPath}
        onOpenChange={(open) => {
          setIsDeleteViewModalOpen(open)
          if (!open) {
            setDeleteViewTarget(null)
          }
        }}
        onDeleted={async () => {
          if (!deleteViewTarget) {
            return
          }

          setActivePane("editor")
          editorWorkspaceRef.current?.clearDeletedObjectQuery(
            deleteViewTarget.viewPath,
            deleteViewTarget.viewName,
            "view",
            deleteViewTarget.database.name
          )
          removeObjectFromLocalStructure({
            connectionId: deleteViewTarget.connection.id,
            databaseName: deleteViewTarget.database.name,
            schemaName: deleteViewTarget.schemaName,
            groupLabel: "Views",
            objectName: deleteViewTarget.viewName,
          })
          setIsDeleteViewModalOpen(false)
          setDeleteViewTarget(null)
          showNotice({
            title: "View excluída",
            message: "A view foi removida da lista sem fechar o tree view.",
          })
        }}
      />
    </main>
  )
}

function addViewToDatabaseStructure(
  structure: DatabaseStructure,
  databaseName: string,
  schemaName: string,
  viewName: string
): DatabaseStructure {
  return {
    ...structure,
    databases: structure.databases.map((database) => {
      if (database.name !== databaseName) {
        return database
      }

      return {
        ...database,
        groups: addViewToGroups(database.groups, viewName),
        schemas: database.schemas.map((schema) => {
          if (schemaName && schema.name !== schemaName) {
            return schema
          }

          return {
            ...schema,
            groups: addViewToGroups(schema.groups, viewName),
          }
        }),
      }
    }),
    groups: addViewToGroups(structure.groups, viewName),
    schemas: structure.schemas.map((schema) => {
      if (schemaName && schema.name !== schemaName) {
        return schema
      }

      return {
        ...schema,
        groups: addViewToGroups(schema.groups, viewName),
      }
    }),
  }
}

function applyLocalObjectRemovals(
  structuresById: Record<string, DatabaseStructure>,
  removalsByConnectionId: Record<
    string,
    Array<{ databaseName: string; schemaName: string; groupLabel: "Tabelas" | "Views"; objectName: string }>
  >
) {
  return Object.entries(removalsByConnectionId).reduce((structures, [connectionId, removals]) => {
    const structure = structures[connectionId]

    if (!structure || !removals.length) {
      return structures
    }

    return {
      ...structures,
      [connectionId]: removals.reduce(
        (nextStructure, removal) =>
          removeObjectFromDatabaseStructure(
            nextStructure,
            removal.databaseName,
            removal.schemaName,
            removal.groupLabel,
            removal.objectName
          ),
        structure
      ),
    }
  }, structuresById)
}

function applyLocalGroupReplacements(
  structuresById: Record<string, DatabaseStructure>,
  replacementsByConnectionId: Record<
    string,
    Array<{
      databaseName: string
      schemaName: string
      groupLabel: "Procedures" | "Funções"
      group: DatabaseStructure["groups"][number]
    }>
  >
) {
  return Object.entries(replacementsByConnectionId).reduce((structures, [connectionId, replacements]) => {
    const structure = structures[connectionId]

    if (!structure || !replacements.length) {
      return structures
    }

    return {
      ...structures,
      [connectionId]: replacements.reduce(
        (nextStructure, replacement) =>
          replaceGroupInDatabaseStructure(
            nextStructure,
            replacement.databaseName,
            replacement.schemaName,
            replacement.groupLabel,
            replacement.group
          ),
        structure
      ),
    }
  }, structuresById)
}

function removeObjectFromDatabaseStructure(
  structure: DatabaseStructure,
  databaseName: string,
  schemaName: string,
  groupLabel: "Tabelas" | "Views",
  objectName: string
): DatabaseStructure {
  return {
    ...structure,
    databases: structure.databases.map((database) => {
      if (database.name !== databaseName) {
        return database
      }

      return {
        ...database,
        groups: removeObjectFromGroups(database.groups, groupLabel, objectName),
        schemas: database.schemas.map((schema) => {
          if (schemaName && schema.name !== schemaName) {
            return schema
          }

          return {
            ...schema,
            groups: removeObjectFromGroups(schema.groups, groupLabel, objectName),
          }
        }),
      }
    }),
    groups: removeObjectFromGroups(structure.groups, groupLabel, objectName),
    schemas: structure.schemas.map((schema) => {
      if (schemaName && schema.name !== schemaName) {
        return schema
      }

      return {
        ...schema,
        groups: removeObjectFromGroups(schema.groups, groupLabel, objectName),
      }
    }),
  }
}

function replaceGroupInDatabaseStructure(
  structure: DatabaseStructure,
  databaseName: string,
  schemaName: string,
  groupLabel: "Procedures" | "Funções",
  group: DatabaseStructure["groups"][number]
): DatabaseStructure {
  return {
    ...structure,
    databases: structure.databases.map((database) => {
      if (database.name !== databaseName) {
        return database
      }

      return {
        ...database,
        groups: replaceGroup(database.groups, groupLabel, group),
        schemas: database.schemas.map((schema) => {
          if (schemaName && schema.name !== schemaName) {
            return schema
          }

          return {
            ...schema,
            groups: replaceGroup(schema.groups, groupLabel, group),
          }
        }),
      }
    }),
    groups: replaceGroup(structure.groups, groupLabel, group),
    schemas: structure.schemas.map((schema) => {
      if (schemaName && schema.name !== schemaName) {
        return schema
      }

      return {
        ...schema,
        groups: replaceGroup(schema.groups, groupLabel, group),
      }
    }),
  }
}

function replaceGroup(
  groups: DatabaseStructure["groups"],
  groupLabel: "Procedures" | "Funções",
  group: DatabaseStructure["groups"][number]
) {
  const nextGroup = { ...group, label: groupLabel }
  const found = groups.some((item) => item.label === groupLabel)

  if (!found) {
    return [...groups, nextGroup]
  }

  return groups.map((item) => (item.label === groupLabel ? nextGroup : item))
}

function findGroupInStructure(
  structure: DatabaseStructure,
  databaseName: string,
  schemaName: string,
  groupLabel: "Procedures" | "Funções"
) {
  const database = structure.databases.find((item) => item.name === databaseName) ?? structure.databases[0]
  const schema = database?.schemas.find((item) => item.name === schemaName) ?? structure.schemas.find((item) => item.name === schemaName)
  const groups = schema?.groups ?? database?.groups ?? structure.groups

  return groups.find((group) => group.label === groupLabel)
}

function removeObjectFromGroups(
  groups: DatabaseStructure["groups"],
  groupLabel: "Tabelas" | "Views",
  objectName: string
): DatabaseStructure["groups"] {
  return groups.map((group) => {
    if (group.label !== groupLabel) {
      return group
    }

    return {
      ...group,
      items: group.items.filter((item) => item !== objectName),
      columnsByItem: removeRecordKey(group.columnsByItem, objectName),
      columnsDetailsByItem: removeRecordKey(group.columnsDetailsByItem, objectName),
    }
  })
}

function removeRecordKey<T>(record: Record<string, T> | undefined, key: string) {
  if (!record || !(key in record)) {
    return record
  }

  const next = { ...record }
  delete next[key]
  return next
}

function addViewToGroups(
  groups: DatabaseStructure["groups"],
  viewName: string
): DatabaseStructure["groups"] {
  let foundViewsGroup = false
  const nextGroups = groups.map((group) => {
    if (group.label !== "Views") {
      return group
    }

    foundViewsGroup = true

    if (group.items.includes(viewName)) {
      return group
    }

    return {
      ...group,
      items: [...group.items, viewName].sort((left, right) => left.localeCompare(right)),
    }
  })

  if (foundViewsGroup) {
    return nextGroups
  }

  return [
    ...groups,
    {
      label: "Views",
      items: [viewName],
    },
  ]
}
