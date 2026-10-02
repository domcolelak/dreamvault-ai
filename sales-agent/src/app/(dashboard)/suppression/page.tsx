import { addSuppressionAction, removeSuppressionAction } from '@/app/actions/system';
import { ActionButton } from '@/components/action-button';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, EmptyState, Field, PageHeader, Table } from '@/components/ui';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const REASONS = ['OPT_OUT', 'REPLIED', 'MANUAL_BLOCK', 'BOUNCE', 'COMPLAINT', 'OTHER'] as const;

export default async function SuppressionPage() {
  const entries = await prisma.suppressionEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });

  return (
    <>
      <PageHeader
        title="Suppression"
        description="Nothing is ever sent to an address or domain on this list. Replies are added here automatically."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr,1.6fr]">
        <Card title="Add an entry">
          <ActionForm action={addSuppressionAction} submitLabel="Add to suppression list">
            <div className="space-y-4">
              <Field label="Scope">
                <select name="scope" className="input" defaultValue="EMAIL">
                  <option value="EMAIL">Email address</option>
                  <option value="DOMAIN">Whole domain</option>
                </select>
              </Field>
              <Field label="Value" hint="An address like person@example.com, or a bare domain like example.com.">
                <input name="value" required className="input" placeholder="person@example.com" />
              </Field>
              <Field label="Reason">
                <select name="reason" className="input" defaultValue="MANUAL_BLOCK">
                  {REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Note">
                <input name="note" className="input" placeholder="Optional context" />
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card title={`Entries (${entries.length})`} description="Checked at draft time and again immediately before every send.">
          {entries.length === 0 ? (
            <EmptyState title="Suppression list is empty" />
          ) : (
            <Table className="border-0">
              <thead className="border-b border-border">
                <tr>
                  <th className="th">Value</th>
                  <th className="th">Scope</th>
                  <th className="th">Reason</th>
                  <th className="th">Note</th>
                  <th className="th">Added</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-surfaceMuted">
                    <td className="td font-mono text-xs">{entry.value}</td>
                    <td className="td">
                      <Badge tone="neutral">{entry.scope}</Badge>
                    </td>
                    <td className="td">
                      <Badge tone={entry.reason === 'REPLIED' ? 'good' : 'warn'}>{entry.reason.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="td max-w-[260px] text-xs text-fgMuted">{entry.note ?? '—'}</td>
                    <td className="td whitespace-nowrap text-xs tabular-nums text-fgMuted">
                      {entry.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="td text-right">
                      <ActionButton
                        variant="ghost"
                        confirm={`Remove ${entry.value} from the suppression list?`}
                        action={removeSuppressionAction.bind(null, entry.id)}
                      >
                        Remove
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
