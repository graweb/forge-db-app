import { NextResponse } from "next/server"

import { listConnections, saveConnection } from "@/lib/connections"

export const runtime = "nodejs"

export async function GET() {
  try {
    const connections = listConnections(100)

    return NextResponse.json({
      success: true,
      connections,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao listar conexões."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível listar as conexões.",
        details: message,
      },
      { status: 400 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await saveConnection(body)

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      connectionId: result.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao salvar conexão."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível salvar e conectar.",
        details: message,
      },
      { status: 400 }
    )
  }
}
