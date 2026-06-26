import { DashboardShell } from "@/components/dashboard/shell"
import { getDatabaseStructure, listConnections } from "@/lib/connections"

export const runtime = "nodejs"

export default async function Home() {
  const connections = listConnections(100)
  const databaseStructuresById = Object.fromEntries(
    await Promise.all(
      connections.map(async (item) => [item.id, await getDatabaseStructure(item)] as const)
    )
  )

  return (
    <DashboardShell
      connection={null}
      connections={connections}
      databaseStructure={undefined}
      databaseStructuresById={databaseStructuresById}
    />
  )
}
