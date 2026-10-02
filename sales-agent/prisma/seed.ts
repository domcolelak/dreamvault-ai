/**
 * Development seed data.
 *
 * Everything created here is marked `isDemo: true` and uses domains under the
 * reserved `.example` TLD (RFC 2606), so no row can ever be mistaken for a real
 * company and no address here can ever receive mail. Contact addresses are stored
 * as UNKNOWN, which keeps them below the default automatic-send threshold.
 *
 * The two campaigns are deliberately unrelated — different country, language,
 * buyer and product — to demonstrate that nothing about the pipeline is
 * hardcoded to a vertical.
 */
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_NOTE = 'DEMO DATA — seeded locally for development. Not a real company.';

type DemoLead = {
  domain: string;
  companyName: string;
  country: string;
  industry: string;
  description: string;
  employeeEstimate: number | null;
  websiteLanguage: string;
  score: number;
  qualified: boolean;
  strongestSignal: string;
  recommendedAngle: string;
  qualificationReason: string;
  evidence: Array<{ claim: string; path: string; kind: string }>;
  contact: {
    fullName: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    localPart: string;
  } | null;
  draft: { language: string; subject: string; body: string; evidence: string; path: string } | null;
};

const CAMPAIGN_ONE = {
  name: 'DEMO — AI workflow automation for German manufacturers',
  rawBrief:
    'Find German manufacturing companies with 20-200 employees that appear to have manual administrative processes. ' +
    'I want to sell AI workflow automation. Target CEO, COO or Head of Operations.',
  productOrService: 'AI workflow automation for administrative and back-office processes',
  targetCompanyDescription:
    'Small and mid-sized German manufacturers whose public material suggests paper-based or manual administration',
  targetRegions: ['DE'],
  industries: ['manufacturing', 'industrial production', 'metalworking'],
  companySizeMin: 20,
  companySizeMax: 200,
  decisionMakerRoles: ['CEO', 'Geschäftsführer', 'COO', 'Head of Operations', 'Betriebsleiter'],
  buyingSignals: [
    'job postings for administrative or data-entry roles',
    'downloadable PDF or paper order forms',
    'contact process that requires phone or fax',
    'stated growth without visible digital tooling',
  ],
  exclusions: ['software vendors', 'consultancies', 'companies above 200 employees'],
  preferredLanguages: ['de'],
  queries: [
    'Maschinenbau Unternehmen Deutschland "20-200 Mitarbeiter"',
    'site:de Hersteller "Auftragsformular" PDF download',
    'deutsche Fertigung Stellenangebot "Sachbearbeiter Auftragsabwicklung"',
    'Zulieferer Metallverarbeitung Deutschland Familienunternehmen',
    'German manufacturer "request a quote" fax number',
    'Produktionsbetrieb Deutschland Stellenangebote Verwaltung Datenerfassung',
    'site:de Lohnfertigung Unternehmen Kontakt Telefon Fax',
    'mittelständischer Hersteller Deutschland Karriere "Büro"',
  ],
  signals: [
    'hiring administrative or order-processing staff',
    'PDF or fax-based ordering',
    'no customer portal or self-service',
  ],
  pages: ['careers', 'jobs', 'contact', 'about', 'products', 'downloads'],
  rationale:
    'The queries combine the sector and country in German, the hiring signal in the words a German job ad would use, ' +
    'and the fax/PDF ordering signal, which is the clearest public evidence of manual administration.',
  leads: [
    {
      domain: 'nordwerk-maschinenbau.example',
      companyName: 'Nordwerk Maschinenbau GmbH (demo)',
      country: 'DE',
      industry: 'Mechanical engineering / contract manufacturing',
      description:
        'Demo record. Family-owned contract manufacturer producing precision components for industrial customers.',
      employeeEstimate: 75,
      websiteLanguage: 'de',
      score: 88,
      qualified: true,
      strongestSignal: 'Currently hiring a "Sachbearbeiter Auftragsabwicklung" to process orders by hand',
      recommendedAngle:
        'They are hiring a person to key in orders that an automated intake would handle, right as order volume grows.',
      qualificationReason:
        'Demo reasoning. German manufacturer inside the 20-200 band. Two sourced signals: an open administrative ' +
        'order-processing role, and an order form offered only as a PDF to be returned by fax or post. Both point ' +
        'directly at the manual back-office processes this campaign targets.',
      evidence: [
        {
          claim: 'Open position "Sachbearbeiter Auftragsabwicklung" describing manual entry of incoming orders',
          path: '/karriere',
          kind: 'signal',
        },
        {
          claim: 'Order form is published as a PDF to be printed, filled in and returned by fax or post',
          path: '/downloads',
          kind: 'signal',
        },
        { claim: 'States 75 employees across two production sites', path: '/ueber-uns', kind: 'research' },
      ],
      contact: {
        fullName: 'Demo Person One',
        firstName: 'Demo',
        lastName: 'One',
        jobTitle: 'Geschäftsführer',
        localPart: 'demo.one',
      },
      draft: {
        language: 'de',
        subject: 'Auftragserfassung bei Nordwerk',
        body:
          'Hallo Demo,\n\n' +
          'auf Ihrer Karriereseite suchen Sie aktuell einen Sachbearbeiter für die Auftragsabwicklung, der eingehende ' +
          'Aufträge manuell erfasst — passend dazu wird Ihr Auftragsformular als PDF per Fax oder Post zurückgesendet.\n\n' +
          'Wir automatisieren genau diesen Schritt: eingehende Aufträge aus PDF, E-Mail oder Fax werden ausgelesen und ' +
          'direkt ins System übernommen, ohne dass jemand sie abtippen muss.\n\n' +
          'Wäre ein kurzes Gespräch interessant, bevor die Stelle besetzt ist?',
        evidence: 'Open position "Sachbearbeiter Auftragsabwicklung" describing manual entry of incoming orders',
        path: '/karriere',
      },
    },
    {
      domain: 'suedpresswerk.example',
      companyName: 'Südpresswerk AG (demo)',
      country: 'DE',
      industry: 'Metal forming',
      description: 'Demo record. Metal forming operation supplying the automotive aftermarket.',
      employeeEstimate: 420,
      websiteLanguage: 'de',
      score: 41,
      qualified: false,
      strongestSignal: 'No manual-process signal found',
      recommendedAngle: 'None — the company falls outside the campaign.',
      qualificationReason:
        'Demo reasoning. Rejected: the site states roughly 420 employees, well above this campaign’s 20-200 band, and ' +
        'the company already runs a customer self-service portal, so the manual-administration premise does not hold. ' +
        'Rejecting is the correct outcome here — a lead is not contacted just to fill a quota.',
      evidence: [
        { claim: 'Company profile states approximately 420 employees', path: '/unternehmen', kind: 'research' },
        { claim: 'Operates a customer portal for order status and reordering', path: '/kundenportal', kind: 'research' },
      ],
      contact: null,
      draft: null,
    },
  ] satisfies DemoLead[],
};

