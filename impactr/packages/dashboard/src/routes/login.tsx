import { useSubmission } from "@solidjs/router"
import { Show } from "solid-js"
import { login } from "~/lib/auth"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"

export default function Login() {
  const submission = useSubmission(login)

  return (
    <main class="flex min-h-screen items-center justify-center bg-background px-4">
      <form action={login} method="post" class="w-full max-w-sm space-y-5 rounded-lg border border-border bg-surface p-8">
        <div class="flex items-center gap-2">
          <div class="flex h-6 w-6 items-center justify-center rounded bg-accent text-accent-foreground">
            <span class="text-xs font-bold">I</span>
          </div>
          <span class="text-sm font-semibold text-foreground">Impactr</span>
        </div>
        <div>
          <h1 class="text-lg font-semibold text-foreground">Sign in</h1>
          <p class="mt-1 text-sm text-muted-foreground">View your findings and asset inventory.</p>
        </div>
        <div class="space-y-3">
          <Input name="email" type="email" required placeholder="you@company.com" />
          <Input name="password" type="password" required placeholder="Password" />
        </div>
        <Show when={submission.result?.error}>
          <p class="text-sm text-status-danger">{submission.result?.error}</p>
        </Show>
        <Button type="submit" variant="primary" disabled={submission.pending} class="w-full">
          {submission.pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  )
}
