import { Home, LayoutGrid, Settings2, UserCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { getDatabaseLabel } from "./shared"
import type { SavedConnection } from "@/lib/connections"

type DashboardTopbarProps = {
  connection: SavedConnection
}

const menuItems = ["Dashboard", "Editor SQL", "Tabelas", "Usuários", "Procedures", "Funções", "Backup", "Relatórios"]

export function DashboardTopbar({ connection }: DashboardTopbarProps) {
  return (
    <header className="flex h-16 items-center border-b border-white/10 bg-[#0a111d]/95 px-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-white/6 text-white">
          <LayoutGrid className="size-4" />
        </div>
        <div>
          <div className="text-sm font-medium text-white">DBManager Pro</div>
          <div className="text-xs text-white/45">{getDatabaseLabel(connection.databaseType)}</div>
        </div>
      </div>

      <nav className="ml-8 hidden items-center gap-1 lg:flex">
        {menuItems.map((item, index) => (
          <button
            key={item}
            type="button"
            className={cn(
              "rounded-lg px-3 py-2 text-sm transition-colors",
              index === 1 ? "bg-sky-400/10 text-white" : "text-white/55 hover:text-white"
            )}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" className="text-white/65 hover:text-white">
          <Home className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-white/65 hover:text-white">
          <Settings2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-white/65 hover:text-white">
          <UserCircle2 className="size-5" />
        </Button>
      </div>
    </header>
  )
}
