"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import type { DatabaseStructureDatabase, SavedConnection } from "@/types/connections"
import type {
  DashboardEditorWorkspaceHandle,
} from "@/types/dashboard-editor"
import type { DashboardShellProps, ShellNotice, TableTarget } from "@/types/dashboard-shell"

import { ConnectionModal } from "@/components/connections/connection-modal"
import { CreateDatabaseModal } from "./create-database-modal"
import { CreateTableModal } from "./create-table-modal"
import { DeleteTableModal } from "./delete-table-modal"
import { DeleteDatabaseModal } from "./delete-database-modal"
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

  return connection.databaseName || database.name
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
  const [tableTargetConnection, setTableTargetConnection] = useState<SavedConnection | null>(null)
  const [tableTargetDatabase, setTableTargetDatabase] = useState<DatabaseStructureDatabase | null>(
    null
  )
  const [tableTargetSchema, setTableTargetSchema] = useState<string>("")
  const [tableTarget, setTableTarget] = useState<TableTarget | null>(null)
  const [tableModalMode, setTableModalMode] = useState<"create" | "edit">("create")
  const [isDeleteTableModalOpen, setIsDeleteTableModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null)
  const [databaseTargetConnection, setDatabaseTargetConnection] = useState<SavedConnection | null>(null)
  const [databaseTarget, setDatabaseTarget] = useState<DatabaseStructureDatabase | null>(null)
  const [deleteTargetConnection, setDeleteTargetConnection] = useState<SavedConnection | null>(null)
  const [deleteTargetDatabase, setDeleteTargetDatabase] = useState<DatabaseStructureDatabase | null>(
    null
  )
  const [isDeleteDatabaseModalOpen, setIsDeleteDatabaseModalOpen] = useState(false)
  const [workspaceSessionKey, setWorkspaceSessionKey] = useState(0)
  const [treeResetToken, setTreeResetToken] = useState(0)
  const [notice, setNotice] = useState<ShellNotice | null>(null)
  const editorWorkspaceRef = useRef<DashboardEditorWorkspaceHandle | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current)
      }
    }
  }, [])

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

  return (
    <main className="relative h-dvh overflow-hidden bg-[linear-gradient(180deg,#060a11_0%,#080e17_100%)] text-white">
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
            className={`min-h-0 overflow-hidden lg:h-full lg:w-[320px] lg:flex-none ${
              activePane === "connections" ? "flex-1" : "hidden lg:block"
            }`}
          >
            <DashboardSidebar
              activeConnectionId={hasActiveConnection ? connection?.id ?? null : null}
              connections={connections}
              connectionAvailabilityById={connectionAvailabilityById}
              databaseStructuresById={databaseStructuresById}
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
              onSelect100Rows={(connectionToUse, databaseToUse, schemaName, tableName) => {
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
              onRunTableQuery={(tablePath) => {
                setActivePane("editor")
                return editorWorkspaceRef.current?.runTableQuery(tablePath)
              }}
            />
          </div>
          <div
            className={`min-h-0 flex-1 overflow-hidden ${
              activePane === "editor" ? "flex" : "hidden lg:flex"
            }`}
          >
            {hasActiveConnection && connection && databaseStructure ? (
              <DashboardEditorWorkspace
                key={`${connection.id}-${workspaceSessionKey}`}
                ref={editorWorkspaceRef}
                connection={connection}
                databaseStructure={databaseStructure}
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
          setIsDeleteTableModalOpen(false)
          setTableTarget(null)
          router.refresh()
          showNotice({
            title: "Tabela excluída",
            message: "A estrutura foi atualizada após a exclusão da tabela.",
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
    </main>
  )
}
