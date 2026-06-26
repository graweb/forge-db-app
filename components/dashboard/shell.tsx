"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

import type { DatabaseStructure, SavedConnection } from "@/lib/connections"

import { ConnectionModal } from "@/components/connections/connection-modal"
import {
  DashboardEditorWorkspace,
  type DashboardEditorWorkspaceHandle,
} from "./editor-workspace"
import { DashboardSidebar } from "./sidebar"
import { DashboardStatusbar } from "./statusbar"

type DashboardShellProps = {
  connection: SavedConnection | null
  connections: SavedConnection[]
  databaseStructure?: DatabaseStructure
  databaseStructuresById: Record<string, DatabaseStructure>
}

export function DashboardShell({
  connection,
  connections,
  databaseStructure,
  databaseStructuresById,
}: DashboardShellProps) {
  const hasActiveConnection = Boolean(connection)
  const [activePane, setActivePane] = useState<"connections" | "editor">("editor")
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null)
  const [workspaceSessionKey, setWorkspaceSessionKey] = useState(0)
  const editorWorkspaceRef = useRef<DashboardEditorWorkspaceHandle | null>(null)
  const router = useRouter()

  return (
    <main className="h-dvh overflow-hidden bg-[linear-gradient(180deg,#060a11_0%,#080e17_100%)] text-white">
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
              activeConnectionId={connection?.id ?? null}
              connections={connections}
              databaseStructuresById={databaseStructuresById}
              onAddConnection={() => {
                setEditingConnection(null)
                setIsConnectionModalOpen(true)
              }}
            onDisconnectConnection={() => {
              setActivePane("editor")
              setIsConnectionModalOpen(false)
              setEditingConnection(null)
              setWorkspaceSessionKey((current) => current + 1)
              router.replace("/")
              }}
              onSelectConnection={(connectionId) => {
                router.push(`/dashboard/${connectionId}`)
              }}
              onEditConnection={(connectionToEdit) => {
                setEditingConnection(connectionToEdit)
                setIsConnectionModalOpen(true)
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
    </main>
  )
}
