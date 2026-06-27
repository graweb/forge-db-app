import { Badge } from "@/components/ui/badge"
import { cn } from "@/helpers/utils"

import { getConnectionSubtitle, getDatabaseLabel } from "@/helpers/dashboard"
import type { ReactNode } from "react"
import type { DashboardInspectorPanelProps } from "@/types/dashboard-ui"

const tabs = ["Propriedades", "DDL"] as const

export function DashboardInspectorPanel({ connection }: DashboardInspectorPanelProps) {
  const connectionDetails = [
    ["Nome", connection.connectionName],
    ["Tipo", getDatabaseLabel(connection.databaseType)],
    ["Host", connection.host || "-"],
    ["Porta", connection.port || "-"],
    ["Usuário", connection.user || "-"],
    [
      "Banco / arquivo",
      connection.databaseType === "sqlite"
        ? connection.databaseFile || "-"
        : connection.databaseName || "-",
    ],
    ["SSL", connection.useSsl ? "Ativo" : "Desativado"],
    ["Criado em", new Date(connection.createdAt).toLocaleString("pt-BR")],
    ["Atualizado em", new Date(connection.updatedAt).toLocaleString("pt-BR")],
  ]

  const summary = [
    ["Conexão", connection.connectionName],
    ["Endereço", getConnectionSubtitle(connection)],
    ["Banco", getDatabaseLabel(connection.databaseType)],
  ]

  return (
    <aside className="flex h-full min-h-0 w-92.5 flex-col border-l border-white/10 bg-[#07111d]/95">
      <div className="border-b border-white/10 p-4">
        <div className="flex gap-3">
          {tabs.map((tab, index) => (
            <InspectorTab key={tab} active={index === 0}>
              {tab}
            </InspectorTab>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
            <div className="space-y-2">
              <div className="text-sm text-white/50">Detalhes da conexão</div>
              <div className="flex items-center gap-2 text-white">
                <Badge className="border-white/10 bg-white/5 text-white/75">
                  {getDatabaseLabel(connection.databaseType)}
                </Badge>
                <span className="text-sm text-white/60">{connection.connectionName}</span>
              </div>
            </div>

            <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
              {connectionDetails.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3 text-sm">
                  <div className="text-white/45">{label}</div>
                  <div className="wrap-break-word text-white/80">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
            <div className="flex gap-4 border-b border-white/10">
              <InspectorSectionTab active>Resumo</InspectorSectionTab>
              <InspectorSectionTab>Conexão</InspectorSectionTab>
              <InspectorSectionTab>Permissões</InspectorSectionTab>
            </div>

            <div className="mt-4 space-y-3">
              {summary.map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[110px_1fr] gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm"
                >
                  <div className="text-white/45">{label}</div>
                  <div className="text-white/80">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
            <div className="text-sm font-medium text-white">Notas</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-white/60">
              <p>As credenciais são mantidas localmente no SQLite do aplicativo.</p>
              <p>O editor SQL usa a conexão salva para executar consultas reais.</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function InspectorTab({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-sky-400 text-white"
          : "border-transparent text-white/45 hover:text-white/75"
      )}
    >
      {children}
    </button>
  )
}

function InspectorSectionTab({
  children,
  active = false,
}: {
  children: ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        "pb-3 text-sm transition-colors",
        active ? "text-white" : "text-white/45 hover:text-white/75"
      )}
    >
      {children}
    </button>
  )
}
