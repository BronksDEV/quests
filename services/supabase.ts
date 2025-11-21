
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://ggqljtbbjavvyvawiwus.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdncWxqdGJiamF2dnl2YXdpd3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNzY0MTgsImV4cCI6MjA3MzY1MjQxOH0.PnMwg10Hu_02lytY91JkfyqlDtAUdB_LpgQLOAJKi04";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const SUPABASE_BUCKET_NAME = "quest-images";