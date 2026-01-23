import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Ensures a promise takes at least `ms` milliseconds to resolve.
 * Useful for showing loading states for a minimum duration.
 */
export async function minDelay<T>(promise: Promise<T>, ms: number): Promise<T> {
  const delay = new Promise((resolve) => setTimeout(resolve, ms));
  const [result] = await Promise.all([promise, delay]);
  return result;
}
