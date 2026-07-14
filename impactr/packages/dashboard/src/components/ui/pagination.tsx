export function Pagination(props: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  return (
    <div class="flex items-center justify-between border-t border-border px-5 py-3">
      <span class="text-xs text-muted-foreground">
        Page {props.page} of {Math.max(1, props.pageCount)}
      </span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          disabled={props.page <= 1}
          onClick={() => props.onChange(props.page - 1)}
          class="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-surface-raised disabled:pointer-events-none disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={props.page >= props.pageCount}
          onClick={() => props.onChange(props.page + 1)}
          class="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-surface-raised disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
