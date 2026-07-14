import { useSubmission } from "@solidjs/router"
import { login } from "~/lib/auth"

export default function Login() {
  const submission = useSubmission(login)

  return (
    <main class="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <form action={login} method="post" class="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-8">
        <h1 class="text-lg font-semibold text-neutral-100">Impactr Dashboard</h1>
        <p class="text-sm text-neutral-400">Sign in to view your findings and asset inventory.</p>
        <input
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          class="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 placeholder:text-neutral-600"
        />
        {submission.result?.error && <p class="text-sm text-red-400">{submission.result.error}</p>}
        <button
          type="submit"
          disabled={submission.pending}
          class="w-full rounded bg-neutral-100 px-3 py-2 font-medium text-neutral-900 disabled:opacity-50"
        >
          {submission.pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  )
}
