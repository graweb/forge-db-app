import type * as React from "react"

import { cn } from "@/helpers/utils"

function Separator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="separator"
      className={cn("h-px w-full bg-white/10", className)}
      {...props}
    />
  )
}

export { Separator }
