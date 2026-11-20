import 'dotenv/config';
import type { Request, Response } from 'express';
import { createApp } from '../server/app.ts';
import { createSupabaseStore } from '../server/supabaseStore.ts';

const store = createSupabaseStore();
const app = createApp(store);

export default function handler(req: Request, res: Response) {
  return app(req, res);
}
