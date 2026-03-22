// js/supabase-config.js
const SUPABASE_URL = 'https://xtxjwqyrlgvihpufiryh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0eGp3cXlybGd2aWhwdWZpcnloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNjUzNDEsImV4cCI6MjA4OTc0MTM0MX0.2VX0V4rsNkuawUFrpsSq15WGyl_-ErZ0ZcPoE1MiQ7k';

const { createClient } = supabase;
window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
