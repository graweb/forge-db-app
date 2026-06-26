import type * as React from "react"

import { cn } from "@/lib/utils"

function Switch({
  className,
  checked,
  ...props
}: React.ComponentProps<"button"> & { checked?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "inline-flex h-6 w-10 items-center rounded-full border border-transparent bg-white/12 p-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4e89ff]/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[#4e89ff]",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "size-5 rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.45)] transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  )
}

export { Switch }
