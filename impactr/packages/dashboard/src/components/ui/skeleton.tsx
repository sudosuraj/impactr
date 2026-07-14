export function Skeleton(props: { class?: string }) {
  return <div class={`animate-pulse rounded-md bg-surface-raised ${props.class ?? "h-4 w-full"}`} />
}

export function SkeletonTable(props: { rows?: number }) {
  return (
    <div class="space-y-3 p-5">
      {Array.from({ length: props.rows ?? 5 }).map(() => (
        <div class="flex items-center gap-4">
          <Skeleton class="h-4 w-1/4" />
          <Skeleton class="h-4 w-1/6" />
          <Skeleton class="h-4 w-1/6" />
          <Skeleton class="h-4 w-1/5" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div class="rounded-lg border border-border bg-surface p-5">
      <Skeleton class="h-4 w-1/3" />
      <Skeleton class="mt-3 h-7 w-1/4" />
    </div>
  )
}
