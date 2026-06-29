import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes safely — clsx handles conditionals, twMerge resolves
 * conflicts (last write wins for the same property).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
