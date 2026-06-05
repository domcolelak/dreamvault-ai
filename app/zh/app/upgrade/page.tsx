'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleUpgrade = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      alert('Failed to start checkout');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <main className="min-h-screen">
      <nav className="border-b border-white/10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold">DreamVault AI</div>
          <div className="flex items-center space-x-6">
            <Link href="/app" className="text-white/80 hover:text-white transition-colors">
              Analyze
            </Link>
            <Link href="/app/journal" className="text-white/80 hover:text-white transition-colors">
              Journal
            </Link>
            <button onClick={handleLogout} className="text-white/80 hover:text-white transition-colors">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">Upgrade to Premium</h1>
          <p className="text-xl text-white/70">
            Unlock the full potential of your dream analysis
          </p>
        </div>

        <div className="card bg-gradient-to-br from-accent/20 to-blue-500/20 border-accent/30">
          <div className="text-center mb-8">
            <div className="text-6xl font-bold mb-2">€4.99</div>
            <div className="text-xl text-white/70">per month</div>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex items-start">
              <div className="text-accent text-2xl mr-4">✓</div>
              <div>
                <div className="font-semibold">Full Psychological Analysis</div>
                <div className="text-white/70">Deep dive into your subconscious with comprehensive interpretations</div>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-accent text-2xl mr-4">✓</div>
              <div>
                <div className="font-semibold">HD Dream Visualizations</div>
                <div className="text-white/70">Full 1024x1024 resolution AI-generated images</div>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-accent text-2xl mr-4">✓</div>
              <div>
                <div className="font-semibold">Download & Share</div>
                <div className="text-white/70">Save your visualizations and share with others</div>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-accent text-2xl mr-4">✓</div>
              <div>
                <div className="font-semibold">5 Images Per Day</div>
                <div className="text-white/70">Generate up to 5 dream visualizations daily</div>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-accent text-2xl mr-4">✓</div>
              <div>
                <div className="font-semibold">Unlimited Journal Storage</div>
                <div className="text-white/70">Save all your dreams and analyses forever</div>
              </div>
            </div>
          </div>

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="gradient-button w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Upgrade Now'}
          </button>

          <p className="text-center text-white/60 text-sm mt-6">
            Cancel anytime. No questions asked.
          </p>
        </div>

        <div className="mt-12 text-center">
          <Link href="/app" className="text-accent hover:underline">
            ← Back to App
          </Link>
        </div>
      </div>
    </main>
  );
}
