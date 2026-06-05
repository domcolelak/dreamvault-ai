# Vercel Deployment Guide for DreamVault AI

## Prerequisites

- [x] GitHub account with repository
- [x] Vercel account (sign up at vercel.com)
- [x] Supabase project configured
- [x] Stripe account configured
- [x] OpenAI API key
- [x] Domain registered (dreamvaultai.online)

## Step 1: Prepare Repository

### 1.1 Verify Project Structure
```bash
# Ensure all files are committed
git status

# Verify .gitignore includes:
# - .env
# - .env.local
# - node_modules
```

### 1.2 Test Local Build
```bash
npm install
npm run build
npm start
```

Verify the build completes without errors.

## Step 2: Deploy to Vercel

### 2.1 Create New Project

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Click **"Import Git Repository"**
4. Select your GitHub repository: `dreamvault-ai`
5. Click **"Import"**

### 2.2 Configure Project

**Framework Preset:** Next.js (auto-detected)

**Root Directory:** `./` (default)

**Build Command:** `npm run build` (default)

**Output Directory:** `.next` (default)

**Install Command:** `npm install` (default)

**Node.js Version:** 18.x (recommended)

### 2.3 Add Environment Variables

Click **"Environment Variables"** and add ALL of these:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_ID=price_xxxxx
OPENAI_API_KEY=sk-xxxxx
NEXT_PUBLIC_SITE_URL=https://dreamvaultai.online
```

**Important:**
- Use PRODUCTION keys (sk_live_, not sk_test_)
- NEXT_PUBLIC_SITE_URL should be your final domain
- Service role key is different from anon key

### 2.4 Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes for build
3. Copy the generated Vercel URL (e.g., `dreamvault-ai.vercel.app`)

## Step 3: Configure Custom Domain

### 3.1 Add Domain to Vercel

1. In your Vercel project → **Settings** → **Domains**
2. Add domain: `dreamvaultai.online`
3. Add www subdomain: `www.dreamvaultai.online` (optional)
4. Vercel will provide DNS records

### 3.2 Configure DNS Records

Go to your domain registrar (e.g., Namecheap, GoDaddy, Cloudflare):

**For Root Domain (dreamvaultai.online):**
```
Type: A
Name: @
Value: 76.76.21.21
TTL: 3600
```

**For WWW Subdomain (optional):**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: 3600
```

