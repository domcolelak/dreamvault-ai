import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createLLMProvider } from '@/lib/llm';
import { errorMessage } from '@/lib/logger';
import { getEmailProvider } from '@/lib/providers/email';
import { imapStatus } from '@/lib/providers/imap/client';
import { createEnrichmentProvider } from '@/lib/providers/enrichment';
import { createSearchProvider } from '@/lib/providers/search';
import { createVerificationProvider } from '@/lib/providers/verification';
import { resolveSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Configuration report. Never includes a credential, only whether one is present. */
export async function GET(): Promise<NextResponse> {
  let database: { ok: boolean; detail: string };
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true, detail: 'Connected.' };
  } catch (error) {
    return NextResponse.json(
      { ok: false, database: { ok: false, detail: errorMessage(error) } },
      { status: 503 },
    );
  }

  const settings = await resolveSettings();
  const llm = createLLMProvider({
    provider: settings.llmProvider,
    model: settings.llmModel,
    baseUrl: settings.llmBaseUrl,
  });
  const smtp = getEmailProvider();

  return NextResponse.json({
    ok: true,
    database,
    llm: { provider: llm.name, model: settings.llmModel, configured: settings.llmModel !== null },
    search: createSearchProvider(settings.searchProvider).status(),
    verification: createVerificationProvider(settings.verificationProvider).status(),
    enrichment: createEnrichmentProvider(settings.enrichmentProvider).status(),
    smtp: smtp.status(),
    imap: imapStatus(),
  });
}
