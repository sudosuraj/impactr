import { AppShell } from "~/components/layout/app-shell"
import { Page } from "~/components/ui/page"
import { Card } from "~/components/ui/card"
import { EmptyState } from "~/components/ui/empty-state"
import { IconReports } from "~/components/layout/icons"

export default function Reports() {
  return (
    <AppShell>
      <Page title="Reports" description="Export and share findings from your engagements">
        <Card>
          <EmptyState
            icon={<IconReports />}
            title="Report generation isn't available yet"
            description="Downloadable engagement reports are coming soon. In the meantime, your findings and asset data are always available on their own pages."
          />
        </Card>
      </Page>
    </AppShell>
  )
}
