import { NextResponse, type NextRequest } from "next/server"

import { deleteConnection, updateConnection } from "@/lib/connections"

export const runtime = "nodejs"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    const body = await request.json()
    const result = await updateConnection(connectionId, body)

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      connectionId: result.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao atualizar conexão."
    const status = message.includes("não encontrada") ? 404 : 400

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível atualizar a conexão.",
        details: message,
      },
      { status }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    const result = deleteConnection(connectionId)

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      connectionId: result.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao remover conexão."
    const status = message.includes("não encontrada") ? 404 : 400

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível remover a conexão.",
        details: message,
      },
      { status }
    )
  }
}
