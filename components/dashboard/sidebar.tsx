import {
  Clock3,
  Database,
  FolderGit2,
  Layers3,
  MoreHorizontal,
  Plus,
  Table2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { databaseIcons, getConnectionSubtitle, getDatabaseLabel } from "./shared"
import type { ComponentType } from "react"
import type { SavedConnection } from "@/lib/connections"

type DashboardSidebarProps = {
  connection: SavedConnection
  recentConnections: SavedConnection[]
}

export function DashboardSidebar({ connection, recentConnections }: DashboardSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-white/10 bg-[#07111d]/95">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-white/40">
            <span>Conexões</span>
            <Plus className="size-4 text-white/35" />
          </div>
          <div className="space-y-2">
            {recentConnections.map((item) => {
              const Icon = databaseIcons[item.databaseType]
              const active = item.id === connection.id

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    active
                      ? "border-sky-400/25 bg-sky-400/10"
                      : "border-white/8 bg-white/2 hover:bg-white/4"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg",
                      active ? "bg-sky-400/18 text-sky-300" : "bg-white/6 text-white/65"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{item.connectionName}</div>
                    <div className="truncate text-xs text-white/45">
                      {getConnectionSubtitle(item)}
                    </div>
                  </div>
                  <MoreHorizontal className="size-4 text-white/25" />
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-white/40">
            <span>Estrutura</span>
            <Badge className="border-white/10 bg-white/5 text-white/65">live</Badge>
          </div>

          <div className="space-y-1">
            <TreeItem icon={Database} label={connection.connectionName} active />
            <TreeItem icon={FolderGit2} label={getDatabaseLabel(connection.databaseType)} />
            <TreeItem icon={Layers3} label="public" />
            <TreeBranch icon={Table2} label="Tabelas" />
            <TreeBranch icon={Clock3} label="Views" />
            <TreeBranch icon={Table2} label="Índices" />
            <TreeBranch icon={Table2} label="Funções" />
            <TreeBranch icon={Table2} label="Procedures" />
          </div>
        </section>
      </div>
    </aside>
  )
}

function TreeItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  active?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        active ? "bg-sky-400/10 text-white" : "text-white/70"
      )}
    >
      <Icon className="size-4 text-sky-300/90" />
      <span className="truncate">{label}</span>
    </div>
  )
}

function TreeBranch({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-6 py-2 text-sm text-white/62">
      <Icon className="size-4 text-white/35" />
      <span>{label}</span>
    </div>
  )
}
