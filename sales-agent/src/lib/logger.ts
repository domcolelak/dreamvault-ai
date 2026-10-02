import type { AgentLogType, Prisma } from '@prisma/client';
import { prisma } from './db';

type LogInput = {
  type: AgentLogType;
  summary: string;
  campaignId?: string | null;
  leadId?: string | null;
  runId?: string | null;
  inputSummary?: string | null;
  output?: Prisma.InputJsonValue | null;
  model?: string | null;
  provider?: string | null;
  durationMs?: number | null;
  error?: string | null;
};

/**
 * Writes an auditable agent decision. Logging must never break the pipeline,
 * so failures here are swallowed after being reported to stderr.
 */
export async function logAgent(input: LogInput): Promise<void> {
  try {
    await prisma.agentLog.create({
      data: {
        type: input.type,
        summary: input.summary.slice(0, 2000),
        campaignId: input.campaignId ?? null,
        leadId: input.leadId ?? null,
        runId: input.runId ?? null,
        inputSummary: input.inputSummary?.slice(0, 4000) ?? null,
        output: input.output ?? undefined,
        model: input.model ?? null,
        provider: input.provider ?? null,
        durationMs: input.durationMs ?? null,
        error: input.error?.slice(0, 4000) ?? null,
      },
    });
  } catch (error) {
    console.error('[agent-log] failed to persist log entry', error);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
