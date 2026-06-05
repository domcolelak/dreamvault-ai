# DreamVault AI - Complete Project Structure

```
dreamvault-ai/
│
├── app/                                    # Next.js 14 App Router
│   ├── api/                               # API Routes
│   │   ├── analyze/
│   │   │   └── route.ts                   # Dream analysis endpoint (OpenAI integration)
│   │   └── stripe/
│   │       ├── checkout/
│   │       │   └── route.ts               # Create Stripe checkout session
│   │       └── webhook/
│   │           └── route.ts               # Handle Stripe webhook events
│   │
│   ├── app/                               # Protected app routes
│   │   ├── page.tsx                       # Main app - dream analysis interface
│   │   ├── journal/
│   │   │   ├── page.tsx                   # Dream journal list
│   │   │   └── [id]/
│   │   │       └── page.tsx               # Individual dream detail page
│   │   └── upgrade/
│   │       └── page.tsx                   # Premium upgrade page
│   │
│   ├── login/
│   │   └── page.tsx                       # Login page
│   ├── register/
│   │   └── page.tsx                       # Registration page
│   │
│   ├── page.tsx                           # Landing page
│   ├── layout.tsx                         # Root layout
│   └── globals.css                        # Global styles with Tailwind
│
├── lib/                                   # Utility libraries
│   ├── supabase.ts                        # Supabase client & admin instances
│   ├── openai.ts                          # OpenAI client configuration
│   └── stripe.ts                          # Stripe client configuration
│
├── supabase/
│   └── schema.sql                         # Complete database schema with RLS
│
├── middleware.ts                          # Auth protection middleware
├── package.json                           # Dependencies and scripts
├── tsconfig.json                          # TypeScript configuration
├── tailwind.config.ts                     # Tailwind CSS configuration
├── postcss.config.js                      # PostCSS configuration
├── next.config.js                         # Next.js configuration
├── .env.example                           # Environment variables template
├── .gitignore                             # Git ignore rules
├── README.md                              # Project documentation
└── SETUP.md                               # Detailed setup checklist
```

## File Count Summary

- **Total Files**: 26
- **TypeScript/TSX**: 16
- **Configuration**: 6
- **Documentation**: 2
- **SQL**: 1
- **CSS**: 1

## Key Features by File

### Frontend Pages
- `app/page.tsx` - Landing with hero, features, pricing, FAQ
- `app/login/page.tsx` - Email/password authentication
- `app/register/page.tsx` - User registration
- `app/app/page.tsx` - Dream analysis interface with usage limits
- `app/app/journal/page.tsx` - List all user dreams
- `app/app/journal/[id]/page.tsx` - Dream detail with analysis & image
- `app/app/upgrade/page.tsx` - Premium subscription page

### API Endpoints
- `app/api/analyze/route.ts` - AI dream analysis + image generation
- `app/api/stripe/checkout/route.ts` - Create checkout session
- `app/api/stripe/webhook/route.ts` - Handle subscription events

### Database Schema
- `supabase/schema.sql` - Complete schema with:
  - profiles table (user data + premium status)
  - dreams table (dream entries + analysis)
  - usage_limits table (daily rate limiting)
  - RLS policies (row-level security)
  - Storage bucket configuration
  - Auto-profile creation trigger

## Tech Stack Implementation

### Next.js 14 App Router
- Server components by default
- API routes in app/api
- Dynamic routes with [id]
- Middleware for auth protection

### TypeScript
- Full type safety across all files
- Proper interface definitions
- Type-safe API responses

### Tailwind CSS
- Custom color scheme (background: #0A0E2A, accent: #3FA9F5)
- Gradient buttons
- Card components
- Responsive design
- Custom utility classes

### Supabase Integration
- Authentication (email/password)
- Postgres database
- Storage for images
- Row Level Security
- Real-time capabilities ready

### Stripe Integration
- Subscription checkout
- Webhook event handling
- Customer management
- Automatic premium status updates

### OpenAI Integration
- gpt-4o-mini for text analysis
- dall-e-3 for image generation
- Metadata extraction
- Cost-optimized prompts

## Security Features

1. **Row Level Security** - Users can only access their own data
2. **Auth Middleware** - Protected routes require authentication
3. **Webhook Verification** - Stripe signature validation
4. **Environment Variables** - All sensitive data in .env
5. **Rate Limiting** - Daily usage limits enforced
6. **Server-Side API Calls** - No client-side API key exposure

## Cost Optimization

1. **Daily Limits** - Prevents API abuse
2. **Cached Results** - Analysis stored in database
3. **Conditional Image Generation** - Only within limits
4. **No Redundant Calls** - Single API call per feature
5. **Server-Side Enforcement** - Can't bypass limits client-side

## Deployment Ready

- All code complete and production-ready
- No TODO comments
- No placeholder code
- Full error handling
- Loading states
- User feedback messages
- Responsive design
- SEO-friendly metadata
- Compatible with mgx.dev deployment
