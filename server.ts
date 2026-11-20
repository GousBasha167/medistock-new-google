import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.ts';
import { getVapidConfig, runReminderScheduler } from './server/reminders.ts';
import {
  checkSupabaseSchema,
  createSupabaseStore,
  isSupabaseConfigured,
  StoreError,
} from './server/supabaseStore.ts';

async function startServer() {
  const port = Number(process.env.PORT || 3000);
  const store = createSupabaseStore();

  // Initialize VAPID keys for Web Push
  getVapidConfig();

  const app = createApp(store);
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  } else {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        watch: hmrDisabled ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  let schedulerInterval: ReturnType<typeof setInterval> | null = null;
  let schemaWarningLogged = false;

  const runSchedulerSafely = async () => {
    const status = await checkSupabaseSchema();
    if (!status.configured) return;
    if (!status.schemaReady) {
      if (!schemaWarningLogged) {
        schemaWarningLogged = true;
        console.warn(
          'MediStock background reminder scheduler paused: Supabase tables are not created yet. Run supabase/migrations/001_medistock_schema.sql in your Supabase SQL Editor.'
        );
      }
      return;
    }
    schemaWarningLogged = false;
    try {
      await runReminderScheduler(store);
    } catch (err) {
      if (err instanceof StoreError && (err.code === 'SCHEMA_MISSING' || err.code === 'NOT_CONFIGURED')) {
        return;
      }
      console.error('Background reminder scheduler error:', err);
    }
  };

  if (isSupabaseConfigured()) {
    setTimeout(() => {
      void runSchedulerSafely();
    }, 2000);

    schedulerInterval = setInterval(() => {
      void runSchedulerSafely();
    }, 15 * 60 * 1000);
  } else {
    console.warn(
      'Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not set yet. Configure them in Secrets or .env to enable database persistence.'
    );
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`MediStock server listening on http://localhost:${port}`);
  });

  const shutdown = () => {
    if (schedulerInterval) clearInterval(schedulerInterval);
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start MediStock server:', err);
  process.exit(1);
});
