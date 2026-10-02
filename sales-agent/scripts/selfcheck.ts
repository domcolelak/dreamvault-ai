/**
 * Verifies the safety guarantees of an installation against the real database.
 *
 *   npm run selfcheck
 *
 * It asserts the invariants the application promises: nothing is sent without a
 * reviewed, active, AUTOMATIC campaign; suppressed and already-contacted people
 * are never emailed; a reply stops all automation; fabricated email addresses are
 * discarded; and the job queue does not run a job twice.
 *
 * It creates its own throwaway rows under the reserved `.invalid` TLD and deletes
 * them afterwards. It never sends an email: SMTP is deliberately never reached,
 * because every scenario is expected to be refused before that point.
 */
import { applyReplyStop, checkCanContact } from '../src/lib/agent/dedup';
import { claimNextJob, completeJob, enqueueJob } from '../src/lib/agent/jobs';
import { validateBeforeSend } from '../src/lib/agent/validation';
import { prisma } from '../src/lib/db';
import { checkEmailQuality } from '../src/lib/tools/writeEmail';
import { startOfLocalDay } from '../src/lib/agent/rate-limit';

const TAG = 'selfcheck.invalid';
let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail !== '' ? ` — ${detail}` : ''}`);
  }
}

function hasCode(failures: Array<{ code: string }>, code: string): boolean {
  return failures.some((failure) => failure.code === code);
}

async function cleanup(): Promise<void> {
  await prisma.suppressionEntry.deleteMany({ where: { value: { contains: TAG } } });
  await prisma.campaign.deleteMany({ where: { rawBrief: { contains: TAG } } });
  await prisma.company.deleteMany({ where: { domain: { contains: TAG } } });
  await prisma.job.deleteMany({ where: { idempotencyKey: { startsWith: 'selfcheck:' } } });
}

async function main(): Promise<void> {
  console.log('Sales Agent self-check — verifying the safety gates against the live database.\n');
  await cleanup();

  // --- Fixture: a fully qualified, reviewed, active, AUTOMATIC lead with a draft.
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (user === null) throw new Error('No user row. Run `npm run seed` first.');

  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      name: 'SELFCHECK (temporary)',
      rawBrief: `Temporary self-check campaign for ${TAG}. Deleted automatically.`,
      productOrService: 'nothing',
      targetCompanyDescription: 'nothing',
      decisionMakerRoles: ['CEO'],
      status: 'ACTIVE',
      sendingMode: 'AUTOMATIC',
      interpretationApproved: true,
      minimumScore: 75,
      dailySendLimit: 10,
    },
  });
  const company = await prisma.company.create({
    data: { domain: `acme.${TAG}`, name: 'Acme Selfcheck', country: 'SK' },
  });
  const contact = await prisma.contact.create({
    data: {
      companyId: company.id,
      fullName: 'Test Person',
      firstName: 'Test',
      jobTitle: 'CEO',
      email: `test@acme.${TAG}`,
      emailStatus: 'VERIFIED',
    },
  });
  const lead = await prisma.lead.create({
    data: {
      campaignId: campaign.id,
      companyId: company.id,
      contactId: contact.id,
      status: 'DRAFTED',
      score: 90,
      qualified: true,
      evidence: {
        create: [{ claim: 'They published a hiring page for an operations role', sourceUrl: `https://acme.${TAG}/jobs`, kind: 'signal' }],
      },
    },
  });
  const draft = await prisma.emailDraft.create({
    data: {
      campaignId: campaign.id,
      leadId: lead.id,
      contactId: contact.id,
      language: 'en',
      subject: 'your operations hiring',
      body:
        'Hello Test,\n\nYou published a hiring page for an operations role, which usually means the admin load has outgrown the team. ' +
        'We take the repetitive part of that work off the rota so a new hire starts on the interesting half instead of data entry. ' +
        'Would a short call next week be useful before the role is filled?',
      personalizationEvidence: 'They published a hiring page for an operations role',
      sourceUrl: `https://acme.${TAG}/jobs`,
      status: 'DRAFT',
    },
  });

  const load = async () => {
    const fresh = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: { company: true, contact: true },
    });
    const freshCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    const freshDraft = await prisma.emailDraft.findUnique({ where: { id: draft.id } });
    if (fresh === null || freshCampaign === null || freshDraft === null) throw new Error('fixture vanished');
    return { lead: fresh, campaign: freshCampaign, draft: freshDraft };
  };

  // --- 1. The happy path must be the ONLY path that validates. ---------------
  console.log('Pre-send validation');
  {
    const fixture = await load();
    const result = await validateBeforeSend(fixture);
    // SMTP is intentionally unconfigured in a test environment, so the only
    // remaining objection must be the mailbox itself.
    const onlySmtp =
      !result.allowed &&
      result.failures.every((failure) => failure.code === 'SMTP_NOT_CONFIGURED' || failure.code === 'NO_SENDER_EMAIL');
    check(
      'a reviewed, active, AUTOMATIC, qualified lead passes every check except mailbox config',
      result.allowed || onlySmtp,
      result.allowed ? '' : result.failures.map((f) => f.code).join(', '),
    );
  }

  // --- 2. Each guard must independently block. --------------------------------
  const guards: Array<{ name: string; code: string; apply: () => Promise<void>; revert: () => Promise<void> }> = [
    {
      name: 'a PAUSED campaign cannot send',
      code: 'CAMPAIGN_NOT_ACTIVE',
      apply: async () => void (await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } })),
      revert: async () => void (await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'ACTIVE' } })),
    },
    {
      name: 'a DRAFT_ONLY campaign cannot send',
      code: 'SENDING_MODE_NOT_AUTOMATIC',
      apply: async () =>
        void (await prisma.campaign.update({ where: { id: campaign.id }, data: { sendingMode: 'DRAFT_ONLY' } })),
      revert: async () =>
        void (await prisma.campaign.update({ where: { id: campaign.id }, data: { sendingMode: 'AUTOMATIC' } })),
    },
    {
      name: 'an unreviewed interpretation cannot send',
      code: 'INTERPRETATION_NOT_REVIEWED',
      apply: async () =>
        void (await prisma.campaign.update({ where: { id: campaign.id }, data: { interpretationApproved: false } })),
      revert: async () =>
        void (await prisma.campaign.update({ where: { id: campaign.id }, data: { interpretationApproved: true } })),
    },
    {
      name: 'a score below the campaign minimum cannot send',
      code: 'BELOW_MINIMUM_SCORE',
      apply: async () => void (await prisma.lead.update({ where: { id: lead.id }, data: { score: 40 } })),
      revert: async () => void (await prisma.lead.update({ where: { id: lead.id }, data: { score: 90 } })),
    },
    {
      name: 'an unqualified lead cannot send',
      code: 'LEAD_NOT_QUALIFIED',
      apply: async () => void (await prisma.lead.update({ where: { id: lead.id }, data: { qualified: false } })),
      revert: async () => void (await prisma.lead.update({ where: { id: lead.id }, data: { qualified: true } })),
    },
    {
      name: 'a stopped lead cannot send',
      code: 'AUTOMATION_STOPPED',
      apply: async () => void (await prisma.lead.update({ where: { id: lead.id }, data: { automationStopped: true } })),
      revert: async () => void (await prisma.lead.update({ where: { id: lead.id }, data: { automationStopped: false } })),
    },
    {
      name: 'an INVALID address cannot send',
      code: 'EMAIL_INVALID',
      apply: async () => void (await prisma.contact.update({ where: { id: contact.id }, data: { emailStatus: 'INVALID' } })),
      revert: async () =>
        void (await prisma.contact.update({ where: { id: contact.id }, data: { emailStatus: 'VERIFIED' } })),
    },
    {
      name: 'an untrusted address status (GUESSED) cannot auto-send',
      code: 'EMAIL_STATUS_NOT_TRUSTED',
      apply: async () => void (await prisma.contact.update({ where: { id: contact.id }, data: { emailStatus: 'GUESSED' } })),
      revert: async () =>
        void (await prisma.contact.update({ where: { id: contact.id }, data: { emailStatus: 'VERIFIED' } })),
    },
    {
      name: 'a suppressed address cannot send',
      code: 'SUPPRESSED_EMAIL',
      apply: async () => {
        await prisma.suppressionEntry.create({
          data: { scope: 'EMAIL', value: `test@acme.${TAG}`, reason: 'OPT_OUT' },
        });
      },
      revert: async () => {
        await prisma.suppressionEntry.deleteMany({ where: { value: `test@acme.${TAG}` } });
      },
    },
    {
      name: 'a suppressed domain cannot send',
      code: 'SUPPRESSED_DOMAIN',
      apply: async () => {
        await prisma.suppressionEntry.create({ data: { scope: 'DOMAIN', value: `acme.${TAG}`, reason: 'COMPLAINT' } });
      },
      revert: async () => {
        await prisma.suppressionEntry.deleteMany({ where: { value: `acme.${TAG}` } });
      },
    },
    {
      name: 'a contact under a global do-not-auto-contact hold cannot send',
      code: 'GLOBAL_DO_NOT_AUTO_CONTACT',
      apply: async () =>
        void (await prisma.contact.update({ where: { id: contact.id }, data: { globalDoNotAutoContact: true } })),
      revert: async () =>
        void (await prisma.contact.update({ where: { id: contact.id }, data: { globalDoNotAutoContact: false } })),
    },
    {
      name: 'a blocked draft cannot send',
      code: 'DRAFT_BLOCKED',
      apply: async () =>
        void (await prisma.emailDraft.update({ where: { id: draft.id }, data: { status: 'BLOCKED', blockReason: 'test' } })),
      revert: async () =>
        void (await prisma.emailDraft.update({ where: { id: draft.id }, data: { status: 'DRAFT', blockReason: null } })),
    },
    {
      name: 'a draft with no sourced evidence cannot send',
      code: 'NO_SOURCED_EVIDENCE',
      apply: async () => {
        await prisma.leadEvidence.updateMany({ where: { leadId: lead.id }, data: { sourceUrl: null } });
      },
      revert: async () => {
        await prisma.leadEvidence.updateMany({
          where: { leadId: lead.id },
          data: { sourceUrl: `https://acme.${TAG}/jobs` },
        });
      },
    },
  ];

  for (const guard of guards) {
    await guard.apply();
    const result = await validateBeforeSend(await load());
    check(guard.name, !result.allowed && hasCode(result.failures, guard.code), !result.allowed ? result.failures.map((f) => f.code).join(', ') : 'was allowed');
    await guard.revert();
  }

  // --- 3. Content guards on the draft body. -----------------------------------
  console.log('\nEmail content guards');
  const evidence = [{ claim: 'They published a hiring page', sourceUrl: 'https://acme.invalid/jobs' }];
  const base = {
    language: 'en',
    subject: 'your hiring',
    personalizationEvidence: 'They published a hiring page',
    sourceUrl: 'https://acme.invalid/jobs',
  };
  const longBody = 'Hello there, this is a perfectly ordinary sentence about their hiring page. '.repeat(5);

  check(
    'a banned filler phrase is rejected',
    checkEmailQuality({ ...base, body: `I hope this email finds you well. ${longBody}` }, evidence).some(
      (issue) => issue.code === 'BANNED_PHRASE',
    ),
  );
  check(
    'an unfilled placeholder is rejected',
    checkEmailQuality({ ...base, body: `Hello [First Name], ${longBody}` }, evidence).some(
      (issue) => issue.code === 'PLACEHOLDER',
    ),
  );
  check(
    'a body with no evidence at all is rejected',
    checkEmailQuality({ ...base, body: longBody }, []).some((issue) => issue.code === 'NO_EVIDENCE'),
  );
  check(
    'a source URL we do not hold is rejected',
    checkEmailQuality(
      { ...base, sourceUrl: 'https://somewhere-else.invalid/made-up', personalizationEvidence: 'something else', body: longBody },
      evidence,
    ).some((issue) => issue.code === 'UNKNOWN_SOURCE_URL'),
  );
  check(
    'HTML markup in the body is rejected',
    checkEmailQuality({ ...base, body: `<p>Hello</p> ${longBody}` }, evidence).some((issue) => issue.code === 'MARKUP'),
  );
  check('a clean body passes', checkEmailQuality({ ...base, body: longBody }, evidence).length === 0);

  // --- 4. Deduplication. -------------------------------------------------------
  console.log('\nDeduplication');
  {
    const verdict = await checkCanContact({
      campaignId: campaign.id,
      contactId: contact.id,
      email: `test@acme.${TAG}`,
      companyDomain: `acme.${TAG}`,
    });
    check('a fresh contact is allowed', verdict.allowed, verdict.code);
  }
  {
    // Record a send, then confirm the same person and the same company are closed.
    await prisma.sentEmail.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        contactId: contact.id,
        messageId: `<selfcheck-${Date.now()}@${TAG}>`,
        recipient: `test@acme.${TAG}`,
        fromEmail: `sender@${TAG}`,
        subject: 'x',
        body: 'x',
      },
    });
    const again = await checkCanContact({
      campaignId: campaign.id,
      contactId: contact.id,
      email: `test@acme.${TAG}`,
      companyDomain: `acme.${TAG}`,
    });
    check('the same person is not contacted twice', !again.allowed && again.code === 'ALREADY_CONTACTED_IN_CAMPAIGN', again.code);

    const colleague = await prisma.contact.create({
      data: { companyId: company.id, fullName: 'Second Person', email: `second@acme.${TAG}`, emailStatus: 'VERIFIED' },
    });
    const sameCompany = await checkCanContact({
      campaignId: campaign.id,
      contactId: colleague.id,
      email: `second@acme.${TAG}`,
      companyDomain: `acme.${TAG}`,
    });
    check(
      'a second person at an already-contacted company is not contacted',
      !sameCompany.allowed && sameCompany.code === 'DOMAIN_ALREADY_CONTACTED_IN_CAMPAIGN',
      sameCompany.code,
    );
  }

  // --- 5. A reply stops everything. -------------------------------------------
  console.log('\nReply handling');
  {
    await applyReplyStop(contact.id, `test@acme.${TAG}`, new Date());
    const updated = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    const suppressed = await prisma.suppressionEntry.findFirst({ where: { value: `test@acme.${TAG}` } });

    check('a reply sets the contact to REPLIED', updated.status === 'REPLIED');
    check('a reply sets the global do-not-auto-contact hold', updated.globalDoNotAutoContact);
    check('a reply stops automation on the lead', updatedLead.automationStopped);
    check('a reply suppresses the address', suppressed !== null && suppressed.reason === 'REPLIED');

    const after = await validateBeforeSend(await load());
    check('nothing can be sent to a contact who replied', !after.allowed, after.allowed ? 'was allowed' : '');
  }

  // --- 6. Job queue. -----------------------------------------------------------
  console.log('\nJob queue');
  {
    const first = await enqueueJob({ type: 'IMAP_SYNC', idempotencyKey: 'selfcheck:idem' });
    const second = await enqueueJob({ type: 'IMAP_SYNC', idempotencyKey: 'selfcheck:idem' });
    check('enqueueing the same idempotency key twice yields one job', first.id === second.id);

    const claimed = await claimNextJob(['IMAP_SYNC']);
    check('a due job can be claimed', claimed !== null && claimed.id === first.id);
    const twice = await claimNextJob(['IMAP_SYNC']);
    check('a claimed job is not handed out again', twice === null || twice.id !== first.id);
    if (claimed !== null) await completeJob(claimed.id);
  }

  // --- 7. Day boundary in the configured timezone. ----------------------------
  console.log('\nTimezone handling');
  for (const zone of ['Europe/Bratislava', 'America/Los_Angeles', 'Asia/Kolkata', 'UTC']) {
    const now = new Date();
    const start = startOfLocalDay(now, zone);
    const local = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, dateStyle: 'short', timeStyle: 'short', hour12: false });
    check(
      `the day boundary is midnight local time in ${zone}`,
      local.format(start).endsWith('00:00') && start <= now,
      local.format(start),
    );
  }

  await cleanup();

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(async (error: unknown) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
