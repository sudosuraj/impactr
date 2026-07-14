import { useSession } from "@solidjs/start/http"

export interface AuthSession {
  userID?: string
  email?: string
  organizationID?: string
}

/**
 * Session secret for the encrypted cookie. Fine for the dev stub this is (see auth.ts) — issue
 * #5 should source this from real secrets management alongside replacing the login itself.
 */
const SESSION_SECRET = process.env.DASHBOARD_SESSION_SECRET ?? "dev-only-insecure-dashboard-secret-min-32-chars"

export function useAuthSession() {
  return useSession<AuthSession>({
    password: SESSION_SECRET,
    name: "dashboard_auth",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
  })
}
