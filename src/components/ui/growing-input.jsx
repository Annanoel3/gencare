import * as React from "react"

import { cn } from "@/lib/utils"

// A one-line box that grows taller to show everything typed, so nothing is
// cut off at Big text mode or on a narrow phone (Anna, Nov 20 2026: "When
// someone has big text, make sure that all of that text field is showing").
// It looks and acts like the Input box: Enter doesn't start a new line; it
// does what Enter did before (the onKeyDown given, else the box's form is
// sent, else the keyboard closes), and pasted line breaks become spaces.
const GrowingInput = React.forwardRef(({ className, value, onChange, onKeyDown, ...props }, ref) => {
  const box = React.useRef(null)
  React.useImperativeHandle(ref, () => box.current)
  const fit = React.useCallback(() => {
    const el = box.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [])
  React.useLayoutEffect(fit, [value, fit])
  // A new width (turning the phone, a different text size) can change how many lines it needs.
  React.useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === "undefined") return undefined
    let w = el.clientWidth
    const watch = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit() } })
    watch.observe(el)
    return () => watch.disconnect()
  }, [fit])
  return (
    <textarea
      ref={box}
      rows={1}
      value={value}
      onChange={(e) => {
        if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, " ")
        onChange?.(e)
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.key !== "Enter" || e.shiftKey || e.defaultPrevented || e.nativeEvent?.isComposing) return
        e.preventDefault()
        const form = e.currentTarget.form
        if (form?.requestSubmit) form.requestSubmit()
        else if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        else e.currentTarget.blur()
      }}
      className={cn(
        "block w-full min-h-9 resize-none overflow-hidden rounded-md border border-input bg-transparent px-3 py-1.5 text-base leading-snug shadow-sm transition-colors placeholder:text-[hsl(var(--placeholder))] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
})
GrowingInput.displayName = "GrowingInput"

export { GrowingInput }
