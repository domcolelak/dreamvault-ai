import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader, Table } from '@/components/ui';
import { CampaignStatusBadge, SendingModeBadge } from '@/components/status-badge';
import { campaignPerformance } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const campaigns = await campaignPerformance();

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Each campaign is defined entirely by its brief. Nothing about the industry, country, language or buyer is built into the app."
        actions={
          <Link href="/campaigns/new" className="btn-primary">
            New campaign
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState title="No campaigns yet">
            Start with a sentence or two about what you sell and who you want to reach.{' '}
            <Link href="/campaigns/new" className="text-accent underline">
              Create your first campaign
            </Link>
            .
          </EmptyState>
        </Card>
      ) : (
        <Table>
          <thead className="border-b border-border">
            <tr>
              <th className="th">Campaign</th>
              <th className="th">Status</th>
              <th className="th">Mode</th>
              <th className="th text-right">Leads</th>
              <th className="th text-right">Qualified</th>
              <th className="th text-right">Drafts</th>
              <th className="th text-right">Sent</th>
              <th className="th text-right">Replies</th>
              <th className="th text-right">Min. score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {campaigns.map((row) => (
              <tr key={row.id} className="hover:bg-surfaceMuted">
                <td className="td">
                  <Link href={`/campaigns/${row.id}`} className="font-medium text-fg hover:text-accent">
                    {row.name}
                  </Link>
                  {row.isDemo && (
                    <Badge tone="warn" className="ml-2">
                      DEMO
                    </Badge>
                  )}
                </td>
                <td className="td">
                  <CampaignStatusBadge status={row.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'} />
                </td>
                <td className="td">
                  <SendingModeBadge mode={row.sendingMode === 'AUTOMATIC' ? 'AUTOMATIC' : 'DRAFT_ONLY'} />
                </td>
                <td className="td text-right tabular-nums">
                  {row.leads}
                  <span className="text-fgMuted">/{row.leadsTarget}</span>
                </td>
                <td className="td text-right tabular-nums">{row.qualified}</td>
                <td className="td text-right tabular-nums">{row.drafts}</td>
                <td className="td text-right tabular-nums">{row.sent}</td>
                <td className="td text-right tabular-nums">{row.replies}</td>
                <td className="td text-right tabular-nums">{row.minimumScore}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
