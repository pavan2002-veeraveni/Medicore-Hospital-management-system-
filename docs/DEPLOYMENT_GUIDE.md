# MediCore Deployment Guide

## Overview
This guide covers deploying MediCore in local, staging, and production-like environments.

---

## Local Development

### Prerequisites
- Node.js >= 20, npm >= 10
- Python >= 3.10
- Docker & Docker Compose
- Git

### Quick Start
```bash
cp .env.example .env
docker compose up --build -d
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Docs: http://localhost:4000/api-docs
- Analytics: http://localhost:8000/docs

---

## Docker Compose Deployment

### Start
```bash
docker compose up --build -d
```

### Stop
```bash
docker compose down
```

### View Logs
```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f analytics
```

### Database Operations
```bash
# Backup
docker exec medicore-postgres pg_dump -U medicore_user medicore_db > backup_$(date +%Y%m%d).sql

# Restore
docker exec -i medicore-postgres psql -U medicore_user medicore_db < backup.sql

# Run migrations
docker exec medicore-api npx prisma migrate deploy

# Seed data
docker exec medicore-api npx tsx prisma/seed.ts
```

---

## Production Deployment Considerations

### Security Checklist
- [ ] Change all default passwords and secrets in .env
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Enable HTTPS via reverse proxy (Nginx/Caddy)
- [ ] Set `NODE_ENV=production`
- [ ] Restrict CORS to production domain
- [ ] Do not expose PostgreSQL port publicly
- [ ] Do not expose Redis port publicly
- [ ] Use read-only database user for analytics service
- [ ] Enable rate limiting
- [ ] Review and restrict Helmet security headers

### Environment Variables
Required secrets (never commit):
- `JWT_ACCESS_SECRET` - 32+ char random string
- `JWT_REFRESH_SECRET` - 32+ char random string
- `POSTGRES_PASSWORD` - Strong database password
- `ANALYTICS_API_KEY` - Internal API authentication

### HTTPS Setup (Nginx)
```nginx
server {
    listen 443 ssl;
    server_name medicore.example.com;

    ssl_certificate /etc/letsencrypt/live/medicore.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/medicore.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Monitoring
- Health: `GET /health` on each service
- Readiness: `GET /ready` (checks database)
- Structured logs: JSON format in production
- Audit logs: append-only in `audit_logs` table

### Backup Strategy
- Automated daily database backups
- Retain 30 days of backups
- Test restore procedure monthly
- Store backups in separate storage

---

## GitHub Actions CI/CD

Required secrets in GitHub:
- `DATABASE_URL` (for migration tests)
- `JWT_ACCESS_SECRET` (for test environment)
- `JWT_REFRESH_SECRET` (for test environment)

Pipeline stages:
1. Lint + Type check
2. Unit tests (backend, frontend, analytics)
3. Security scanning
4. Docker build
5. Migration validation
6. Deploy to staging (auto on `develop`)
7. Deploy to production (manual approval on `main`)
