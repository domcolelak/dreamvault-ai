import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { Badge, Card, EmptyState, PageHeader, StatCard, Table } from '@/components/ui';
import { CampaignStatusBadge, SendingModeBadge } from '@/components/status-badge';
import { runWorkerTick, syncInboxAction } from '@/app/actions/system';
import { queueDepth } from '@/lib/agent/jobs';
import { workingHoursState } from '@/lib/agent/rate-limit';
import { prisma } from '@/lib/db';
import { createLLMProvider } from '@/lib/llm';
import { getEmailProvider } from '@/lib/providers/email';
import { imapStatus } from '@/lib/providers/imap/client';
import { createSearchProvider } from '@/lib/providers/search';
import { campaignPerformance, todayStats } from '@/lib/queries';
import { resolveSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const [stats, campaigns, settings, hours, queue] = await Promise.all([
    todayStats(),
    campaignPerformance(),
    resolveSettings(),
    workingHoursState(),
    queueDepth(),
  ]);

  const llm = createLLMProvider({
    provider: settings.llmProvider,
    model: settings.llmModel,
    baseUrl: settings.llmBaseUrl,
  });
  const search = createSearchProvider(settings.searchProvider);
  const smtp = getEmailProvider();
  const imap = imapStatus();

  const recentLogs = await prisma.agentLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: { campaign: { select: { name: true } } },
  });

  const notConfigured = [
    search.configured ? null : 'Search provider',
    smtp.configured ? null : 'SMTP',
    imap.configured ? null : 'IMAP',
    settings.llmModel === null ? 'LLM model' : null,
  ].filter((value): value is string => value !== null);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Today is counted in ${stats.timezone}. Sending window ${settings.workingHoursStart}:00–${settings.workingHoursEnd}:00 — currently ${hours.insideWorkingHours ? 'open' : 'closed'}.`}
        actions={
          <>
            <ActionButton action={runWorkerTick.bind(null, 5)}>Run queue (5 jobs)</ActionButton>
            <ActionButton action={syncInboxAction}>Sync inbox</ActionButton>
          </>
        }
      />

      {notConfigured.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong className="font-semibold">Not configured:</strong> {notConfigured.join(', ')}. Those capabilities are
          off until configured — see{' '}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Found" value={stats.found} hint="leads discovered today" />
        <StatCard label="Qualified" value={stats.qualified} hint="passed scoring today" />
        <StatCard label="Ready" value={stats.ready} hint="awaiting or holding a draft" />
        <StatCard label="Sent" value={stats.sent} hint={`of ${settings.globalDailyEmailLimit} mailbox limit`} />
        <StatCard label="Replies" value={stats.replies} hint="received today" />
        <StatCard label="Needs handling" value={stats.needsHandling} hint="unhandled replies" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card
          title="Campaign performance"
          description="Every campaign is driven only by its own brief — no shared assumptions."
          actions={
            <Link href="/campaigns/new" className="btn-primary">
              New campaign
            </Link>
          }
        >
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet">
              Create one from a free-text brief; the agent interprets it and builds its own search strategy.
            </EmptyState>
          ) : (
            <Table className="border-0">
              <thead className="border-b border-border">
                <tr>
                  <th className="th">Campaign</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Leads</th>
                  <th className="th text-right">Qualified</th>
                  <th className="th text-right">Drafts</th>
                  <th className="th text-right">Sent</th>
                  <th className="th text-right">Replies</th>
                  <th className="th text-right">Today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((row) => (
                  <tr key={row.id} className="hover:bg-surfaceMuted">
                    <td className="td">
                      <Link href={`/campaigns/${row.id}`} className="font-medium text-fg hover:text-accent">
                        {row.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <SendingModeBadge mode={row.sendingMode === 'AUTOMATIC' ? 'AUTOMATIC' : 'DRAFT_ONLY'} />
                        {row.isDemo && <Badge tone="warn">DEMO</Badge>}
                      </div>
                    </td>
                    <td className="td">
                      <CampaignStatusBadge
                        status={row.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'}
                      />
                    </td>
                    <td className="td text-right tabular-nums">
                      {row.leads}
                      <span className="text-fgMuted">/{row.leadsTarget}</span>
                    </td>
                    <td className="td text-right tabular-nums">{row.qualified}</td>
                    <td className="td text-right tabular-nums">{row.drafts}</td>
                    <td className="td text-right tabular-nums">{row.sent}</td>
                    <td className="td text-right tabular-nums">{row.replies}</td>
                    <td className="td text-right tabular-nums">
                      {row.sentToday}
                      <span className="text-fgMuted">/{row.dailySendLimit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="System" description="Providers and the job queue.">
          <dl className="space-y-3 text-sm">
            <StatusRow label="LLM" ok={settings.llmModel !== null} detail={`${llm.name} · ${settings.llmModel ?? 'no model set'}`} />
            <StatusRow label="Search" ok={search.configured} detail={search.status().detail} />
            <StatusRow label="SMTP" ok={smtp.configured} detail={smtp.status().detail} />
            <StatusRow label="IMAP" ok={imap.configured} detail={imap.detail} />
          </dl>
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fgMuted">Job queue</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.keys(queue).length === 0 ? (
                <span className="text-sm text-fgMuted">Empty</span>
              ) : (
                Object.entries(queue).map(([status, count]) => (
                  <Badge key={status} tone={status === 'FAILED' ? 'bad' : status === 'PENDING' ? 'info' : 'neutral'}>
                    {status} {count}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Recent agent decisions" description="Every AI decision is auditable.">
        {recentLogs.length === 0 ? (
          <EmptyState title="No agent activity yet" />
        ) : (
          <ul className="divide-y divide-border">
            {recentLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm">
                <Badge tone={log.error !== null ? 'bad' : 'neutral'}>{log.type.replace(/_/g, ' ')}</Badge>
                <span className="min-w-0 flex-1 text-fg">{log.summary}</span>
                {log.campaign !== null && <span className="text-xs text-fgMuted">{log.campaign.name}</span>}
                <time className="text-xs tabular-nums text-fgMuted" dateTime={log.createdAt.toISOString()}>
                  {log.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      <div className="min-w-0">
        <dt className="font-medium text-fg">{label}</dt>
        <dd className="text-xs text-fgMuted">{detail}</dd>
      </div>
    </div>
  );
}
