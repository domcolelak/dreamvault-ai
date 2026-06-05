'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function HomePage() {
  const t = useTranslations();
  
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">
          {t('landing.hero.title')}
        </h1>
        <p className="text-xl text-white/70 mb-8">
          {t('landing.hero.subtitle')}
        </p>
        <Link href="/login" className="gradient-button inline-block">
          {t('landing.hero.cta')}
        </Link>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">
          {t('landing.howItWorks.title')}
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="card text-center">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-xl font-semibold mb-2">
              {t('landing.howItWorks.step1.title')}
            </h3>
            <p className="text-white/70">
              {t('landing.howItWorks.step1.description')}
            </p>
          </div>
          <div className="card text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">
              {t('landing.howItWorks.step2.title')}
            </h3>
            <p className="text-white/70">
              {t('landing.howItWorks.step2.description')}
            </p>
          </div>
          <div className="card text-center">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-xl font-semibold mb-2">
              {t('landing.howItWorks.step3.title')}
            </h3>
            <p className="text-white/70">
              {t('landing.howItWorks.step3.description')}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-white/50">
        <p>{t('landing.footer.copyright')}</p>
      </footer>
    </main>
  );
}