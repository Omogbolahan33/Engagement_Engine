# Deployment Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- Domain name (for production)
- SSL certificate (Let's Encrypt recommended)

## Production Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y
```

### 2. Clone and Configure

```bash
git clone <repository-url>
cd engagement-platform

# Create production environment
cp backend/.env.example backend/.env
```

Edit `backend/.env` with production values:

```env
NODE_ENV=production
JWT_SECRET=<generate-64-char-random-string>
ENCRYPTION_KEY=<generate-32-byte-key>
DB_PASSWORD=<strong-database-password>
REDIS_PASSWORD=<strong-redis-password>
CORS_ORIGIN=https://your-domain.com
```

### 3. Generate Secrets

```bash
# JWT Secret (64 chars)
openssl rand -hex 32

# Encryption Key (32 bytes)
openssl rand -base64 32

# Database Password
openssl rand -hex 16
```

### 4. SSL Setup

```bash
# Install Certbot
sudo apt install certbot -y

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
mkdir -p docker/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem docker/ssl/
```

### 5. Update Nginx Config for SSL

Add to `docker/nginx.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ... rest of config
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### 6. Deploy

```bash
cd docker

# Build and start
docker compose up -d --build

# Run migrations
docker compose exec backend npx prisma migrate deploy

# Seed database (optional)
docker compose exec backend npx prisma db seed

# Check status
docker compose ps
docker compose logs -f
```

### 7. Verify

```bash
# Health check
curl https://your-domain.com/health

# API docs
curl https://your-domain.com/api/v1/docs
```

## Monitoring

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f worker
```

### Database Backup

```bash
# Backup
docker compose exec postgres pg_dump -U postgres engagement_platform > backup_$(date +%Y%m%d).sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U postgres engagement_platform
```

### Updates

```bash
cd engagement-platform
git pull

cd docker
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
```

## Scaling

### Add More Workers

```yaml
# docker-compose.yml
worker:
  deploy:
    replicas: 3
```

### Redis Cluster

For high availability, replace single Redis with Redis Cluster.

### Database Read Replicas

Configure read replicas in `DATABASE_URL` for analytics queries.

## Troubleshooting

### Common Issues

1. **Database connection failed**: Check PostgreSQL is running and DATABASE_URL is correct
2. **Redis connection failed**: Check Redis is running and password matches
3. **Migration errors**: Run `npx prisma migrate reset` to reset database
4. **Worker not processing**: Check worker logs with `docker compose logs worker`

### Reset Database

```bash
docker compose exec backend npx prisma migrate reset
docker compose exec backend npx prisma db seed
```
