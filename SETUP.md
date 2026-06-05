# Setup Checklist for DreamVault AI

## Prerequisites
- [ ] Node.js 18+ installed
- [ ] Git installed
- [ ] GitHub account (for deployment)
- [ ] Credit card for service signups

## 1. Supabase Configuration

### Create Project
- [ ] Sign up at supabase.com
- [ ] Create new project
- [ ] Wait for project to finish provisioning

### Get API Credentials
- [ ] Navigate to Project Settings → API
- [ ] Copy Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Copy anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Copy service_role key → `SUPABASE_SERVICE_ROLE_KEY`

### Setup Database
- [ ] Go to SQL Editor
- [ ] Create new query
- [ ] Copy entire contents of `supabase/schema.sql`
- [ ] Run query
- [ ] Verify tables created: profiles, dreams, usage_limits

### Setup Storage
- [ ] Navigate to Storage
- [ ] Click "New bucket"
- [ ] Name: `dream-images`
- [ ] Public bucket: YES
- [ ] Click Create
- [ ] Verify bucket appears in list

### Verify Auth
- [ ] Navigate to Authentication → Providers
- [ ] Ensure Email provider is enabled
- [ ] Configure email templates if desired (optional)

## 2. Stripe Configuration

### Create Account
- [ ] Sign up at stripe.com
- [ ] Activate account
- [ ] Switch to Test mode (toggle in top right)

### Get API Keys
- [ ] Navigate to Developers → API keys
- [ ] Copy Secret key → `STRIPE_SECRET_KEY`

### Create Product
- [ ] Navigate to Products → Add Product
- [ ] Name: "DreamVault AI Premium"
- [ ] Description: "Monthly subscription for full dream analysis"
- [ ] Pricing model: Recurring
- [ ] Price: €4.99
- [ ] Billing period: Monthly
- [ ] Click Save
- [ ] Copy Price ID (starts with price_) → `STRIPE_PRICE_ID`

### Setup Webhook
- [ ] Navigate to Developers → Webhooks
- [ ] Click "Add endpoint"
- [ ] Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
- [ ] Select events to listen to:
  - [ ] checkout.session.completed
  - [ ] customer.subscription.updated
  - [ ] customer.subscription.deleted
- [ ] Click "Add endpoint"
- [ ] Click on the created endpoint
- [ ] Click "Reveal" on Signing secret
- [ ] Copy signing secret → `STRIPE_WEBHOOK_SECRET`

## 3. OpenAI Configuration

### Create Account
- [ ] Sign up at platform.openai.com
- [ ] Add payment method (required for API access)
- [ ] Set usage limits if desired

### Get API Key
- [ ] Navigate to API keys
- [ ] Click "Create new secret key"
- [ ] Name: "DreamVault AI"
- [ ] Copy key → `OPENAI_API_KEY`
- [ ] Store safely (shown only once)

### Verify Models
- [ ] Ensure gpt-4o-mini is available
- [ ] Ensure dall-e-3 is available
- [ ] Check pricing at platform.openai.com/pricing

## 4. Local Development Setup

### Clone and Install
- [ ] Clone repository
- [ ] Run `npm install`
- [ ] Wait for dependencies to install

### Environment Variables
- [ ] Create `.env.local` file in root
- [ ] Add all environment variables from `.env.example`
- [ ] Fill in all values collected above
- [ ] Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local dev

### Test Webhooks Locally (Optional)
- [ ] Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (macOS)
- [ ] Run `stripe login`
- [ ] Run `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- [ ] Copy webhook signing secret from CLI output
- [ ] Update `STRIPE_WEBHOOK_SECRET` in `.env.local` with CLI secret

### Start Development Server
- [ ] Run `npm run dev`
- [ ] Open http://localhost:3000
- [ ] Verify landing page loads
- [ ] Test registration flow
- [ ] Test login flow
- [ ] Test dream analysis (requires OpenAI credits)

## 5. Production Deployment on Vercel

### Prepare Repository
- [ ] Push code to GitHub
- [ ] Ensure `.env.local` is in `.gitignore`
- [ ] Verify build works: `npm run build`

### Deploy to Vercel
- [ ] Sign up at vercel.com
- [ ] Connect GitHub account
- [ ] Click "New Project"
- [ ] Import repository
- [ ] Framework preset: Next.js (auto-detected)
- [ ] Configure build settings:
  - [ ] Build command: `npm run build` (default)
  - [ ] Output directory: `.next` (default)
  - [ ] Install command: `npm install` (default)

### Configure Environment Variables
Add all variables in Vercel dashboard (Settings → Environment Variables):
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRICE_ID`
- [ ] `OPENAI_API_KEY`
- [ ] `NEXT_PUBLIC_SITE_URL=https://dreamvaultai.online`

