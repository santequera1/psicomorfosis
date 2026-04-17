import { cn } from "@/lib/utils";

// Crisálida abstracta: dos trazos continuos sugiriendo transformación.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-brand-700", className)}
      aria-label="Psicomorfosis"
    >
      <path
        d="M16 3 C 8 7, 5 14, 9 20 C 12 24, 14 26, 16 29"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16 3 C 24 7, 27 14, 23 20 C 20 24, 18 26, 16 29"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.65"
      />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
    </svg>
  );
}