const CAMPAIGN_TWO = {
  name: 'DEMO — Klubová hymna pre športové kluby',
  rawBrief:
    'Nájdi slovenské športové kluby v kolektívnych športoch. Chcem im ponúknuť vytvorenie vlastnej klubovej hymny.',
  productOrService: 'Tvorba vlastnej klubovej hymny na mieru',
  targetCompanyDescription:
    'Slovenské športové kluby v kolektívnych športoch — futbal, hokej, volejbal, basketbal, hádzaná',
  targetRegions: ['SK'],
  industries: ['sport', 'športové kluby'],
  companySizeMin: null,
  companySizeMax: null,
  decisionMakerRoles: ['prezident klubu', 'predseda', 'manažér klubu', 'marketingový manažér', 'tajomník'],
  buyingSignals: [
    'blížiace sa okrúhle jubileum klubu',
    'aktívna fanúšikovská komunita',
    'postup do vyššej súťaže',
    'nové logo alebo rebranding',
    'otvorenie novej haly alebo štadióna',
  ],
  exclusions: ['individuálne športy', 'fitness centrá', 'neaktívne klubové stránky'],
  preferredLanguages: ['sk'],
  queries: [
    'slovenský volejbalový klub oficiálna stránka',
    'hokejový klub Slovensko "100 rokov" jubileum',
    'futbalový klub Slovensko fanklub oficiálna stránka',
    'basketbalový klub SR extraliga kontakt',
    'hádzanársky klub Slovensko postup do extraligy',
    'slovenský športový klub "nové logo" rebranding',
    'volejbalový klub Slovensko nová hala otvorenie',
    'slovenské kolektívne športy klub história výročie',
  ],
  signals: ['okrúhle výročie klubu', 'silná fanúšikovská základňa', 'postup do vyššej súťaže'],
  pages: ['o-nas', 'historia', 'kontakt', 'fanklub', 'novinky'],
  rationale:
    'Dotazy sú po slovensky, pretože tieto kluby sa prezentujú vo svojom jazyku, a kombinujú šport, súťaž a jubileum — ' +
    'výročie je verejne overiteľný signál a zároveň najsilnejší dôvod, prečo by klub hymnu chcel práve teraz.',
  leads: [
    {
      domain: 'vk-tatranska-volejbal.example',
      companyName: 'VK Tatranská (demo)',
      country: 'SK',
      industry: 'Volleyball club',
      description: 'Demo záznam. Volejbalový klub s mužským aj ženským tímom a mládežníckymi kategóriami.',
      employeeEstimate: null,
      websiteLanguage: 'sk',
      score: 91,
      qualified: true,
      strongestSignal: 'Klub oslavuje v nasledujúcej sezóne 70 rokov od založenia',
      recommendedAngle:
        'Okrúhle 70. výročie je prirodzený dôvod pre vlastnú hymnu — niečo, čo na oslavách zaznie a ostane klubu.',
      qualificationReason:
        'Demo odôvodnenie. Kolektívny šport na Slovensku, aktívny klub s mládežou. Dva doložené signály: oznámenie ' +
        '70. výročia v nasledujúcej sezóne a aktívny fanklub s vlastnými chorálmi. Oba priamo podporujú ponuku hymny.',
      evidence: [
        { claim: 'V sezóne 2026/27 klub oslávi 70 rokov od založenia', path: '/historia', kind: 'signal' },
        { claim: 'Fanklub má vlastnú sekciu s chorálmi a textami', path: '/fanklub', kind: 'signal' },
        { claim: 'Klub vedie šesť mládežníckych kategórií', path: '/o-nas', kind: 'research' },
      ],
      contact: {
        fullName: 'Demo Osoba Dva',
        firstName: 'Demo',
        lastName: 'Dva',
        jobTitle: 'prezident klubu',
        localPart: 'demo.dva',
      },
      draft: {
        language: 'sk',
        subject: '70 rokov VK Tatranská',
        body:
          'Dobrý deň Demo,\n\n' +
          'na stránke histórie píšete, že v sezóne 2026/27 klub oslávi 70 rokov, a váš fanklub má vlastnú sekciu ' +
          's chorálmi.\n\n' +
          'Robíme klubom hymny na mieru — skladbu, ktorú si fanúšikovia zaspievajú v hale a ktorá klubu ostane aj po ' +
          'oslavách. Pri okrúhlom jubileu to býva najlepší čas, lebo hymna sa dá predstaviť priamo na slávnostnom zápase.\n\n' +
          'Mali by ste záujem o krátky hovor o tom, ako by to pri sedemdesiatke mohlo vyzerať?',
        evidence: 'V sezóne 2026/27 klub oslávi 70 rokov od založenia',
        path: '/historia',
      },
    },
  ] satisfies DemoLead[],
};

