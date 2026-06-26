"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"

import type {
  ConnectionAvailability,
  DatabaseStructure,
  DatabaseStructureDatabase,
  SavedConnection,
} from "@/lib/connections"

import { ConnectionModal } from "@/components/connections/connection-modal"
import { CreateDatabaseModal } from "./create-database-modal"
import { CreateTableModal } from "./create-table-modal"
import { DeleteDatabaseModal } from "./delete-database-modal"
import {
  DashboardEditorWorkspace,
  type DashboardEditorWorkspaceHandle,
} from "./editor-workspace"
import { DashboardSidebar } from "./sidebar"
import { DashboardStatusbar } from "./statusbar"

type DashboardShellProps = {
  connection: SavedConnection | null
  connections: SavedConnection[]
  connectionAvailabilityById: Record<string, ConnectionAvailability>
  databaseStructure?: DatabaseStructure
  databaseStructuresById: Record<string, DatabaseStructure>
}

type ShellNotice = {
  title: string
  message: string
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
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null)
  const [databaseTargetConnection, setDatabaseTargetConnection] = useState<SavedConnection | null>(null)
  const [databaseTarget, setDatabaseTarget] = useState<DatabaseStructureDatabase | null>(null)
  const [deleteTargetConnection, setDeleteTargetConnection] = useState<SavedConnection | null>(null)
  const [deleteTargetDatabase, setDeleteTargetDatabase] = useState<DatabaseStructureDatabase | null>(
    null
  )
  const [isDeleteDatabaseModalOpen, setIsDeleteDatabaseModalOpen] = useState(false)
  const [workspaceSessionKey, setWorkspaceSessionKey] = useState(0)
  const [notice, setNotice] = useState<ShellNotice | null>(null)
  const editorWorkspaceRef = useRef<DashboardEditorWorkspaceHandle | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const router = useRouter()

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
              onAddConnection={() => {
                setEditingConnection(null)
                setIsConnectionModalOpen(true)
              }}
              onCreateDatabase={(connectionToUse) => {
                setDatabaseModalMode("create")
                setDatabaseTargetConnection(connectionToUse)
                setDatabaseTarget(null)
                setDatabaseModalKey((current) => current + 1)
                setIsDatabaseModalOpen(true)
              }}
              onCreateTable={(connectionToUse, databaseToUse, schemaName) => {
                setTableTargetConnection(connectionToUse)
                setTableTargetDatabase(databaseToUse)
                setTableTargetSchema(schemaName)
                setTableModalKey((current) => current + 1)
                setIsTableModalOpen(true)
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
                setActivePane("editor")
                setIsConnectionModalOpen(false)
                setEditingConnection(null)
                setWorkspaceSessionKey((current) => current + 1)
                router.replace("/")
              }}
              onSelectConnection={(connectionItem) => {
                const availability = connectionAvailabilityById[connectionItem.id]

                if (availability?.available === false) {
                  showNotice({
                    title: "Ambiente indisponível",
                    message:
                      availability.message ||
                      `O ambiente da conexão "${connectionItem.connectionName}" não está disponível no momento.`,
                  })
                  return
                }

                router.push(`/dashboard/${connectionItem.id}`)
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
        key={`${tableTargetConnection?.id ?? "none"}-${tableTargetDatabase?.name ?? "none"}-${tableTargetSchema}-${tableModalKey}`}
        open={isTableModalOpen}
        connection={tableTargetConnection}
        databaseName={tableTargetDatabase?.name}
        schemaName={tableTargetSchema}
        schemaOptions={tableTargetDatabase?.schemas.map((schema) => schema.name) ?? []}
        onOpenChange={(open) => {
          setIsTableModalOpen(open)
          if (!open) {
            setTableTargetConnection(null)
            setTableTargetDatabase(null)
            setTableTargetSchema("")
          }
        }}
        onSaved={async () => {
          setIsTableModalOpen(false)
          setTableTargetConnection(null)
          setTableTargetDatabase(null)
          setTableTargetSchema("")
          router.refresh()
          showNotice({
            title: "Tabela criada",
            message: "A estrutura foi atualizada após a criação da tabela.",
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
