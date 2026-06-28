"use client"

import { Loader2 } from "lucide-react"

export function QueryResultsLoading() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-white/10 bg-[#07111d] px-6 py-8">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 shadow-[0_18px_60px_-34px_rgba(0,0,0,0.95)]">
        <Loader2 className="size-4 animate-spin text-sky-300" />
        Processando resultados da query...
      </div>
    </div>
  )
}
