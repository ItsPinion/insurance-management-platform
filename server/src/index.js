import 'dotenv/config';
import { createApp } from './app.js';
import { ping, target } from './db/index.js';

const PORT = process.env.PORT || 5000;

const server = createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API server running on http://0.0.0.0:${PORT}`);
  console.log(`   Neon database: ${target.database} @ ${target.host}`);
});

// A port clash must say what to do instead of dumping a raw stack trace.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `❌ Port ${PORT} is already in use. Stop the process that is using it ` +
        `(lsof -i :${PORT}) or start the API on another port (PORT=5001 npm run dev).`,
    );
  } else {
    console.error('❌ The API server could not start:', err.message);
  }
  process.exit(1);
});

// A project that cannot be reached must be obvious right away instead of surfacing
// later as a failed request — a suspended Neon project and a wrong connection
// string look identical to the client otherwise.
ping()
  .then(() => console.log('✅ Database connected'))
  .catch((err) => {
    const reason = String(err.message).split('\n')[0];
    console.warn(
      `⚠️  The Neon database "${target.database}" is not reachable (${reason}). ` +
        'The API starts, but every request that needs the database will fail until the ' +
        'project is awake, DATABASE_URL is the pooled string from the Neon console, and ' +
        'this machine has a route to it. `npm run db:ping` says which of those it is.',
    );
  });
