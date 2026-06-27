import type * as React from "react"

import { cn } from "@/helpers/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm font-medium leading-none text-white/88", className)}
      {...props}
    />
  )
}

export { Label }
