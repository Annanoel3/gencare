import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

// A date or time box that shows placeholder text while it's empty (Anna,
// Nov 20 2026: "When a user creates a reminder, only placeholder text should
// be on the date and time fields"). Phones don't show a placeholder in these
// boxes (Android shows mm/dd/yyyy, iPhone nothing), so it's drawn on top and
// the phone's own empty text is hidden; the box's arrow stays.
const DateTimeInput = React.forwardRef(({ type = "date", value, placeholder, className, wrapClassName, ...props }, ref) => {
  const empty = !value
  return (
    <div className={cn("relative", wrapClassName)}>
      <Input
        ref={ref}
        type={type}
        value={value || ""}
        className={cn("peer", empty && "[&::-webkit-datetime-edit]:text-transparent focus:[&::-webkit-datetime-edit]:text-inherit", className)}
        {...props}
      />
      {empty && placeholder && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 right-9 flex items-center truncate text-base md:text-sm text-[hsl(var(--placeholder))] peer-focus:hidden">
          {placeholder}
        </span>
      )}
    </div>
  )
})
DateTimeInput.displayName = "DateTimeInput"

export { DateTimeInput }