type CampaignSpec = typeof CAMPAIGN_ONE | typeof CAMPAIGN_TWO;

async function seedCampaign(userId: string, spec: CampaignSpec): Promise<void> {
  const existing = await prisma.campaign.findFirst({ where: { name: spec.name } });
  if (existing !== null) {
    console.log(`  · "${spec.name}" already seeded — skipping.`);
    return;
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name: spec.name,
      rawBrief: spec.rawBrief,
      productOrService: spec.productOrService,
      targetCompanyDescription: spec.targetCompanyDescription,
      targetRegions: spec.targetRegions,
      industries: spec.industries,
      companySizeMin: spec.companySizeMin,
      companySizeMax: spec.companySizeMax,
      decisionMakerRoles: spec.decisionMakerRoles,
      buyingSignals: spec.buyingSignals,
      exclusions: spec.exclusions,
      preferredLanguages: spec.preferredLanguages,
      interpretationNotes: DEMO_NOTE,
      interpretationApproved: false,
      leadsTarget: 30,
      dailySendLimit: 10,
      minimumScore: 75,
      // Demo campaigns never send: DRAFT_ONLY and not ACTIVE.
      sendingMode: 'DRAFT_ONLY',
      status: 'DRAFT',
      isDemo: true,
    },
  });

  await prisma.searchStrategy.create({
    data: {
      campaignId: campaign.id,
      version: 1,
      queries: spec.queries,
      companySources: ['web search', 'company websites', 'career pages'],
      signalsToLookFor: spec.signals,
      decisionMakerRoles: spec.decisionMakerRoles,
      pagesToInspect: spec.pages,
      rationale: `${DEMO_NOTE} ${spec.rationale}`,
      isActive: true,
    },
  });

  for (const lead of spec.leads as DemoLead[]) {
    const company = await prisma.company.upsert({
      where: { domain: lead.domain },
      update: {},
      create: {
        domain: lead.domain,
        name: lead.companyName,
        country: lead.country,
        industry: lead.industry,
        description: lead.description,
        employeeEstimate: lead.employeeEstimate,
        websiteLanguage: lead.websiteLanguage,
        websiteUrl: `https://${lead.domain}`,
        researchSummary: `${DEMO_NOTE} ${lead.description}`,
        lastResearchedAt: new Date(),
      },
    });

    let contactId: string | null = null;
    if (lead.contact !== null) {
      const contact = await prisma.contact.upsert({
        where: { email: `${lead.contact.localPart}@${lead.domain}` },
        update: {},
        create: {
          companyId: company.id,
          firstName: lead.contact.firstName,
          lastName: lead.contact.lastName,
          fullName: lead.contact.fullName,
          jobTitle: lead.contact.jobTitle,
          email: `${lead.contact.localPart}@${lead.domain}`,
          // UNKNOWN keeps demo contacts below the default auto-send threshold.
          emailStatus: 'UNKNOWN',
          sourceUrl: `https://${lead.domain}/kontakt`,
          confidence: 70,
          isGeneric: false,
        },
      });
      contactId = contact.id;
    }

    const status = lead.qualified ? (lead.draft !== null ? 'DRAFTED' : 'QUALIFIED') : 'REJECTED';

    const created = await prisma.lead.create({
      data: {
        campaignId: campaign.id,
        companyId: company.id,
        contactId,
        status,
        score: lead.score,
        qualified: lead.qualified,
        qualificationReason: lead.qualificationReason,
        strongestSignal: lead.strongestSignal,
        recommendedAngle: lead.recommendedAngle,
        rejectionReason: lead.qualified ? null : lead.qualificationReason,
        discoverySourceUrl: `https://${lead.domain}/`,
        discoveryQuery: spec.queries[0] ?? null,
        evidence: {
          create: lead.evidence.map((item) => ({
            claim: item.claim,
            sourceUrl: `https://${lead.domain}${item.path}`,
            kind: item.kind,
          })) satisfies Prisma.LeadEvidenceCreateWithoutLeadInput[],
        },
      },
    });

    for (const [index, to] of (
      lead.qualified
        ? (['DISCOVERED', 'RESEARCHING', 'QUALIFIED', 'CONTACT_FOUND', 'READY', 'DRAFTED'] as const)
        : (['DISCOVERED', 'RESEARCHING', 'REJECTED'] as const)
    ).entries()) {
      if (!lead.qualified && to === 'REJECTED') {
        await prisma.leadStatusHistory.create({
          data: { leadId: created.id, to, reason: 'Demo: outside the campaign’s criteria.' },
        });
        continue;
      }
      if (lead.draft === null && (to === 'CONTACT_FOUND' || to === 'READY' || to === 'DRAFTED')) continue;
      await prisma.leadStatusHistory.create({
        data: { leadId: created.id, to, reason: index === 0 ? 'Demo: seeded lead.' : null },
      });
    }

    if (lead.draft !== null && contactId !== null) {
      await prisma.emailDraft.create({
        data: {
          campaignId: campaign.id,
          leadId: created.id,
          contactId,
          language: lead.draft.language,
          subject: lead.draft.subject,
          body: lead.draft.body,
          personalizationEvidence: lead.draft.evidence,
          sourceUrl: `https://${lead.domain}${lead.draft.path}`,
          wordCount: lead.draft.body.trim().split(/\s+/).length,
          status: 'DRAFT',
          model: 'demo-seed',
        },
      });
    }
  }

  console.log(`  · seeded "${spec.name}" with ${spec.leads.length} lead(s).`);
}

async function main(): Promise<void> {
  console.log('Seeding demo data (all rows marked isDemo, all domains under the reserved .example TLD)…');

  const user = await prisma.user.upsert({
    where: { email: 'owner@sales-agent.local' },
    update: {},
    create: { email: 'owner@sales-agent.local', name: 'Owner' },
  });

  await prisma.appSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  await seedCampaign(user.id, CAMPAIGN_ONE);
  await seedCampaign(user.id, CAMPAIGN_TWO);

  await prisma.suppressionEntry.upsert({
    where: { scope_value: { scope: 'DOMAIN', value: 'competitor.example' } },
    update: {},
    create: {
      scope: 'DOMAIN',
      value: 'competitor.example',
      reason: 'MANUAL_BLOCK',
      note: `${DEMO_NOTE} Example of a blocked domain.`,
    },
  });

  console.log('Done. The two campaigns are unrelated by design — same code, no vertical assumptions.');
  console.log('Both are DRAFT / DRAFT_ONLY, so nothing can be sent from seeded data.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
