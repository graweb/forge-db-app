import { getDatabaseLabel, getConnectionSubtitle } from "@/helpers/dashboard"
import type { DashboardStatusbarProps } from "@/types/dashboard-ui"

export function DashboardStatusbar({ connection }: DashboardStatusbarProps) {
  return (
    <footer className="flex h-11 items-center justify-between border-t border-white/10 bg-[#09111b]/95 px-4 text-xs text-white/55">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.85)]" />
        Conectado: {connection.connectionName}
      </div>
      <div className="hidden items-center gap-6 md:flex">
        <span>{getConnectionSubtitle(connection)}</span>
        <span>{getDatabaseLabel(connection.databaseType)} 15.4</span>
        <span>Tempo: 32 ms</span>
      </div>
      <div className="md:hidden">{getDatabaseLabel(connection.databaseType)}</div>
    </footer>
  )
}
