import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import Stripe from 'stripe';

const processedEvents = new Set<string>();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = headers().get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }

  if (processedEvents.has(event.id)) {
    console.log(`Duplicate event ${event.id}, skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;

        if (!userId) {
          console.error('No user ID in session metadata');
          return NextResponse.json(
            { error: 'No user ID in session metadata' },
            { status: 400 }
          );
        }

        const { error } = await supabaseAdmin
          .from('profiles')
          .update({
            is_premium: true,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', userId);

        if (error) {
          console.error('Failed to update profile:', error);
          throw error;
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (profile) {
          const isActive = subscription.status === 'active';
          const { error } = await supabaseAdmin
            .from('profiles')
            .update({ is_premium: isActive })
            .eq('id', profile.id);

          if (error) {
            console.error('Failed to update subscription status:', error);
            throw error;
          }
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (profile) {
          const { error } = await supabaseAdmin
            .from('profiles')
            .update({
              is_premium: false,
              stripe_subscription_id: null,
            })
            .eq('id', profile.id);

          if (error) {
            console.error('Failed to cancel subscription:', error);
            throw error;
          }
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    processedEvents.add(event.id);

    // ✅ TypeScript-safe cleanup (prevents undefined being passed to delete)
    if (processedEvents.size > 1000) {
      const iter = processedEvents.values().next();
      if (!iter.done && iter.value) {
        processedEvents.delete(iter.value);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
