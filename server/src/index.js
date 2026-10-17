import 'dotenv/config';
import { createApp } from './app.js';

const PORT = process.env.PORT || 5000;

createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API server running on http://0.0.0.0:${PORT}`);
});
