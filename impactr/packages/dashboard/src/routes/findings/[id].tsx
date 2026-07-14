import { A, createAsync, useParams } from "@solidjs/router"
import { Show } from "solid-js"
import { Layout } from "~/components/nav"
import { getFindingDetail } from "~/lib/data"

export default function FindingDetail() {
  const params = useParams()
  const finding = createAsync(() => getFindingDetail(params.id ?? ""))

  return (
    <Layout>
      <A href="/findings" class="mb-6 inline-block text-sm text-neutral-400 hover:text-neutral-100">
        ← Back to findings
      </A>
      <Show when={finding()} fallback={<p class="text-neutral-500">Finding not found.</p>}>
        {(f) => (
          <article class="max-w-3xl space-y-6">
            <header>
              <h1 class="text-xl font-semibold">{f().title}</h1>
              <p class="mt-1 text-sm text-neutral-400">
                Severity: <span class="capitalize">{f().severity}</span> · Status:{" "}
                <span class="capitalize">{f().status.replace("_", " ")}</span> · CVSS: {f().cvss}
              </p>
            </header>
            <section>
              <h2 class="mb-2 text-sm font-semibold text-neutral-300">Description</h2>
              <p class="whitespace-pre-wrap text-neutral-200">{f().description}</p>
            </section>
            <section>
              <h2 class="mb-2 text-sm font-semibold text-neutral-300">Impact</h2>
              <p class="whitespace-pre-wrap text-neutral-200">{f().impact}</p>
            </section>
            <section>
              <h2 class="mb-2 text-sm font-semibold text-neutral-300">Remediation</h2>
              <p class="whitespace-pre-wrap text-neutral-200">{f().remediation}</p>
            </section>
          </article>
        )}
      </Show>
    </Layout>
  )
}
