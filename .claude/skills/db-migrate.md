# /db-migrate

Run database migrations.

## Generate migrations from schema changes
```bash
npx drizzle-kit generate
```

## Apply migrations
```bash
npm run db:migrate
```

Note: The app also auto-creates tables on first API call via `initializeDatabase()` in `src/lib/db/init.ts`.
