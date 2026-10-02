import type { EmailStatus, LeadStatus, Prisma } from '@prisma/client';
import Link from 'next/link';
import { Card, EmptyState, PageHeader, Table } from '@/components/ui';
import { EmailStatusBadge, LeadStatusBadge, ScoreBadge } from '@/components/status-badge';
import { LeadsFilters } from '@/components/leads-filters';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const LEAD_STATUSES: LeadStatus[] = [
  'DISCOVERED', 'RESEARCHING', 'QUALIFIED', 'REJECTED', 'CONTACT_FOUND', 'READY',
  'DRAFTED', 'SENT', 'REPLIED', 'MANUAL', 'FAILED', 'DO_NOT_CONTACT',
];
const EMAIL_STATUSES: EmailStatus[] = ['VERIFIED', 'VALID', 'UNKNOWN', 'GUESSED', 'INVALID'];

const PAGE_SIZE = 50;

function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as string[]).includes(value);
}
function isEmailStatus(value: string): value is EmailStatus {
  return (EMAIL_STATUSES as string[]).includes(value);
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const single = (key: string): string => {
    const value = searchParams[key];
    return typeof value === 'string' ? value : '';
  };

  const where: Prisma.LeadWhereInput = {};
  if (single('campaign') !== '') where.campaignId = single('campaign');
  if (isLeadStatus(single('status'))) where.status = single('status') as LeadStatus;
  if (single('country') !== '') where.company = { country: single('country') };
  if (isEmailStatus(single('emailStatus'))) {
    where.contact = { emailStatus: single('emailStatus') as EmailStatus };
  }
  const minScore = Number.parseInt(single('minScore'), 10);
  if (Number.isFinite(minScore)) where.score = { gte: minScore };

  const query = single('q').trim();
  if (query !== '') {
    where.OR = [
      { company: { name: { contains: query, mode: 'insensitive' } } },
      { company: { domain: { contains: query, mode: 'insensitive' } } },
      { contact: { fullName: { contains: query, mode: 'insensitive' } } },
      { contact: { email: { contains: query, mode: 'insensitive' } } },
    ];
  }

  const page = Math.max(1, Number.parseInt(single('page'), 10) || 1);

  const [leads, total, campaigns, countryRows] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        company: true,
        contact: true,
        campaign: { select: { id: true, name: true, minimumScore: true } },
        sentEmails: { select: { sentAt: true }, orderBy: { sentAt: 'desc' }, take: 1 },
        inboundEmails: { select: { receivedAt: true }, orderBy: { receivedAt: 'desc' }, take: 1 },
      },
    }),
    prisma.lead.count({ where }),
    prisma.campaign.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'desc' } }),
    prisma.company.findMany({
      where: { country: { not: null } },
      distinct: ['country'],
      select: { country: true },
      orderBy: { country: 'asc' },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (target: number): string => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === 'string' && value !== '' && key !== 'page') next.set(key, value);
    }
    next.set('page', String(target));
    return `/leads?${next.toString()}`;
  };

  return (
    <>
      <PageHeader title="Leads" description={`${total} lead(s) match the current filters.`} />

      <LeadsFilters
        campaigns={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
        statuses={LEAD_STATUSES.map((status) => ({ value: status, label: status.replace(/_/g, ' ') }))}
        emailStatuses={EMAIL_STATUSES.map((status) => ({ value: status, label: status }))}
        countries={countryRows
          .map((row) => row.country)
          .filter((country): country is string => country !== null)
          .map((country) => ({ value: country, label: country }))}
      />

      {leads.length === 0 ? (
        <Card>
          <EmptyState title="No leads match">
            Adjust the filters, or run discovery on a campaign to find new companies.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Table>
            <thead className="border-b border-border">
              <tr>
                <th className="th">Company</th>
                <th className="th">Contact</th>
                <th className="th">Country</th>
                <th className="th">Score</th>
                <th className="th">Signal</th>
                <th className="th">Campaign</th>
                <th className="th">Status</th>
                <th className="th">Email</th>
                <th className="th">Created</th>
                <th className="th">Sent</th>
                <th className="th">Reply</th>
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
                  <td className="td">{lead.company.country ?? <span className="text-fgMuted">?</span>}</td>
                  <td className="td">
                    <ScoreBadge score={lead.score} minimum={lead.campaign.minimumScore} />
                  </td>
                  <td className="td max-w-[240px] text-fgMuted">{lead.strongestSignal ?? '—'}</td>
                  <td className="td">
                    <Link href={`/campaigns/${lead.campaign.id}`} className="text-fgMuted hover:text-accent">
                      {lead.campaign.name}
                    </Link>
                  </td>
                  <td className="td">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="td">
                    {lead.contact !== null ? <EmailStatusBadge status={lead.contact.emailStatus} /> : <span className="text-fgMuted">—</span>}
                  </td>
                  <td className="td whitespace-nowrap text-xs tabular-nums text-fgMuted">
                    {lead.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="td whitespace-nowrap text-xs tabular-nums text-fgMuted">
                    {lead.sentEmails[0]?.sentAt.toISOString().slice(0, 10) ?? '—'}
                  </td>
                  <td className="td whitespace-nowrap text-xs tabular-nums text-fgMuted">
                    {lead.inboundEmails[0]?.receivedAt.toISOString().slice(0, 10) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          {pageCount > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={pageLink(page - 1)} className="btn-secondary">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-fgMuted">
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={pageLink(page + 1)} className="btn-secondary">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
