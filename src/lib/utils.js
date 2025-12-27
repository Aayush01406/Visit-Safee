import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function normalizeBlock(value) {
  const v = String(value || "").trim().toLowerCase()
  if (!v) return null
  const direct = v.match(/^([a-z])$/)
  if (direct) return `Block ${direct[1].toUpperCase()}`
  const withLabel = v.match(/^(?:block|tower|wing)\s*([a-z])$/i)
  if (withLabel) return `Block ${withLabel[1].toUpperCase()}`
  return null
}
