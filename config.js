const SUPABASE_URL = "https://vvleoapbmneriofkhnle.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2bGVvYXBibW5lcmlvZmtobmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1Njc5MDYsImV4cCI6MjEwMDE0MzkwNn0.CiCCc2UA0D7pmzr642RS8i2ihusxm8kjV3bmhe7nVmA";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);
