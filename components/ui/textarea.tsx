import type * as React from "react"

import { cn } from "@/helpers/utils"

function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-lg border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-white shadow-sm outline-none transition-colors placeholder:text-white/35 focus:border-[#4e89ff] focus:ring-2 focus:ring-[#4e89ff]/25 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
