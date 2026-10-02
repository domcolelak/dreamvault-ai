import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  deleteCampaignAction,
  generateDraftsAction,
  regenerateStrategyAction,
  reinterpretBrief,
  runDiscoveryAction,
  scheduleSendsAction,
  setCampaignStatus,
  setSendingMode,
} from '@/app/actions/campaigns';
import { runWorkerTick } from '@/app/actions/system';
import { ActionButton } from '@/components/action-button';
import { CampaignConfigForm } from '@/components/campaign-config-form';
import { CampaignStatusBadge, JobStatusBadge, LeadStatusBadge, ScoreBadge, SendingModeBadge } from '@/components/status-badge';
import { Badge, Card, EmptyState, KeyValue, PageHeader, Table, TagList } from '@/components/ui';
import { getActiveStrategy } from '@/lib/agent/search-strategy';
import { prisma } from '@/lib/db';
import { startOfLocalDay } from '@/lib/agent/rate-limit';
import { resolveSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (campaign === null) notFound();

  const settings = await resolveSettings();
  const dayStart = startOfLocalDay(new Date(), settings.timezone);

  const [strategy, counts, sentToday, leads, runs, jobs, logs] = await Promise.all([
    getActiveStrategy(campaign.id),
    Promise.all([
      prisma.lead.count({ where: { campaignId: campaign.id } }),
      prisma.lead.count({ where: { campaignId: campaign.id, qualified: true } }),
      prisma.lead.count({ where: { campaignId: campaign.id, status: 'REJECTED' } }),
      prisma.emailDraft.count({ where: { campaignId: campaign.id, status: 'DRAFT' } }),
      prisma.emailDraft.count({ where: { campaignId: campaign.id, status: 'BLOCKED' } }),
      prisma.sentEmail.count({ where: { campaignId: campaign.id } }),
      prisma.lead.count({ where: { campaignId: campaign.id, status: 'REPLIED' } }),
    ]),
    prisma.sentEmail.count({ where: { campaignId: campaign.id, sentAt: { gte: dayStart } } }),
    prisma.lead.findMany({
      where: { campaignId: campaign.id },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 25,
      include: { company: true, contact: true },
    }),
    prisma.agentRun.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.job.groupBy({ by: ['type', 'status'], where: { campaignId: campaign.id }, _count: { _all: true } }),
    prisma.agentLog.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  const [total, qualified, rejected, readyDrafts, blockedDrafts, sent, replies] = counts;
  const pendingJobs = jobs
    .filter((row) => row.status === 'PENDING' || row.status === 'RUNNING')
    .reduce((sum, row) => sum + row._count._all, 0);

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CampaignStatusBadge status={campaign.status} />
            <SendingModeBadge mode={campaign.sendingMode} />
            {campaign.isDemo && <Badge tone="warn">DEMO DATA</Badge>}
            {!campaign.interpretationApproved && <Badge tone="warn">Interpretation not reviewed</Badge>}
            <span className="text-fgMuted">Created {campaign.createdAt.toISOString().slice(0, 10)}</span>
          </span>
        }
        actions={
          <>
            {campaign.status === 'ACTIVE' ? (
              <ActionButton action={setCampaignStatus.bind(null, campaign.id, 'PAUSED')}>Pause</ActionButton>
            ) : (
              <ActionButton
                variant="primary"
                action={setCampaignStatus.bind(null, campaign.id, 'ACTIVE')}
              >
                {campaign.status === 'PAUSED' ? 'Resume' : 'Activate'}
              </ActionButton>
            )}
            <ActionButton action={runDiscoveryAction.bind(null, campaign.id)}>Run discovery</ActionButton>
            <ActionButton action={generateDraftsAction.bind(null, campaign.id)}>Generate drafts</ActionButton>
            <ActionButton action={runWorkerTick.bind(null, 8)}>Run queue</ActionButton>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <Stat label="Leads" value={`${total}/${campaign.leadsTarget}`} />
        <Stat label="Qualified" value={qualified} />
        <Stat label="Rejected" value={rejected} />
        <Stat label="Drafts ready" value={readyDrafts} />
        <Stat label="Drafts blocked" value={blockedDrafts} />
        <Stat label="Sent" value={sent} />
        <Stat label="Replies" value={replies} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Campaign brief"
          description="Verbatim, as you typed it. This is the authoritative input for every decision."
          actions={<ActionButton action={reinterpretBrief.bind(null, campaign.id)}>Re-interpret</ActionButton>}
        >
          <p className="whitespace-pre-wrap text-sm text-fg">{campaign.rawBrief}</p>
        </Card>

        <Card title="Sending" description="Automatic sending must be switched on deliberately.">
          <KeyValue
            items={[
              { label: 'Mode', value: <SendingModeBadge mode={campaign.sendingMode} /> },
              { label: 'Sent today', value: `${sentToday} / ${campaign.dailySendLimit}` },
              { label: 'Mailbox limit', value: `${settings.globalDailyEmailLimit} per day` },
              {
                label: 'Window',
                value: `${settings.workingHoursStart}:00–${settings.workingHoursEnd}:00 ${settings.timezone}`,
              },
              { label: 'Minimum score', value: campaign.minimumScore },
              { label: 'Queued jobs', value: pendingJobs },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {campaign.sendingMode === 'DRAFT_ONLY' ? (
              <ActionButton
                variant="primary"
                confirm="Switch this campaign to AUTOMATIC? Validated drafts will then be sent on their own, spread across your working hours."
                action={setSendingMode.bind(null, campaign.id, 'AUTOMATIC')}
              >
                Enable automatic sending
              </ActionButton>
            ) : (
              <ActionButton action={setSendingMode.bind(null, campaign.id, 'DRAFT_ONLY')}>
                Back to draft-only
              </ActionButton>
            )}
            <ActionButton action={scheduleSendsAction.bind(null, campaign.id)}>Schedule today&apos;s sends</ActionButton>
          </div>
          <p className="mt-3 text-xs text-fgMuted">
            Follow-ups are never sent automatically. Once a contact replies, all automation for them stops and the
            conversation becomes yours.
          </p>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr,1fr]">
        <Card title="Parsed configuration" description="Edit anything the agent got wrong, then save to mark it reviewed.">
          <CampaignConfigForm campaign={campaign} />
        </Card>

        <div className="space-y-6">
          <Card
            title={strategy !== null ? `Search strategy v${strategy.version}` : 'Search strategy'}
            description="Built by the model from this brief alone."
            actions={<ActionButton action={regenerateStrategyAction.bind(null, campaign.id)}>Rebuild</ActionButton>}
          >
            {strategy === null ? (
              <EmptyState title="No strategy yet">
                It is created automatically on the first discovery run, or build it now with Rebuild.
              </EmptyState>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="label">Queries ({strategy.queries.length})</p>
                  <ol className="space-y-1 text-sm">
                    {strategy.queries.map((query, index) => (
                      <li key={`${query}-${index}`} className="flex gap-2">
                        <span className="w-5 shrink-0 text-right tabular-nums text-fgMuted">{index + 1}.</span>
                        <code className="min-w-0 break-words font-mono text-xs text-fg">{query}</code>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="label">Signals to look for</p>
                  <TagList values={strategy.signalsToLookFor} tone="accent" />
                </div>
                <div>
                  <p className="label">Decision maker roles</p>
                  <TagList values={strategy.decisionMakerRoles} />
                </div>
                <div>
                  <p className="label">Pages to inspect</p>
                  <TagList values={strategy.pagesToInspect} />
                </div>
                <div>
                  <p className="label">Company sources</p>
                  <TagList values={strategy.companySources} />
                </div>
                {strategy.rationale !== null && (
                  <div>
                    <p className="label">Rationale</p>
                    <p className="text-sm text-fgMuted">{strategy.rationale}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Recent runs">
            {runs.length === 0 ? (
              <EmptyState title="No runs yet" />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {runs.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <JobStatusBadge status={run.status} />
                    <span className="text-fgMuted">{run.trigger}</span>
                    <span className="tabular-nums text-fg">
                      {run.leadsCreated} found · {run.leadsQualified} qualified · {run.leadsRejected} rejected ·{' '}
                      {run.draftsCreated} drafts · {run.emailsSent} sent
                    </span>
                    <time className="ml-auto text-xs tabular-nums text-fgMuted">
                      {run.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </time>
                    {run.error !== null && <span className="w-full text-xs text-rose-600">{run.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card
        title="Leads"
        description={`Top ${Math.min(leads.length, 25)} of ${total}.`}
        actions={
          <Link href={`/leads?campaign=${campaign.id}`} className="btn-secondary">
            All leads
          </Link>
        }
      >
        {leads.length === 0 ? (
          <EmptyState title="No leads yet">Run discovery, then process the queue.</EmptyState>
        ) : (
          <Table className="border-0">
            <thead className="border-b border-border">
              <tr>
                <th className="th">Company</th>
                <th className="th">Contact</th>
                <th className="th">Country</th>
                <th className="th">Score</th>
                <th className="th">Signal</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-surfaceMuted">
                  <td className="td">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-fg hover:text-accent">
                      {lead.company.name}
                    </Link>
                    <div className="text-xs text-fgMuted">{lead.company.domain}</div>
                  </td>
                  <td className="td">
                    {lead.contact !== null ? (
                      <>
                        <div>{lead.contact.fullName ?? lead.contact.email}</div>
                        <div className="text-xs text-fgMuted">{lead.contact.jobTitle ?? '—'}</div>
                      </>
                    ) : (
                      <span className="text-fgMuted">—</span>
                    )}
                  </td>
                  <td className="td">{lead.company.country ?? <span className="text-fgMuted">unknown</span>}</td>
                  <td className="td">
                    <ScoreBadge score={lead.score} minimum={campaign.minimumScore} />
                  </td>
                  <td className="td max-w-[260px] text-fgMuted">{lead.strongestSignal ?? '—'}</td>
                  <td className="td">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6" title="Agent log" description="Why the agent did what it did.">
        {logs.length === 0 ? (
          <EmptyState title="Nothing logged yet" />
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => (
              <li key={log.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Badge tone={log.error !== null ? 'bad' : 'neutral'}>{log.type.replace(/_/g, ' ')}</Badge>
                  <span className="min-w-0 flex-1 text-fg">{log.summary}</span>
                  <span className="text-xs text-fgMuted">{log.model ?? log.provider ?? ''}</span>
                  <time className="text-xs tabular-nums text-fgMuted">
                    {log.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </time>
                </div>
                {log.error !== null && <p className="mt-1 text-xs text-rose-600">{log.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 flex justify-end">
        <ActionButton
          variant="danger"
          redirectTo="/campaigns"
          confirm={`Delete "${campaign.name}" and all of its leads, drafts and logs? This cannot be undone.`}
          action={deleteCampaignAction.bind(null, campaign.id)}
        >
          Delete campaign
        </ActionButton>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-fgMuted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}
