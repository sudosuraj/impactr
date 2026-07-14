import { createSignal, onMount } from "solid-js"

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark)
  localStorage.setItem("theme", dark ? "dark" : "light")
}

export function ThemeToggle() {
  const [dark, setDark] = createSignal(false)

  onMount(() => {
    setDark(document.documentElement.classList.contains("dark"))
  })

  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark()
        setDark(next)
        applyTheme(next)
      }}
      class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
      aria-label="Toggle theme"
    >
      {dark() ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1v1.5M8 13.5V15M2.5 8H1M15 8h-1.5M3.5 3.5l1 1M11.5 11.5l1 1M12.5 3.5l-1 1M4.5 11.5l-1 1M11.5 8a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M14 8.7A6 6 0 117.3 2a4.7 4.7 0 006.7 6.7z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
