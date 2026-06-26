import { DashboardShell } from "@/components/dashboard/shell"
import {
  getDatabaseStructureLoadResult,
  listConnections,
  type ConnectionAvailability,
} from "@/lib/connections"

export const runtime = "nodejs"

export default async function Home() {
  const connections = listConnections(100)
  const loadedStructures = await Promise.all(
    connections.map(async (item) => [item.id, await getDatabaseStructureLoadResult(item)] as const)
  )
  const databaseStructuresById = Object.fromEntries(
    loadedStructures.map(([id, result]) => [id, result.databaseStructure] as const)
  )
  const connectionAvailabilityById = Object.fromEntries(
    loadedStructures.map(([id, result]) => [id, result.connectionAvailability] as const)
  ) as Record<string, ConnectionAvailability>

  return (
    <DashboardShell
      connection={null}
      connections={connections}
      connectionAvailabilityById={connectionAvailabilityById}
      databaseStructure={undefined}
      databaseStructuresById={databaseStructuresById}
    />
  )
}
