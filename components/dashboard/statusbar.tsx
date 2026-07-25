import { getDatabaseLabel, getConnectionSubtitle } from "@/helpers/dashboard"
import type { DashboardStatusbarProps } from "@/types/dashboard-ui"

export function DashboardStatusbar({ connection }: DashboardStatusbarProps) {
  return (
    <footer className="flex h-11 min-w-0 items-center justify-between gap-3 border-t border-white/10 bg-[#09111b]/95 px-3 text-xs text-white/55 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.85)]" />
        <span className="truncate">Conectado: {connection.connectionName}</span>
      </div>
      <div className="hidden min-w-0 items-center gap-4 md:flex xl:gap-6">
        <span className="truncate">{getConnectionSubtitle(connection)}</span>
        <span>{getDatabaseLabel(connection.databaseType)} 15.4</span>
        <span>Tempo: 32 ms</span>
      </div>
      <div className="md:hidden">{getDatabaseLabel(connection.databaseType)}</div>
    </footer>
  )
}
