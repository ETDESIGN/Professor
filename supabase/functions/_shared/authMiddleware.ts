import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

interface AuthResult {
  userId: string;
  role: string;
  supabase: any;
}

export async function authenticateRequest(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid authorization header', 401);
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    throw new AuthError('Empty bearer token', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new AuthError('Server auth not configured', 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new AuthError('Invalid or expired token', 401);
  }

  return {
    userId: user.id,
    role: (user as any).role || 'authenticated',
    supabase,
  };
}

export async function softAuthenticate(req: Request): Promise<AuthResult | null> {
  try {
    return await authenticateRequest(req);
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
