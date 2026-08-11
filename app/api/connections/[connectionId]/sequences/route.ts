import { NextResponse, type NextRequest } from "next/server"

import { createSequence, getConnectionById } from "@/lib/connections"
import type { CreateSequenceInput } from "@/types/connections"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    const connection = getConnectionById(connectionId)

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          message: "Conexão não encontrada.",
          details: "A conexão informada não existe.",
        },
        { status: 404 }
      )
    }

    const body = (await request.json()) as Partial<CreateSequenceInput>
    const result = await createSequence(connection, {
      databaseName: body.databaseName ?? "",
      schemaName: body.schemaName ?? "",
      sequenceName: body.sequenceName ?? "",
      startValue: body.startValue ?? "",
      incrementBy: body.incrementBy ?? "",
      minValue: body.minValue ?? "",
      maxValue: body.maxValue ?? "",
      cacheValue: body.cacheValue ?? "",
      cycle: Boolean(body.cycle),
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      sequenceName: result.sequenceName,
      databaseName: result.databaseName,
      schemaName: result.schemaName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao criar sequence."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível criar a sequence.",
        details: message,
      },
      { status: 400 }
    )
  }
}
