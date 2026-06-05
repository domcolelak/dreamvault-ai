-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  is_premium BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create dreams table
CREATE TABLE dreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dream_text TEXT NOT NULL,
  short_analysis TEXT NOT NULL,
  full_analysis TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create usage_limits table
CREATE TABLE usage_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  analysis_count INTEGER DEFAULT 0,
  image_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Create storage bucket for dream images
INSERT INTO storage.buckets (id, name, public)
VALUES ('dream-images', 'dream-images', true);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_limits ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Dreams policies
CREATE POLICY "Users can view own dreams"
  ON dreams FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dreams"
  ON dreams FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dreams"
  ON dreams FOR DELETE
  USING (auth.uid() = user_id);

-- Usage limits policies
CREATE POLICY "Users can view own usage limits"
  ON usage_limits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage limits"
  ON usage_limits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage limits"
  ON usage_limits FOR UPDATE
  USING (auth.uid() = user_id);

-- Storage policies
CREATE POLICY "Users can view dream images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dream-images');

CREATE POLICY "Users can upload dream images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'dream-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own dream images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'dream-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_dreams_user_id ON dreams(user_id);
CREATE INDEX idx_dreams_created_at ON dreams(created_at);
CREATE INDEX idx_usage_limits_user_date ON usage_limits(user_id, date);
