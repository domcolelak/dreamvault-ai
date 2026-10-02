import Link from 'next/link';
import { notFound } from 'next/navigation';
import { discardDraftAction, sendDraftNowAction } from '@/app/actions/campaigns';
import { stopAutomationAction } from '@/app/actions/system';
import { ActionButton } from '@/components/action-button';
import { DraftStatusBadge, EmailStatusBadge, LeadStatusBadge, ScoreBadge } from '@/components/status-badge';
import { Badge, Card, EmptyState, InlineLink, KeyValue, PageHeader } from '@/components/ui';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      company: true,
      contact: true,
      campaign: true,
      evidence: { orderBy: { createdAt: 'asc' } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      drafts: { orderBy: { createdAt: 'desc' } },
      sentEmails: { orderBy: { sentAt: 'desc' } },
      inboundEmails: { orderBy: { receivedAt: 'desc' } },
    },
  });
  if (lead === null) notFound();

  const logs = await prisma.agentLog.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'asc' },
  });

  const activeDraft = lead.drafts.find((draft) => draft.status === 'DRAFT' || draft.status === 'BLOCKED');
  const sourcedEvidence = lead.evidence.filter((item) => item.sourceUrl !== null);
  const unsourcedEvidence = lead.evidence.filter((item) => item.sourceUrl === null);

  return (
    <>
      <PageHeader
        title={lead.company.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <LeadStatusBadge status={lead.status} />
            <ScoreBadge score={lead.score} minimum={lead.campaign.minimumScore} />
            {lead.automationStopped && <Badge tone="warn">Automation stopped</Badge>}
            <InlineLink href={lead.company.websiteUrl ?? `https://${lead.company.domain}`}>
              {lead.company.domain}
            </InlineLink>
            <Link href={`/campaigns/${lead.campaign.id}`} className="text-fgMuted hover:text-accent">
              {lead.campaign.name}
            </Link>
          </span>
        }
        actions={
          !lead.automationStopped ? (
            <ActionButton
              confirm="Stop all automation for this lead and handle it manually from here on?"
              action={stopAutomationAction.bind(null, lead.id)}
            >
              Stop automation
            </ActionButton>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">
        <div className="space-y-6">
          <Card title="Why this lead" description="Every reason carries the source it came from.">
            {sourcedEvidence.length === 0 ? (
              <EmptyState title="No sourced evidence yet">
                The agent will not write an email without at least one claim backed by a URL.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {sourcedEvidence.map((item) => (
                  <li key={item.id} className="border-l-2 border-accent/40 pl-3">
                    <p className="text-sm text-fg">{item.claim}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone="neutral">{item.kind ?? 'evidence'}</Badge>
                      <span className="text-fgMuted">Source:</span>
                      <InlineLink href={item.sourceUrl ?? '#'}>{item.sourceUrl}</InlineLink>
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {unsourcedEvidence.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="label">Unsourced observations (never used for personalization)</p>
                <ul className="list-inside list-disc space-y-1 text-sm text-fgMuted">
                  {unsourcedEvidence.map((item) => (
                    <li key={item.id}>{item.claim}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Qualification reasoning">
            <KeyValue
              items={[
                { label: 'Score', value: <ScoreBadge score={lead.score} minimum={lead.campaign.minimumScore} /> },
                { label: 'Campaign minimum', value: lead.campaign.minimumScore },
                { label: 'Qualified', value: lead.qualified === null ? 'not assessed' : lead.qualified ? 'yes' : 'no' },
                { label: 'Strongest signal', value: lead.strongestSignal ?? '—' },
              ]}
            />
            {lead.recommendedAngle !== null && (
              <div className="mt-4">
                <p className="label">Recommended sales angle</p>
                <p className="text-sm text-fg">{lead.recommendedAngle}</p>
              </div>
            )}
            {lead.qualificationReason !== null && (
              <div className="mt-4">
                <p className="label">Reasoning</p>
                <p className="whitespace-pre-wrap text-sm text-fgMuted">{lead.qualificationReason}</p>
              </div>
            )}
            {lead.rejectionReason !== null && (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="label text-amber-700 dark:text-amber-300">Why it was not contacted</p>
                <p className="text-sm text-amber-800 dark:text-amber-200">{lead.rejectionReason}</p>
              </div>
            )}
            {lead.failureReason !== null && (
              <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <p className="label text-rose-700 dark:text-rose-300">Failure</p>
                <p className="text-sm text-rose-800 dark:text-rose-200">{lead.failureReason}</p>
              </div>
            )}
          </Card>

          {activeDraft !== undefined && (
            <Card
              title="Generated email"
              description="First touch only. The agent never generates follow-ups."
              actions={
                <>
                  <DraftStatusBadge status={activeDraft.status} />
                  {activeDraft.status === 'DRAFT' && (
                    <ActionButton
                      variant="primary"
                      confirm={`Send this email to ${lead.contact?.email ?? 'the contact'} now?`}
                      action={sendDraftNowAction.bind(null, activeDraft.id)}
                    >
                      Send now
                    </ActionButton>
                  )}
                  <ActionButton action={discardDraftAction.bind(null, activeDraft.id)}>Discard</ActionButton>
                </>
              }
            >
              {activeDraft.blockReason !== null && (
                <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
                  <strong className="font-semibold">Blocked:</strong> {activeDraft.blockReason}
                </div>
              )}
              <KeyValue
                items={[
                  { label: 'Language', value: activeDraft.language },
                  { label: 'Words', value: activeDraft.wordCount ?? '—' },
                  { label: 'Model', value: activeDraft.model ?? '—' },
                  {
                    label: 'Scheduled',
                    value:
                      activeDraft.scheduledAt !== null
                        ? activeDraft.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')
                        : 'not scheduled',
                  },
                ]}
              />
              <div className="mt-4 rounded-md border border-border bg-surfaceMuted px-4 py-3">
                <p className="text-sm font-semibold text-fg">{activeDraft.subject}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{activeDraft.body}</p>
              </div>
              <div className="mt-3 text-xs text-fgMuted">
                <p>
                  <strong className="text-fg">Personalization rests on:</strong> {activeDraft.personalizationEvidence}
                </p>
                {activeDraft.sourceUrl !== null && (
                  <p className="mt-1">
                    Source: <InlineLink href={activeDraft.sourceUrl}>{activeDraft.sourceUrl}</InlineLink>
                  </p>
                )}
              </div>
            </Card>
          )}

          {lead.sentEmails.length > 0 && (
            <Card title="Sent email" description="Exactly what left the mailbox.">
              {lead.sentEmails.map((email) => (
                <article key={email.id} className="border-b border-border py-3 last:border-0 last:pb-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 text-xs text-fgMuted">
                    <span>To {email.recipient}</span>
                    <span>From {email.fromEmail}</span>
                    <time dateTime={email.sentAt.toISOString()}>
                      {email.sentAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </time>
                    <code className="font-mono">{email.messageId}</code>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-fg">{email.subject}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{email.body}</p>
                </article>
              ))}
            </Card>
          )}

          {lead.inboundEmails.length > 0 && (
            <Card title="Reply" description="Automation is stopped. Continue manually from your mail client.">
              {lead.inboundEmails.map((email) => (
                <article key={email.id} className="border-b border-border py-3 last:border-0 last:pb-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 text-xs text-fgMuted">
                    <span>{email.fromName ?? email.fromEmail}</span>
                    <time dateTime={email.receivedAt.toISOString()}>
                      {email.receivedAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </time>
                    {email.matchedBy !== null && <Badge tone="neutral">matched by {email.matchedBy}</Badge>}
                    {!email.isReply && <Badge tone="warn">auto-response</Badge>}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-fg">{email.subject ?? '(no subject)'}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{email.bodyText ?? email.bodySnippet ?? ''}</p>
                </article>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Company">
            <KeyValue
              items={[
                { label: 'Name', value: lead.company.name },
                {
                  label: 'Website',
                  value: (
                    <InlineLink href={lead.company.websiteUrl ?? `https://${lead.company.domain}`}>
                      {lead.company.domain}
                    </InlineLink>
                  ),
                },
                { label: 'Country', value: lead.company.country ?? 'unknown' },
                { label: 'Industry', value: lead.company.industry ?? 'unknown' },
                {
                  label: 'Employees',
                  value: lead.company.employeeEstimate ?? lead.company.employeeNote ?? 'unknown',
                },
                { label: 'Website language', value: lead.company.websiteLanguage ?? 'unknown' },
              ]}
            />
            {lead.company.description !== null && (
              <div className="mt-4">
                <p className="label">Description</p>
                <p className="text-sm text-fgMuted">{lead.company.description}</p>
              </div>
            )}
            {lead.company.researchSummary !== null && (
              <div className="mt-4">
                <p className="label">Research summary</p>
                <p className="text-sm text-fgMuted">{lead.company.researchSummary}</p>
              </div>
            )}
          </Card>

          <Card title="Contact">
            {lead.contact === null ? (
              <EmptyState title="No contact found">
                The agent never invents a person or an address. It leaves this empty instead.
              </EmptyState>
            ) : (
              <>
                <KeyValue
                  items={[
                    { label: 'Name', value: lead.contact.fullName ?? '—' },
                    { label: 'Title', value: lead.contact.jobTitle ?? 'unknown' },
                    { label: 'Email', value: lead.contact.email ?? '—' },
                    { label: 'Email status', value: <EmailStatusBadge status={lead.contact.emailStatus} /> },
                    { label: 'Confidence', value: lead.contact.confidence ?? '—' },
                    { label: 'Shared mailbox', value: lead.contact.isGeneric ? 'yes' : 'no' },
                  ]}
                />
                {lead.contact.emailPattern !== null && (
                  <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    This address was derived from the pattern <code>{lead.contact.emailPattern}</code> and is therefore
                    stored as GUESSED.
                  </p>
                )}
                {lead.contact.sourceUrl !== null && (
                  <p className="mt-3 text-xs text-fgMuted">
                    Found on: <InlineLink href={lead.contact.sourceUrl}>{lead.contact.sourceUrl}</InlineLink>
                  </p>
                )}
                {lead.contact.linkedinUrl !== null && (
                  <p className="mt-1 text-xs text-fgMuted">
                    LinkedIn: <InlineLink href={lead.contact.linkedinUrl}>{lead.contact.linkedinUrl}</InlineLink>
                  </p>
                )}
                {lead.contact.globalDoNotAutoContact && (
                  <p className="mt-3">
                    <Badge tone="bad">Global do-not-auto-contact</Badge>
                  </p>
                )}
              </>
            )}
          </Card>

          <Card title="Timeline">
            <ol className="space-y-3">
              {lead.statusHistory.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <time className="w-28 shrink-0 text-xs tabular-nums text-fgMuted">
                    {entry.createdAt.toISOString().slice(5, 16).replace('T', ' ')}
                  </time>
                  <div className="min-w-0">
                    <LeadStatusBadge status={entry.to} />
                    {entry.reason !== null && <p className="mt-1 text-xs text-fgMuted">{entry.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Agent decisions for this lead">
            {logs.length === 0 ? (
              <EmptyState title="No decisions logged" />
            ) : (
              <ul className="space-y-3">
                {logs.map((log) => (
                  <li key={log.id}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge tone={log.error !== null ? 'bad' : 'neutral'}>{log.type.replace(/_/g, ' ')}</Badge>
                      <time className="text-xs tabular-nums text-fgMuted">
                        {log.createdAt.toISOString().slice(5, 16).replace('T', ' ')}
                      </time>
                      {log.model !== null && <span className="text-xs text-fgMuted">{log.model}</span>}
                    </div>
                    <p className="mt-1 text-sm text-fg">{log.summary}</p>
                    {log.error !== null && <p className="mt-0.5 text-xs text-rose-600">{log.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
