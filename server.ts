import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwV9sfFxE-9lN4A08EKGq55_RlBjlVcvK6Bdeddj8GT0-6huxxnz8oyT7zunl69PK3qJA/exec';

async function startServer() {
  const app = express();
  // AI Studio requires port 3000. Render automatically provides a PORT env var and sets RENDER=true.
  const PORT = process.env.RENDER ? (process.env.PORT || 3000) : 3000;

  app.use(express.json());

  // ==========================================
  // ELIVE API ROUTES
  // ==========================================

  // 1. Get all trucks (Connects via Proxy to avoid CORS)
  app.get('/api/trucks', async (req, res) => {
    try {
      const scriptUrl = req.query.url ? String(req.query.url) : DEFAULT_APPS_SCRIPT_URL;
      const response = await fetch(`${scriptUrl}?action=getTrucks`);
      if (!response.ok) {
         return res.status(500).json({ error: `Apps script error: ${response.status}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      console.error("Error fetching sheets:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Update truck status
  app.post('/api/trucks/update', async (req, res) => {
    try {
      const scriptUrl = req.query.url ? String(req.query.url) : DEFAULT_APPS_SCRIPT_URL;
      const response = await fetch(scriptUrl, {
        method: 'POST',
        // In Node fetch, we might need to follow redirects if Apps Script replies with 302
        redirect: 'follow',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });
      if (!response.ok) {
         return res.status(500).json({ error: `Apps script error: ${response.status}` });
      }
      // Assuming Apps Script returns a text or JSON response
      const result = await response.text();
      res.json({ success: true, message: 'Status updated', result });
    } catch (err: any) {
      console.error("Error updating sheets:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Receive GPS Webhook from provider
  app.post('/api/gps/webhook', (req, res) => {
    const { licensePlate, lat, lng } = req.body;
    // Update location in database/cache
    res.json({ received: true });
  });

  // ==========================================
  // VITE & STATIC FILES
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ELIVE Server running on port ${PORT}`);
  });
}

startServer();
