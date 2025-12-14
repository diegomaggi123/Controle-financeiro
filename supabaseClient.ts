
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wezfigtvavnvnyypjzou.supabase.co';
const supabaseKey = 'sb_publishable_UmVvFkq7fC0OTPSgHEd5TA_lxOyj56u';

export const supabase = createClient(supabaseUrl, supabaseKey);
