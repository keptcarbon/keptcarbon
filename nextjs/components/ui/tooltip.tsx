"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

/**
 * Hover/focus tooltip. `children` must be a single element that accepts a ref
 * (a button, link or span) — it becomes the trigger via Base UI's `render`.
 * The popup is portalled to <body>, outside any `.kc-tw` wrapper, so it carries
 * that class itself for the Tailwind styles to apply.
 */
function Tooltip({
  content,
  children,
  side = "top",
  delay = 150,
  className,
}: {
  content: React.ReactNode
  children: React.ReactElement
  side?: "top" | "bottom" | "left" | "right"
  delay?: number
  className?: string
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger delay={delay} render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} className="kc-tw z-[1000]">
          <TooltipPrimitive.Popup
            className={cn(
              "rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-background shadow-md",
              "origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              className
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/**
 * Same look as Tooltip, but opens on click/tap instead of hover: clicking the
 * trigger toggles it, clicking anywhere else (or Esc) closes it. Use for longer
 * explanations — and it works on phones, where hover tooltips don't.
 * `children` must be a single focusable element that accepts a ref.
 */
function ClickTooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode
  children: React.ReactElement
  side?: "top" | "bottom" | "left" | "right"
  className?: string
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger nativeButton={false} render={children} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side={side} sideOffset={6} collisionPadding={12} className="kc-tw z-[1000]">
          <PopoverPrimitive.Popup
            initialFocus={false}
            className={cn(
              "rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background shadow-md outline-none",
              "origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              className
            )}
          >
            {content}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Tooltip, ClickTooltip }
