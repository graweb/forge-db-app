import { NextResponse } from "next/server"

import { executeQueryById } from "@/lib/connections"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    const body = (await request.json()) as { sql?: string; databaseName?: string }
    const result = await executeQueryById(connectionId, body.sql ?? "", body.databaseName)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao executar a consulta."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível executar a consulta.",
        details: message,
      },
      { status: 400 }
    )
  }
}
