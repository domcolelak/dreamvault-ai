import type { CampaignStatus, DraftStatus, EmailStatus, JobStatus, LeadStatus, SendingMode } from '@prisma/client';
import { Badge } from './ui';

type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad' | 'accent';

const LEAD_TONES: Record<LeadStatus, Tone> = {
  DISCOVERED: 'neutral',
  RESEARCHING: 'info',
  QUALIFIED: 'accent',
  REJECTED: 'neutral',
  CONTACT_FOUND: 'info',
  READY: 'accent',
  DRAFTED: 'info',
  SENT: 'good',
  REPLIED: 'good',
  MANUAL: 'warn',
  FAILED: 'bad',
  DO_NOT_CONTACT: 'bad',
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD_TONES[status]}>{status.replace(/_/g, ' ')}</Badge>;
}

const EMAIL_TONES: Record<EmailStatus, Tone> = {
  VERIFIED: 'good',
  VALID: 'good',
  UNKNOWN: 'warn',
  GUESSED: 'warn',
  INVALID: 'bad',
};

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <Badge tone={EMAIL_TONES[status]}>{status}</Badge>;
}

const CAMPAIGN_TONES: Record<CampaignStatus, Tone> = {
  DRAFT: 'neutral',
  ACTIVE: 'good',
  PAUSED: 'warn',
  COMPLETED: 'info',
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_TONES[status]}>{status}</Badge>;
}

export function SendingModeBadge({ mode }: { mode: SendingMode }) {
  return (
    <Badge tone={mode === 'AUTOMATIC' ? 'accent' : 'neutral'}>
      {mode === 'AUTOMATIC' ? 'AUTOMATIC SENDING' : 'DRAFT ONLY'}
    </Badge>
  );
}

const DRAFT_TONES: Record<DraftStatus, Tone> = {
  DRAFT: 'info',
  APPROVED: 'accent',
  SENT: 'good',
  DISCARDED: 'neutral',
  BLOCKED: 'bad',
};

export function DraftStatusBadge({ status }: { status: DraftStatus }) {
  return <Badge tone={DRAFT_TONES[status]}>{status}</Badge>;
}

const JOB_TONES: Record<JobStatus, Tone> = {
  PENDING: 'neutral',
  RUNNING: 'info',
  SUCCEEDED: 'good',
  FAILED: 'bad',
  CANCELLED: 'neutral',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_TONES[status]}>{status}</Badge>;
}

export function ScoreBadge({ score, minimum }: { score: number | null; minimum?: number }) {
  if (score === null) return <span className="text-sm text-fgMuted">—</span>;
  const tone: Tone = minimum !== undefined && score < minimum ? 'warn' : score >= 85 ? 'good' : 'accent';
  return <Badge tone={tone}>{score}</Badge>;
}

export function ConfiguredBadge({ configured }: { configured: boolean }) {
  return <Badge tone={configured ? 'good' : 'warn'}>{configured ? 'Configured' : 'Not configured'}</Badge>;
}
