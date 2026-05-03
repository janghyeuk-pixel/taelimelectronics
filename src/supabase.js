import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gbaneqgzqxrofhgptdkt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-6O9xR8ba9U1XM0XtBHLGQ_SEo7tasR';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
