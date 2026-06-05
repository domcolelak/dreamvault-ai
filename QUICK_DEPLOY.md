# Quick Deployment Checklist

## Pre-Deployment (5 minutes)

- [ ] Code pushed to GitHub
- [ ] `.env.local` in `.gitignore`
- [ ] Local build successful: `npm run build`
- [ ] All TypeScript errors resolved

## Vercel Setup (10 minutes)

- [ ] Account created at vercel.com
- [ ] GitHub connected
- [ ] Repository imported
- [ ] Framework: Next.js (auto-detected)

## Environment Variables (5 minutes)

Copy from `.env.local` to Vercel Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
OPENAI_API_KEY=
NEXT_PUBLIC_SITE_URL=https://dreamvaultai.online
```

- [ ] All 8 variables added
- [ ] Values copied correctly (no spaces)

## Deploy (5 minutes)

- [ ] Click "Deploy"
- [ ] Build completes successfully
- [ ] Visit Vercel URL
- [ ] Site loads correctly

## Custom Domain (10-60 minutes)

- [ ] Add domain in Vercel: Settings → Domains
- [ ] Enter: `dreamvaultai.online`
- [ ] Copy DNS records from Vercel
- [ ] Go to domain registrar
- [ ] Add A record: `@` → `76.76.21.21`
- [ ] Wait for DNS propagation
- [ ] Verify SSL certificate active

## Stripe Webhook (5 minutes)

- [ ] Go to Stripe Dashboard → Webhooks
- [ ] Update/create endpoint: `https://dreamvaultai.online/api/stripe/webhook`
- [ ] Select events:
  - [ ] checkout.session.completed
  - [ ] customer.subscription.updated
  - [ ] customer.subscription.deleted
- [ ] Copy webhook signing secret
- [ ] Update `STRIPE_WEBHOOK_SECRET` in Vercel
- [ ] Redeploy project

## Supabase Auth (3 minutes)

- [ ] Supabase Dashboard → Authentication → URL Configuration
- [ ] Site URL: `https://dreamvaultai.online`
- [ ] Redirect URLs: `https://dreamvaultai.online/**`
- [ ] Save

## Production Testing (15 minutes)

### Basic Flow
- [ ] Visit https://dreamvaultai.online
- [ ] Register new account
- [ ] Log in
- [ ] Submit dream analysis
- [ ] Verify analysis appears
- [ ] Check image generates
- [ ] View journal
- [ ] Click dream detail

### Premium Flow
- [ ] Click "Upgrade"
- [ ] Use test card: `4242 4242 4242 4242`
- [ ] Complete checkout
- [ ] Verify Premium badge shows
- [ ] Verify full analysis visible
- [ ] Verify HD image visible
- [ ] Test download button

### Webhook Verification
- [ ] Go to Stripe Dashboard → Webhooks
- [ ] Check recent events show "Success"
- [ ] No failed webhooks

## Monitoring Setup (5 minutes)

- [ ] Vercel Analytics enabled
- [ ] Check Vercel function logs
- [ ] Monitor OpenAI usage
- [ ] Set OpenAI budget alert
- [ ] Bookmark Stripe Dashboard

## Final Checks

- [ ] https://dreamvaultai.online loads with SSL
- [ ] All pages accessible
- [ ] No console errors
- [ ] Images display correctly
- [ ] Premium upgrade works
- [ ] Webhooks processing

## Total Time: ~60-120 minutes

## If Something Fails

### Build Fails
```bash
npm install
npm run build
npx tsc --noEmit
```
Fix errors, commit, push.

### Webhook Fails
1. Check webhook secret matches Vercel
2. Verify URL is correct
3. Check Stripe Dashboard logs
4. Test: `stripe trigger checkout.session.completed`

### Domain Issues
1. Verify DNS records correct
2. Wait longer (up to 48 hours)
3. Check [dnschecker.org](https://dnschecker.org)
4. Contact domain registrar if needed

### Auth Issues
1. Check Supabase URLs match production
2. Clear browser cookies
3. Verify redirect URLs correct
4. Check middleware.ts is working

## Success! 🚀

Your app is now live at:
**https://dreamvaultai.online**

Next steps:
1. Monitor for 24 hours
2. Test with real users
3. Optimize based on usage
4. Set up analytics
5. Plan marketing

## Quick Commands

```bash
# View Vercel logs
vercel logs

# Test Stripe webhook
stripe listen --forward-to https://dreamvaultai.online/api/stripe/webhook

# Check DNS
nslookup dreamvaultai.online

# Test SSL
curl -I https://dreamvaultai.online
```

## Emergency Contacts

- Vercel Support: vercel.com/support
- Stripe Support: support.stripe.com
- Supabase Support: supabase.com/dashboard (support tab)

## Rollback Procedure

If critical issue:
1. Go to Vercel → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"
4. Takes effect immediately
