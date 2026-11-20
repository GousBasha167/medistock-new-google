import 'dotenv/config';
import type { Request, Response } from 'express';
import { createApp } from './app.ts';
import { createSupabaseStore } from './supabaseStore.ts';

const store = createSupabaseStore();
const app = createApp(store);

export default function handler(req: Request, res: Response) {
  const matched =
    (req.headers['x-matched-path'] as string) ||
    (req.headers['x-vercel-matched-path'] as string) ||
    req.url;

  if (matched && typeof matched === 'string') {
    const urlObj = new URL(matched, 'http://localhost');
    const pathname = urlObj.pathname.startsWith('/api')
      ? urlObj.pathname
      : `/api${urlObj.pathname}`;
    req.url = pathname + (urlObj.search || '');
  }

  return app(req, res);
}
