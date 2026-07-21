import express from 'express';
import cors from 'cors';

const app = express();

const PORT = process.env.PORT || 10000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

const allowedOrigins = [
  'https://elive.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(
  cors({
    origin(origin, callback) {
      /*
       * อนุญาต request ที่ไม่มี Origin เช่น Render health check
       * และอนุญาตเฉพาะเว็บไซต์ ELIVE กับ localhost
       */
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed: ${origin}`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));

/*
 * หน้าแรกสำหรับตรวจว่า API ทำงานหรือไม่
 */
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    service: 'ELIVE API',
    message: 'Backend proxy is running.',
  });
});

/*
 * Health check สำหรับ Render
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2',
    routes: [
      '/health',
      '/api/trucks',
      '/api/trucks/update',
    ],
    timestamp: new Date().toISOString(),
  });
});
/*
 * อ่านข้อมูลรถจาก Google Apps Script
 */
app.get('/api/trucks', async (req, res) => {
  try {
    if (!APPS_SCRIPT_URL) {
      return res.status(500).json({
        error: 'APPS_SCRIPT_URL is not configured on Render.',
      });
    }

    const separator = APPS_SCRIPT_URL.includes('?') ? '&' : '?';

    const googleUrl =
      `${APPS_SCRIPT_URL}${separator}action=getTrucks`;

    const googleResponse = await fetch(googleUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'application/json',
      },
    });

    const responseText = await googleResponse.text();

    if (!googleResponse.ok) {
      console.error(
        'Google Apps Script GET error:',
        googleResponse.status,
        responseText
      );

      return res.status(502).json({
        error: 'Google Apps Script request failed.',
        upstreamStatus: googleResponse.status,
      });
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      console.error(
        'Invalid JSON from Google Apps Script:',
        responseText
      );

      return res.status(502).json({
        error: 'Google Apps Script returned invalid JSON.',
      });
    }

    if (data.error) {
      return res.status(502).json({
        error: data.error,
      });
    }

    return res.json(data);
  } catch (error) {
    console.error('GET /api/trucks failed:', error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Unable to retrieve truck data.',
    });
  }
});

/*
 * อัปเดตข้อมูลรถผ่าน Google Apps Script
 */
app.post('/api/trucks/update', async (req, res) => {
  try {
    if (!APPS_SCRIPT_URL) {
      return res.status(500).json({
        error: 'APPS_SCRIPT_URL is not configured on Render.',
      });
    }

    let requestData = req.body;

    /*
     * รองรับกรณี request body ถูกส่งมาเป็น text/plain
     */
    if (typeof requestData === 'string') {
      try {
        requestData = JSON.parse(requestData);
      } catch {
        return res.status(400).json({
          error: 'Request body is not valid JSON.',
        });
      }
    }

    if (!requestData || typeof requestData !== 'object') {
      return res.status(400).json({
        error: 'Request body is required.',
      });
    }

    if (!requestData.truckId) {
      return res.status(400).json({
        error: 'truckId is required.',
      });
    }

    if (!Array.isArray(requestData.newRow)) {
      return res.status(400).json({
        error: 'newRow must be an array.',
      });
    }

    const googleResponse = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        action: 'updateTruck',
        truckId: requestData.truckId,
        newRow: requestData.newRow,
      }),
    });

    const responseText = await googleResponse.text();

    if (!googleResponse.ok) {
      console.error(
        'Google Apps Script POST error:',
        googleResponse.status,
        responseText
      );

      return res.status(502).json({
        error: 'Google Apps Script update failed.',
        upstreamStatus: googleResponse.status,
      });
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      console.error(
        'Invalid update JSON from Google Apps Script:',
        responseText
      );

      return res.status(502).json({
        error:
          'Google Apps Script returned an invalid update response.',
      });
    }

    if (data.error) {
      return res.status(502).json({
        error: data.error,
      });
    }

    return res.json(data);
  } catch (error) {
    console.error(
      'POST /api/trucks/update failed:',
      error
    );

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Unable to update truck data.',
    });
  }
});

/*
 * จัดการ Route ที่ไม่มี
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'API route not found.',
  });
});

/*
 * จัดการ CORS และ Server errors
 */
app.use((error, req, res, next) => {
  console.error('Server error:', error);

  res.status(500).json({
    error:
      error instanceof Error
        ? error.message
        : 'Internal server error.',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ELIVE API is running on port ${PORT}`);
});
