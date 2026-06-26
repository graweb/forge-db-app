import { NextResponse } from "next/server"

import { saveConnection } from "@/lib/connections"

export const runtime = "nodejs"

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
