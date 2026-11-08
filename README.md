# Pizza Haus - Online Ordering System
Run locally:  npm install  then  npm start  then open http://localhost:3000
Settings live in .env (local only, never upload it):  STAFF_CODE=...
To store data in Postgres (needed on free hosts), also set DATABASE_URL.

Deploy (Render): New > Web Service > connect repo. Build: npm install. Start: npm start.
Environment variables: STAFF_CODE, DATABASE_URL, NODE_ENV=production