### Deploy
- [ ] Click "Deploy"
- [ ] Wait 2-3 minutes for build to complete
- [ ] Copy the generated Vercel URL (e.g., dreamvault-ai.vercel.app)
- [ ] Visit URL and verify site loads

### Configure Custom Domain
- [ ] In Vercel: Settings → Domains
- [ ] Add domain: `dreamvaultai.online`
- [ ] Vercel will provide DNS records
- [ ] Go to your domain registrar (Namecheap, GoDaddy, etc.)
- [ ] Add A record: Type=A, Name=@, Value=76.76.21.21
- [ ] Wait for DNS propagation (5 min - 48 hours)
- [ ] Verify SSL certificate is active at https://dreamvaultai.online

### Update Stripe Webhook
- [ ] Go to Stripe Dashboard → Webhooks
- [ ] Edit endpoint (or create new)
- [ ] Change URL to: `https://dreamvaultai.online/api/stripe/webhook`
- [ ] Verify events selected:
  - [ ] checkout.session.completed
  - [ ] customer.subscription.updated
  - [ ] customer.subscription.deleted
- [ ] Save
- [ ] Copy webhook signing secret
- [ ] Update `STRIPE_WEBHOOK_SECRET` in Vercel
- [ ] Redeploy project
- [ ] Test webhook: `stripe trigger checkout.session.completed`

### Update Supabase Auth URLs
- [ ] Go to Supabase Dashboard → Authentication → URL Configuration
- [ ] Site URL: `https://dreamvaultai.online`
- [ ] Add redirect URL: `https://dreamvaultai.online/**`
- [ ] Save changes

## 6. Testing Production

### Test User Flows
- [ ] Register new account
- [ ] Verify email confirmation (if enabled)
- [ ] Log in
- [ ] Submit dream for analysis
- [ ] Verify analysis appears
- [ ] Verify image generation
- [ ] Check daily limits
- [ ] View journal
- [ ] View dream detail
- [ ] Test delete dream

### Test Premium Upgrade
- [ ] Click Upgrade button
- [ ] Complete checkout with test card: 4242 4242 4242 4242
- [ ] Verify redirect to app
- [ ] Check profile shows Premium badge
- [ ] Verify full analysis visible
- [ ] Verify full HD image visible
- [ ] Test download button
- [ ] Test share button

### Test Webhook Events
- [ ] Cancel subscription in Stripe Dashboard
- [ ] Verify user loses premium access
- [ ] Reactivate subscription
- [ ] Verify user regains premium access

### Monitor
- [ ] Check Supabase logs for errors
- [ ] Check Stripe Dashboard for payment events
- [ ] Monitor OpenAI usage and costs
- [ ] Set up billing alerts in OpenAI

## 7. Post-Launch

### Marketing
- [ ] Verify custom domain is active (dreamvaultai.online)
- [ ] Verify SSL certificate is working
- [ ] Set up social media presence
- [ ] Create landing page content
- [ ] Plan marketing strategy

### Monitoring
- [ ] Enable Vercel Analytics
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Set up analytics (Google Analytics, etc.)
- [ ] Monitor API costs daily
- [ ] Set budget alerts in OpenAI
- [ ] Monitor Stripe transaction fees

### Maintenance
- [ ] Regularly check for dependency updates
- [ ] Monitor user feedback
- [ ] Update AI prompts based on quality
- [ ] Optimize costs as needed
- [ ] Review Vercel function logs weekly

## Troubleshooting

### Common Issues

**"Unauthorized" errors:**
- Verify Supabase keys are correct
- Check middleware.ts is protecting routes
- Verify user is logged in

**Stripe webhook failures:**
- Verify webhook secret matches
- Check webhook URL is correct
- Ensure endpoint is reachable
- Check Stripe Dashboard logs

**Image upload failures:**
- Verify Supabase storage bucket exists
- Check bucket is public
- Verify service role key has permissions
- Check storage policies are correct

**OpenAI errors:**
- Verify API key is valid
- Check account has credits
- Ensure models are available
- Monitor rate limits

**Build failures:**
- Run `npm install` to update dependencies
- Check for TypeScript errors: `npx tsc --noEmit`
- Verify environment variables are set
- Check Next.js version compatibility

## Support Resources

- Vercel Docs: vercel.com/docs
- Supabase Docs: docs.supabase.com
- Stripe Docs: stripe.com/docs
- OpenAI Docs: platform.openai.com/docs
- Next.js Docs: nextjs.org/docs

## Additional Resources

- Full Vercel Deployment Guide: See VERCEL_DEPLOYMENT.md
- Refactoring Summary: See REFACTORING_SUMMARY.md
- Project Structure: See PROJECT_STRUCTURE.md