**Alternative (if A record doesn't work):**
```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
TTL: 3600
```

### 3.3 Wait for DNS Propagation

- Takes 5 minutes to 48 hours
- Check status: [dnschecker.org](https://dnschecker.org)
- Vercel will auto-generate SSL certificate once DNS propagates

### 3.4 Verify Domain

1. Visit `https://dreamvaultai.online`
2. Verify SSL certificate is active (🔒 in browser)
3. Test landing page loads correctly

## Step 4: Configure Stripe Webhooks

### 4.1 Update Webhook Endpoint

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks**
2. Find your webhook endpoint or create new one
3. Update URL to: `https://dreamvaultai.online/api/stripe/webhook`

### 4.2 Verify Events

Select these events:
- [x] `checkout.session.completed`
- [x] `customer.subscription.updated`
- [x] `customer.subscription.deleted`

### 4.3 Test Webhook

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Test webhook
stripe trigger checkout.session.completed --api-key sk_live_xxxxx
```

### 4.4 Get Webhook Secret

1. Click on webhook endpoint in Stripe Dashboard
2. Click **"Reveal"** on signing secret
3. Copy the `whsec_xxxxx` value
4. Update in Vercel: **Settings** → **Environment Variables**
5. Update `STRIPE_WEBHOOK_SECRET` value
6. **Redeploy** the project

## Step 5: Configure Supabase

### 5.1 Update Site URL

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Authentication** → **URL Configuration**
4. Update **Site URL:** `https://dreamvaultai.online`

### 5.2 Add Redirect URLs

Add these allowed redirect URLs:
```
https://dreamvaultai.online
https://dreamvaultai.online/**
https://dreamvaultai.online/auth/callback
```

### 5.3 Configure Email Templates (Optional)

1. Go to **Authentication** → **Email Templates**
2. Update Confirm Email template:
   ```
   {{ .ConfirmationURL }}
   ```
   Change to:
   ```
   https://dreamvaultai.online/auth/confirm?token={{ .Token }}
   ```

## Step 6: Production Testing

### 6.1 Test User Flow

- [ ] Register new account
- [ ] Verify email works (if enabled)
- [ ] Log in
- [ ] Submit dream for analysis
- [ ] Verify analysis appears
- [ ] Verify image generation works
- [ ] Check daily limits enforcement

### 6.2 Test Premium Upgrade

- [ ] Click "Upgrade" button
- [ ] Use test card: `4242 4242 4242 4242`
- [ ] Complete checkout
- [ ] Verify redirect to app
- [ ] Check Premium badge appears
- [ ] Verify full analysis visible
- [ ] Verify HD image visible
- [ ] Test download button
- [ ] Test share button

### 6.3 Test Webhook Processing

- [ ] Go to Stripe Dashboard → Webhooks
- [ ] Check recent webhook events
- [ ] Verify all show "Success" status
- [ ] Test subscription cancellation
- [ ] Verify premium access removed

### 6.4 Monitor Errors

```bash
# View logs in Vercel
vercel logs <deployment-url>

# Or check Vercel dashboard:
# Project → Deployments → [Latest] → Functions
```

## Step 7: Performance Optimization

### 7.1 Enable Edge Caching

Add to `next.config.js`:
```javascript
module.exports = {
  // ... existing config
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-DNS-Prefetch-Control',
          value: 'on'
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains'
        }
      ]
    }
  ]
};
```

### 7.2 Monitor Performance

- Vercel Dashboard → Analytics
- Check Core Web Vitals
- Monitor function execution times
- Check OpenAI API usage

### 7.3 Set Budget Alerts

**Vercel:**
- Settings → Usage → Set spending limits

**OpenAI:**
- Account → Billing → Usage limits
- Set hard limit (e.g., $50/month)

**Stripe:**
- Dashboard → Developers → Webhooks
- Monitor webhook failures

## Step 8: Continuous Deployment

### 8.1 Configure Auto-Deploy

Vercel automatically deploys on:
- Push to `main` branch (production)
- Pull requests (preview)

### 8.2 Branch Strategy

```
main           → Production (dreamvaultai.online)
staging        → Preview (staging-dreamvaultai.vercel.app)
feature/*      → Preview deployments
```

### 8.3 Rollback Strategy

If deployment fails:
1. Go to Vercel Dashboard
2. Click "Deployments"
3. Find last working deployment
4. Click "⋯" → "Promote to Production"

## Troubleshooting

### Issue: Webhook Failures

**Solution:**
1. Check Stripe Dashboard → Webhooks → Event logs
2. Verify webhook secret matches Vercel env var
3. Test endpoint: `curl -X POST https://dreamvaultai.online/api/stripe/webhook`
4. Check Vercel function logs

### Issue: Build Failures

**Solution:**
```bash
# Test locally first
npm run build

# Check for TypeScript errors
npx tsc --noEmit

# Verify environment variables
vercel env pull
```

### Issue: Images Not Loading

**Solution:**
1. Check Supabase Storage bucket is public
2. Verify bucket policies are correct
3. Check Next.js image domains in `next.config.js`
4. Verify service role key has storage permissions

### Issue: Auth Not Working

**Solution:**
1. Verify Supabase URL in env vars
2. Check Site URL in Supabase dashboard
3. Verify redirect URLs are correct
4. Clear browser cookies and try again

### Issue: High OpenAI Costs

**Solution:**
1. Check daily limits are enforced
2. Add max_tokens to API calls
3. Monitor usage in OpenAI dashboard
4. Consider reducing image quality to 'standard'

## Security Checklist

- [ ] All API keys are server-side only
- [ ] STRIPE_WEBHOOK_SECRET is correctly set
- [ ] Supabase RLS policies are active
- [ ] Rate limiting is enforced
- [ ] HTTPS is enabled (automatic with Vercel)
- [ ] CORS is properly configured
- [ ] Service role key is not exposed
- [ ] Environment variables are not committed to git

## Performance Targets

- **First Contentful Paint:** < 1.5s
- **Largest Contentful Paint:** < 2.5s
- **Time to Interactive:** < 3.5s
- **API Response Time:** < 2s
- **Image Generation:** < 30s
- **Webhook Processing:** < 5s

## Monitoring

### Key Metrics to Track

1. **User Metrics**
   - Daily active users
   - Conversion rate (free → premium)
   - Churn rate

2. **Technical Metrics**
   - API response times
   - Error rates
   - Webhook success rate
   - Image generation success rate

3. **Business Metrics**
   - OpenAI costs per user
   - Stripe transaction fees
   - MRR (Monthly Recurring Revenue)

### Recommended Tools

- **Vercel Analytics** - Built-in performance monitoring
- **Sentry** - Error tracking
- **LogRocket** - Session replay
- **PostHog** - Product analytics

## Cost Breakdown (Estimated)

**Monthly Costs:**
- Vercel Pro: $20/month (if needed, otherwise free tier)
- Supabase Pro: $25/month (if needed, otherwise free tier)
- OpenAI: ~$0.50 per user/month
- Stripe: 2.9% + $0.30 per transaction
- Domain: ~$12/year

**Revenue:**
- €4.99/user/month

**Break-even:** ~5-10 paying users

## Support Resources

- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)
- **Next.js Docs:** [nextjs.org/docs](https://nextjs.org/docs)
- **Supabase Docs:** [supabase.com/docs](https://supabase.com/docs)
- **Stripe Docs:** [stripe.com/docs](https://stripe.com/docs)
- **OpenAI Docs:** [platform.openai.com/docs](https://platform.openai.com/docs)

## Next Steps After Deployment

1. Set up monitoring and alerts
2. Configure backup strategy
3. Implement analytics
4. Create marketing plan
5. Gather user feedback
6. Iterate on features
7. Optimize costs
8. Scale infrastructure as needed

---

**Deployment Status Checklist:**

- [ ] Vercel project created
- [ ] Environment variables set
- [ ] Custom domain configured
- [ ] DNS records updated
- [ ] SSL certificate active
- [ ] Stripe webhooks configured
- [ ] Supabase URLs updated
- [ ] Production tested
- [ ] Monitoring enabled
- [ ] Ready to launch 🚀
