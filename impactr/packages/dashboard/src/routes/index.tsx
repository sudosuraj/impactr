import { query, redirect } from "@solidjs/router"
import { createAsync } from "@solidjs/router"

const goToFindings = query(async () => {
  "use server"
  throw redirect("/findings")
}, "index-redirect")

export default function Index() {
  createAsync(() => goToFindings())
  return null
}
