import type * as React from "react"

import { cn } from "@/helpers/utils"

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-xs font-medium text-white/85",
        className
      )}
      {...props}
    />
  )
}

export { Badge }
