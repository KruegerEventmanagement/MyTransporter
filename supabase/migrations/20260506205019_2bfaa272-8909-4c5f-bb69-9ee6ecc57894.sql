
-- Storage bucket for vehicle photos and documents
INSERT INTO storage.buckets (id, name, public) VALUES ('trip-photos', 'trip-photos', true);

-- Bookings table
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_name TEXT NOT NULL DEFAULT 'Fiat Ducato L4H2',
  vehicle_plate TEXT NOT NULL DEFAULT 'B-MT 1234',
  plan_id TEXT NOT NULL,
  plan_label TEXT NOT NULL,
  plan_price NUMERIC NOT NULL DEFAULT 0,
  deposit NUMERIC NOT NULL DEFAULT 200,
  start_date DATE NOT NULL,
  start_hour INTEGER NOT NULL,
  start_km INTEGER,
  end_km INTEGER,
  tank_level_start TEXT,
  tank_level_end TEXT,
  pickup_code TEXT NOT NULL,
  return_code TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trip photos (before & after drive)
CREATE TABLE public.trip_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT NOT NULL,
  photo_type TEXT NOT NULL, -- 'pre_front', 'pre_back', 'pre_left', 'pre_right', 'post_front', 'post_back', 'post_left', 'post_right', 'km_start', 'km_end', 'tank_receipt'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GPS tracking points
CREATE TABLE public.gps_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tracks ENABLE ROW LEVEL SECURITY;

-- RLS policies for bookings
CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for trip_photos
CREATE POLICY "Users can view own trip photos" ON public.trip_photos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bookings WHERE bookings.id = trip_photos.booking_id AND bookings.user_id = auth.uid())
);
CREATE POLICY "Users can insert own trip photos" ON public.trip_photos FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.bookings WHERE bookings.id = trip_photos.booking_id AND bookings.user_id = auth.uid())
);

-- RLS policies for gps_tracks
CREATE POLICY "Users can view own gps tracks" ON public.gps_tracks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bookings WHERE bookings.id = gps_tracks.booking_id AND bookings.user_id = auth.uid())
);
CREATE POLICY "Users can insert own gps tracks" ON public.gps_tracks FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.bookings WHERE bookings.id = gps_tracks.booking_id AND bookings.user_id = auth.uid())
);

-- Storage policies for trip-photos bucket
CREATE POLICY "Authenticated users can upload trip photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'trip-photos');
CREATE POLICY "Anyone can view trip photos" ON storage.objects FOR SELECT USING (bucket_id = 'trip-photos');

-- Profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Admin role for the owner
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Admin can see all bookings, photos, gps
CREATE POLICY "Admin can view all bookings" ON public.bookings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update all bookings" ON public.bookings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can view all trip photos" ON public.trip_photos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can view all gps tracks" ON public.gps_tracks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User roles policy: admin can manage
CREATE POLICY "Admin can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
