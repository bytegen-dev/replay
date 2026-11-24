"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "cut-dialog fixed top-1/2 left-1/2 z-[81] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 border border-border bg-card p-5 outline-none sm:p-6",
          className,
        )}
        {...props}
      >
        {/* The box keeps its own corners and edge (drawn by layers on the box itself, which must not scroll); a tall dialog scrolls inside it (by wheel, touch or keys; the
            bar itself is hidden), with the close button staying put. The padding (taken back by the negative margin, so nothing moves) is room
            for what is drawn outside a button's box: the edge of a cut-corner button is one pixel outside it, and its hover glow reaches about 20 pixels, and both
            would be cut off hard at the wrapper's edge. It matches the box's own padding, so the wrapper reaches the box's edge and no further. */}
        <div className="-m-5 flex min-h-0 flex-col gap-[inherit] overflow-x-hidden overflow-y-auto overscroll-contain p-5 sm:-m-6 sm:p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
        <DialogPrimitive.Close className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label="Close">
          <XIcon className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-bold tracking-tight", className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription }
