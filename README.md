# DreamVault AI

A production-ready dream journal and AI interpretation platform built with Next.js 14, Supabase, Stripe, and OpenAI.

## Features

- Dream recording and AI-powered psychological analysis
- AI-generated dream visualizations
- Free and Premium tiers with usage limits
- Secure authentication and data storage
- Stripe subscription management
- Responsive dark UI design

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (Postgres)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **Payments**: Stripe
- **AI**: OpenAI (gpt-4o-mini, dall-e-3)

## Project Structure

```
dreamvault-ai/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts          # Dream analysis endpoint
│   │   └── stripe/
│   │       ├── checkout/route.ts     # Stripe checkout
│   │       └── webhook/route.ts      # Stripe webhooks
│   ├── app/
│   │   ├── page.tsx                  # Main app (analyze)
│   │   ├── journal/
│   │   │   ├── page.tsx              # Journal list
│   │   │   └── [id]/page.tsx         # Dream detail
│   │   └── upgrade/page.tsx          # Upgrade page
│   ├── login/page.tsx                # Login page
│   ├── register/page.tsx             # Register page
│   ├── page.tsx                      # Landing page
│   ├── layout.tsx                    # Root layout
│   └── globals.css                   # Global styles
├── lib/
│   ├── supabase.ts                   # Supabase clients
│   ├── openai.ts                     # OpenAI client
│   └── stripe.ts                     # Stripe client
├── supabase/
│   └── schema.sql                    # Database schema
├── middleware.ts                     # Auth middleware
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Setup Instructions

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API
3. Copy your project URL and anon key
4. Go to SQL Editor and run the contents of `supabase/schema.sql`
5. Go to Storage → Create bucket → name it `dream-images` → make it public
6. Copy your service role key from Project Settings → API

### 2. Stripe Setup

1. Create account at [stripe.com](https://stripe.com)
2. Go to Developers → API keys
3. Copy your secret key
4. Create a product with price €4.99/month
5. Copy the price ID (starts with `price_`)
6. Go to Developers → Webhooks
7. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
8. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
9. Copy webhook signing secret

### 3. OpenAI Setup

1. Create account at [platform.openai.com](https://platform.openai.com)
2. Go to API keys
3. Create new secret key
4. Copy the key

### 4. Environment Variables

Create `.env.local` file in root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
STRIPE_SECRET_KEY=sk_test_your_stripe_secret
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_ID=price_your_price_id
OPENAI_API_KEY=sk-your_openai_key
NEXT_PUBLIC_SITE_URL=https://dreamvaultai.online
```

### 5. Install Dependencies

```bash
npm install
```

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 7. Test Stripe Webhooks Locally

```bash
# Install Stripe CLI
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Use the webhook signing secret from CLI output in your .env.local
```

### 8. Build for Production

```bash
npm run build
npm start
```

## Deployment on Vercel

### Quick Deploy

1. Push code to GitHub repository
2. Visit [vercel.com](https://vercel.com) and sign in
3. Click "New Project"
4. Import your GitHub repository
5. Configure project:
   - Framework Preset: Next.js
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `.next`
6. Add all environment variables (see `.env.example`)
7. Click "Deploy"

### Post-Deployment Steps

1. **Update Stripe Webhook URL**
   - Go to Stripe Dashboard → Webhooks
   - Update endpoint URL to: `https://dreamvaultai.online/api/stripe/webhook`

2. **Configure Custom Domain**
   - In Vercel project settings → Domains
   - Add `dreamvaultai.online`
   - Add DNS records as instructed by Vercel
   - Wait for DNS propagation and SSL certificate

3. **Update Environment Variables**
   - Set `NEXT_PUBLIC_SITE_URL=https://dreamvaultai.online`
   - Redeploy to apply changes

4. **Configure Supabase Auth URLs**
   - Go to Supabase Dashboard → Authentication → URL Configuration
   - Site URL: `https://dreamvaultai.online`
   - Redirect URLs: Add `https://dreamvaultai.online/auth/callback`

## Usage Limits

### Free Users
- 3 dream analyses per day
- 1 image generation per day
- 300 character preview of full analysis
- 512px resized images with watermark

### Premium Users (€4.99/month)
- 3 dream analyses per day
- 5 image generations per day
- Full psychological analysis
- Full 1024px HD images
- Download and share features

## API Cost Optimization

- Server-side rate limiting enforced
- Daily usage limits prevent API abuse
- Results cached in database
- No redundant API calls
- Image generation only within limits

## Security Features

- Row Level Security (RLS) on all tables
- Protected API routes with auth middleware
- Secure webhook signature verification
- Environment variables for sensitive data
- User data isolation

## License

Proprietary - All rights reserved
