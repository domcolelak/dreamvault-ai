'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface Dream {
  id: string;
  dream_text: string;
  short_analysis: string;
  full_analysis: string;
  image_url: string;
  created_at: string;
}

interface Profile {
  is_premium: boolean;
}

export default function DreamDetailPage({ params }: { params: { id: string } }) {
  const [dream, setDream] = useState<Dream | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadDream();
    loadProfile();
  }, [params.id]);

  const loadDream = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('dreams')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    setDream(data);
    setLoading(false);
  };

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

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this dream?')) return;

    const { error } = await supabase
      .from('dreams')
      .delete()
      .eq('id', params.id);

    if (!error) {
      router.push('/app/journal');
    }
  };

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </main>
    );
  }

  if (!dream) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="text-center">Dream not found</div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/app/journal" className="text-accent hover:underline mb-4 inline-block">
          ← Back to Journal
        </Link>

        <div className="card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Your Dream</h2>
            <p className="text-white/80">{dream.dream_text}</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Quick Interpretation</h2>
            <p className="text-white/80">{dream.short_analysis}</p>
          </div>

          {profile?.is_premium ? (
            <div>
              <h2 className="text-xl font-semibold mb-2">Full Psychological Analysis</h2>
              <div className="text-white/80 whitespace-pre-wrap">{dream.full_analysis}</div>
            </div>
          ) : (
            <div className="relative">
              <h2 className="text-xl font-semibold mb-2">Full Psychological Analysis</h2>
              <div className="text-white/80 blur-sm select-none">
                {dream.full_analysis.substring(0, 300)}...
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Link href="/app/upgrade" className="gradient-button">
                  Upgrade to Read More
                </Link>
              </div>
            </div>
          )}

          {dream.image_url && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Dream Visualization</h2>
              <div className="relative w-full aspect-square max-w-lg mx-auto">
                <Image
                  src={dream.image_url}
                  alt="Dream visualization"
                  fill
                  className="rounded-lg object-cover"
                />
                {!profile?.is_premium && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                    <div className="text-4xl font-bold text-white/80">PREMIUM</div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-white/10">
            <button
              onClick={handleDelete}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              Delete Dream
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}