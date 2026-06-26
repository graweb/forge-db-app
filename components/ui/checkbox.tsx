import type * as React from "react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  checked,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      <input
        data-slot="checkbox"
        type="checkbox"
        checked={checked}
        className={cn(
          "peer size-4 appearance-none rounded-[4px] border border-white/20 bg-black/20 shadow-sm outline-none transition-colors checked:border-[#4e89ff] checked:bg-[#4e89ff] focus:ring-2 focus:ring-[#4e89ff]/25 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      <span className="pointer-events-none absolute text-[10px] leading-none text-white opacity-0 transition-opacity peer-checked:opacity-100">
        ✓
      </span>
    </span>
  )
}

export { Checkbox }
