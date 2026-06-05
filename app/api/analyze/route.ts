import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase';

interface ImageMetadata {
  scene: string;
  mood: string;
  key_symbols: string[];
  color_palette: string[];
  style: string;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const activeRequests = new Map<string, number>();
const MAX_CONCURRENT_REQUESTS = 1;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = Buffer.from(base64, 'base64');
  return binaryString.buffer.slice(
    binaryString.byteOffset,
    binaryString.byteOffset + binaryString.byteLength
  );
}

function decActive(userId: string) {
  activeRequests.set(userId, Math.max(0, (activeRequests.get(userId) || 1) - 1));
}

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentRequests = activeRequests.get(user.id) || 0;
    if (currentRequests >= MAX_CONCURRENT_REQUESTS) {
      return NextResponse.json(
        { error: 'Please wait for your current analysis to complete' },
        { status: 429 }
      );
    }

    activeRequests.set(user.id, currentRequests + 1);

    const { dreamText } = await request.json();

    if (!dreamText || dreamText.trim().length === 0) {
      decActive(user.id);
      return NextResponse.json({ error: 'Dream text is required' }, { status: 400 });
    }

    if (dreamText.length > 5000) {
      decActive(user.id);
      return NextResponse.json(
        { error: 'Dream text too long (max 5000 characters)' },
        { status: 400 }
      );
    }

    // ✅ Profile via admin (avoids RLS + handles missing profile row)
    let { data: profile, error: profileSelectError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_premium')
      .eq('id', user.id)
      .maybeSingle();

    if (profileSelectError) {
      console.error('profiles select failed:', profileSelectError);
      decActive(user.id);
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }

    if (!profile) {
      const { data: createdProfile, error: createProfileError } = await supabaseAdmin
        .from('profiles')
        .insert({ id: user.id, is_premium: false })
        .select('id, is_premium')
        .single();

      if (createProfileError) {
        console.error('profiles insert failed:', createProfileError);
        decActive(user.id);
        return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
      }

      profile = createdProfile;
    }

    const today = new Date().toISOString().split('T')[0];

    // ✅ usage_limits via admin (avoids RLS issues)
    let { data: usageLimit, error: usageSelectError } = await supabaseAdmin
      .from('usage_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (usageSelectError) {
      console.error('usage_limits select failed:', usageSelectError);
      decActive(user.id);
      return NextResponse.json({ error: 'Failed to check usage limits' }, { status: 500 });
    }

    if (!usageLimit) {
      const { data: newLimit, error: insertError } = await supabaseAdmin
        .from('usage_limits')
        .insert({
          user_id: user.id,
          date: today,
          analysis_count: 0,
          image_count: 0,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create usage limit:', insertError);
        decActive(user.id);
        return NextResponse.json({ error: 'Failed to check usage limits' }, { status: 500 });
      }

      usageLimit = newLimit;
    }

    if ((usageLimit.analysis_count ?? 0) >= 3) {
      decActive(user.id);
      return NextResponse.json(
        { error: 'Daily analysis limit reached (3/day)' },
        { status: 429 }
      );
    }

    const systemPrompt =
      'You are a psychological dream analyst. Provide symbolic interpretation, emotional themes, subconscious patterns, and reflective questions. Do not provide medical advice or diagnoses.';

    const shortPrompt = `Provide a brief 2-3 sentence interpretation of this dream:\n\n${dreamText}`;
    const fullPrompt = `Provide a comprehensive psychological analysis of this dream including:
1. Symbolic interpretation of key elements
2. Emotional themes and their significance
3. Possible subconscious patterns or concerns
4. Reflective questions for the dreamer to consider

Dream:\n${dreamText}`;

    const metadataPrompt = `Analyze this dream and extract visual metadata for creating a surreal dreamlike image. Return ONLY valid JSON with this exact structure:
{
  "scene": "brief description of the main scene",
  "mood": "one word mood",
  "key_symbols": ["symbol1", "symbol2", "symbol3"],
  "color_palette": ["color1", "color2", "color3"],
  "style": "artistic style description"
}

Dream: ${dreamText}`;

    const [shortResponse, fullResponse, metadataResponse] = await Promise.all([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: shortPrompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fullPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a metadata extraction system. Return only valid JSON.' },
          { role: 'user', content: metadataPrompt },
        ],
        temperature: 0.5,
        max_tokens: 300,
      }),
    ]);

    const shortAnalysis = shortResponse.choices[0]?.message?.content || '';
    const fullAnalysis = fullResponse.choices[0]?.message?.content || '';
    const metadataText = metadataResponse.choices[0]?.message?.content || '{}';

    let metadata: ImageMetadata;
    try {
      metadata = JSON.parse(metadataText);
    } catch {
      metadata = {
        scene: 'abstract dreamscape',
        mood: 'mysterious',
        key_symbols: ['abstract', 'surreal', 'ethereal'],
        color_palette: ['deep blue', 'purple', 'gold'],
        style: 'surrealist digital art',
      };
    }

    let imageUrl = '';
    const maxImages = profile?.is_premium ? 5 : 1;

    if ((usageLimit.image_count ?? 0) < maxImages) {
      const imagePrompt = `Create a cinematic, surreal dreamlike visualization. No text in image. Dreamlike lighting. Emotionally expressive. High detail.

Scene: ${metadata.scene}
Mood: ${metadata.mood}
Key symbols: ${metadata.key_symbols.join(', ')}
Color palette: ${metadata.color_palette.join(', ')}
Style: ${metadata.style}`;

      try {
        const imageResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        });

        const generatedImageUrl = imageResponse?.data?.[0]?.url ?? null;
        const generatedB64 = (imageResponse as any)?.data?.[0]?.b64_json ?? null;

        let imageBuffer: ArrayBuffer | null = null;

        if (generatedImageUrl) {
          imageBuffer = await fetch(generatedImageUrl).then((res) => res.arrayBuffer());
        } else if (generatedB64) {
          imageBuffer = base64ToArrayBuffer(generatedB64);
        }

        if (imageBuffer) {
          const fileName = `${user.id}/${Date.now()}.png`;

          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('dream-images')
            .upload(fileName, imageBuffer, {
              contentType: 'image/png',
              cacheControl: '3600',
              upsert: false,
            });

          if (!uploadError && uploadData) {
            const { data: publicUrlData } = supabaseAdmin.storage
              .from('dream-images')
              .getPublicUrl(fileName);

            imageUrl = publicUrlData.publicUrl;

            await supabaseAdmin
              .from('usage_limits')
              .update({ image_count: (usageLimit.image_count ?? 0) + 1 })
              .eq('id', usageLimit.id);

            usageLimit.image_count = (usageLimit.image_count ?? 0) + 1;
          } else {
            console.error('Failed to upload image:', uploadError);
          }
        }
      } catch (imageError: any) {
        console.error('Image generation failed:', imageError);
      }
    }

    // If dreams insert is blocked by RLS, switch this to supabaseAdmin too.
    const { data: dream, error: insertError } = await supabase
      .from('dreams')
      .insert({
        user_id: user.id,
        dream_text: dreamText,
        short_analysis: shortAnalysis,
        full_analysis: fullAnalysis,
        image_url: imageUrl,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save dream:', insertError);
      decActive(user.id);
      return NextResponse.json({ error: 'Failed to save dream' }, { status: 500 });
    }

    await supabaseAdmin
      .from('usage_limits')
      .update({ analysis_count: (usageLimit.analysis_count ?? 0) + 1 })
      .eq('id', usageLimit.id);

    decActive(user.id);

    return NextResponse.json({
      id: dream.id,
      short_analysis: shortAnalysis,
      full_analysis: fullAnalysis,
      image_url: imageUrl,
    });
  } catch (error: any) {
    console.error('Analysis error:', error);

    try {
      const supabase = createRouteHandlerClient({ cookies });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) decActive(user.id);
    } catch {}

    return NextResponse.json(
      { error: error.message || 'Failed to analyze dream' },
      { status: 500 }
    );
  }
}
