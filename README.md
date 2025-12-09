# NotNative Sync Server

Backend VPS server for multi-device synchronization of NotNative Electron notes.

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- (Optional) MinIO or S3-compatible storage for attachments

### Installation

1. Install dependencies:
```bash
cd vps-server
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure your `.env` file with database credentials and JWT secrets.

4. Create PostgreSQL database:
```bash
createdb notnative_sync
```

5. Run migrations:
```bash
npm run migrate
```

### Development

```bash
npm run dev
```

Server will run on `http://localhost:3000` by default.

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout

### Sync
- `GET /api/sync/changes?since={timestamp}&deviceId={id}` - Pull changes
- `POST /api/sync/push` - Push changes
- `GET /api/sync/status` - Get sync status

### Notes
- `GET /api/notes` - List all notes
- `GET /api/notes/:uuid` - Get specific note
- `DELETE /api/notes/:uuid` - Delete note

### Attachments
- `POST /api/attachments` - Upload attachment (TODO)
- `GET /api/attachments/:hash` - Download attachment (TODO)

## Database Schema

See `src/utils/migrate.ts` for complete schema.

Main tables:
- `users` - User accounts
- `devices` - User devices
- `notes` - Note metadata and content
- `sync_log` - Change tracking
- `attachments` - File metadata

## Security

- JWT-based authentication with refresh tokens
- Bcrypt password hashing (12 rounds)
- Rate limiting (100 req/15min per IP)
- Helmet security headers
- CORS configuration

## License

MIT
