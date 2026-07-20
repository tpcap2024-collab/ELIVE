import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ==========================================
  // ELIVE API ROUTES
  // ==========================================

  // 1. Get all trucks (Connects to Google Sheets API)
  app.get('/api/trucks', async (req, res) => {
    try {
      const auth = new google.auth.OAuth2();
      if (!process.env.GOOGLE_OAUTH_TOKEN) {
         console.warn("No GOOGLE_OAUTH_TOKEN found in environment variables");
         return res.status(500).json({ error: "No OAuth token" });
      }
      auth.setCredentials({ access_token: process.env.GOOGLE_OAUTH_TOKEN });
      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = '1Yqaw_RNoy6ftFksMZvv9dyAf1-P-pQRIFgvon2ItRvc';

      // Fetch Plan and Actual data
      const [planRes, actualRes] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId, range: 'Plan' }),
        sheets.spreadsheets.values.get({ spreadsheetId, range: 'Actual data' })
      ]);

      res.json({
        status: 'success',
        plan: planRes.data.values,
        actual: actualRes.data.values
      });
    } catch (err: any) {
      console.error("Error fetching sheets:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Update truck status (Warehouse / Supervisor action)
  app.post('/api/trucks/:id/status', (req, res) => {
    const { status, timestamp } = req.body;
    // Update the specific row in Google Sheets
    res.json({ success: true, message: 'Status updated' });
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
