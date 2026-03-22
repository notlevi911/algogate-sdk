import { cn } from "@/lib/utils"
import type {
  ComponentPropsWithoutRef,
  MouseEvent,
  ReactNode,
} from "react"
import { useRef } from "react"

import "./SpotlightCard.css"

type SpotlightCardProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode
  spotlightColor?: string
}

function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(255, 255, 255, 0.25)",
  ...props
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement | null>(null)

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const node = divRef.current

    if (!node) {
      return
    }

    const rect = node.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    node.style.setProperty("--mouse-x", `${x}px`)
    node.style.setProperty("--mouse-y", `${y}px`)
    node.style.setProperty("--spotlight-color", spotlightColor)
  }

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      className={cn("card-spotlight", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export default SpotlightCard
