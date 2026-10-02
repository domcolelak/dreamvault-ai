import Link from 'next/link';
import { markInboundHandledAction, syncInboxAction } from '@/app/actions/system';
import { ActionButton } from '@/components/action-button';
import { Badge, Card, EmptyState, InlineLink, PageHeader } from '@/components/ui';
import { prisma } from '@/lib/db';
import { imapStatus } from '@/lib/providers/imap/client';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const status = imapStatus();

  const replies = await prisma.inboundEmail.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 100,
    include: {
      campaign: { select: { id: true, name: true } },
      lead: { select: { id: true, company: { select: { name: true, domain: true } } } },
      contact: { select: { fullName: true, email: true, jobTitle: true } },
      sentEmail: { select: { subject: true, body: true, sentAt: true } },
    },
  });

  const pending = replies.filter((reply) => reply.needsManualHandling).length;

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Only replies to this app's outreach. Nothing here is answered automatically — every reply is yours to handle."
        actions={<ActionButton action={syncInboxAction}>Sync now</ActionButton>}
      />

      {!status.configured && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong className="font-semibold">IMAP not configured.</strong> {status.detail}
        </div>
      )}

      {pending > 0 && (
        <p className="mb-4 text-sm text-fgMuted">
          <Badge tone="warn">{pending} needs manual handling</Badge>
        </p>
      )}

      {replies.length === 0 ? (
        <Card>
          <EmptyState title="No replies yet">
            {status.configured
              ? 'Run a sync after your first emails go out. When a reply arrives, all automation for that contact stops immediately.'
              : 'Configure IMAP to detect replies.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {replies.map((reply) => (
            <Card
              key={reply.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {reply.lead !== null ? (
                    <Link href={`/leads/${reply.lead.id}`} className="hover:text-accent">
                      {reply.lead.company.name}
                    </Link>
                  ) : (
                    <span>{reply.fromEmail}</span>
                  )}
                  {reply.needsManualHandling ? (
                    <Badge tone="warn">Needs manual handling</Badge>
                  ) : (
                    <Badge tone="good">Handled</Badge>
                  )}
                  {!reply.isReply && <Badge tone="neutral">Auto-response</Badge>}
                </span>
              }
              description={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span>{reply.contact?.fullName ?? reply.fromEmail}</span>
                  {reply.contact?.jobTitle !== undefined && reply.contact.jobTitle !== null && (
                    <span>{reply.contact.jobTitle}</span>
                  )}
                  {reply.campaign !== null && (
                    <Link href={`/campaigns/${reply.campaign.id}`} className="hover:text-accent">
                      {reply.campaign.name}
                    </Link>
                  )}
                  <time dateTime={reply.receivedAt.toISOString()}>
                    Received {reply.receivedAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </time>
                  {reply.matchedBy !== null && <span>matched by {reply.matchedBy}</span>}
                </span>
              }
              actions={
                reply.needsManualHandling ? (
                  <>
                    <a href={`mailto:${reply.fromEmail}`} className="btn-secondary">
                      Reply by email
                    </a>
                    <ActionButton action={markInboundHandledAction.bind(null, reply.id)}>Mark handled</ActionButton>
                  </>
                ) : undefined
              }
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="label">Their reply</p>
                  <p className="text-sm font-semibold text-fg">{reply.subject ?? '(no subject)'}</p>
                  <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-fg">
                    {reply.bodyText ?? reply.bodySnippet ?? '(empty body)'}
                  </p>
                </div>
                <div>
                  <p className="label">Our original email</p>
                  {reply.sentEmail === null ? (
                    <p className="text-sm text-fgMuted">Not linked to a sent message.</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-fg">{reply.sentEmail.subject}</p>
                      <p className="text-xs text-fgMuted">
                        Sent {reply.sentEmail.sentAt.toISOString().slice(0, 16).replace('T', ' ')}
                      </p>
                      <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-fgMuted">
                        {reply.sentEmail.body}
                      </p>
                    </>
                  )}
                  {reply.lead !== null && (
                    <p className="mt-2 text-xs">
                      <InlineLink href={`/leads/${reply.lead.id}`}>Open the full lead</InlineLink>
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
