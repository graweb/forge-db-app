"use client"

import { useState } from "react"

import type { SavedConnection } from "@/lib/connections"

import { DashboardEditorWorkspace } from "./editor-workspace"
import { DashboardSidebar } from "./sidebar"
import { DashboardStatusbar } from "./statusbar"

type DashboardShellProps = {
  connection: SavedConnection
  recentConnections: SavedConnection[]
}

export function DashboardShell({ connection, recentConnections }: DashboardShellProps) {
  const [activePane, setActivePane] = useState<"connections" | "editor">("editor")

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
            <DashboardSidebar connection={connection} recentConnections={recentConnections} />
          </div>
          <div
            className={`min-h-0 flex-1 overflow-hidden ${
              activePane === "editor" ? "flex" : "hidden lg:flex"
            }`}
          >
            <DashboardEditorWorkspace connection={connection} />
          </div>
        </div>

        <DashboardStatusbar connection={connection} />
      </div>
    </main>
  )
}
