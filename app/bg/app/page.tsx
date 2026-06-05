'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface Profile {
  is_premium: boolean;
}

interface UsageLimit {
  analysis_count: number;
  image_count: number;
}

export default function AppPage() {
  const [dreamText, setDreamText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [usageLimit, setUsageLimit] = useState<UsageLimit | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadProfile();
    loadUsageLimit();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', user.id)
      .single();

    setProfile(data);
  };

  const loadUsageLimit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('usage_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();

    setUsageLimit(data || { analysis_count: 0, image_count: 0 });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleAnalyze = async () => {
    if (!dreamText.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dreamText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze dream');
      }

      setResult(data);
      setDreamText('');
      loadUsageLimit();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const maxAnalyses = 3;
  const maxImages = profile?.is_premium ? 5 : 1;
  const analysesUsed = usageLimit?.analysis_count || 0;
  const imagesUsed = usageLimit?.image_count || 0;

  return (
    <main className="min-h-screen">
      <nav className="border-b border-white/10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold">DreamVault AI</div>
          <div className="flex items-center space-x-6">
            {profile?.is_premium && (
              <span className="bg-accent/20 border border-accent px-3 py-1 rounded-full text-sm">
                Premium
              </span>
            )}
            <Link href="/app/journal" className="text-white/80 hover:text-white transition-colors">
              Journal
            </Link>
            {!profile?.is_premium && (
              <Link href="/app/upgrade" className="text-accent hover:text-blue-400 transition-colors">
                Upgrade
              </Link>
            )}
            <button onClick={handleLogout} className="text-white/80 hover:text-white transition-colors">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Analyze Your Dream</h1>
          <p className="text-white/70">
            Daily Limit: {analysesUsed}/{maxAnalyses} analyses, {imagesUsed}/{maxImages} images
          </p>
        </div>

        <div className="card mb-8">
          <textarea
            value={dreamText}
            onChange={(e) => setDreamText(e.target.value)}
            className="input-field min-h-[200px] resize-none"
            placeholder="Write your dream..."
            disabled={loading}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || !dreamText.trim()}
            className="gradient-button w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Analyzing...' : 'Analyze Dream'}
          </button>
        </div>

        {result && (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-2xl font-bold mb-4">Dream Analysis</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-accent">Quick Interpretation</h3>
                  <p className="text-white/80">{result.short_analysis}</p>
                </div>
                {profile?.is_premium ? (
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-accent">Full Psychological Analysis</h3>
                    <p className="text-white/80 whitespace-pre-wrap">{result.full_analysis}</p>
                  </div>
                ) : (
                  <div className="blur-premium">
                    <div className="relative z-10">
                      <h3 className="text-lg font-semibold mb-2 text-accent">Full Psychological Analysis</h3>
                      <p className="text-white/80">
                        {result.full_analysis.substring(0, 300)}...
                      </p>
                    </div>
                    <div className="text-center mt-6 relative z-20">
                      <Link href="/app/upgrade" className="gradient-button inline-block">
                        Upgrade to Read More
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {result.image_url && (
              <div className="card">
                <h2 className="text-2xl font-bold mb-4">Dream Visualization</h2>
                <div className="relative">
                  <Image
                    src={result.image_url}
                    alt="Dream visualization"
                    width={profile?.is_premium ? 1024 : 512}
                    height={profile?.is_premium ? 1024 : 512}
                    className="w-full rounded-lg"
                  />
                  {!profile?.is_premium && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                      <div className="text-4xl font-bold text-white/80">PREMIUM</div>
                    </div>
                  )}
                </div>
                {profile?.is_premium && (
                  <div className="flex space-x-4 mt-4">
                    <a
                      href={result.image_url}
                      download
                      className="gradient-button flex-1 text-center"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin + '/app/journal/' + result.id);
                        alert('Link copied!');
                      }}
                      className="bg-white/10 hover:bg-white/20 px-8 py-4 rounded-lg font-semibold transition-colors flex-1"
                    >
                      Share
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
