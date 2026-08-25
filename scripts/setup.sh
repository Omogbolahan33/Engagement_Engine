#!/bin/bash
# Engagement Platform - Development Setup Script

set -e

echo "🚀 Setting up Engagement Platform..."

# Check prerequisites
check_prerequisite() {
  if ! command -v $1 &> /dev/null; then
    echo "❌ $1 is required but not installed."
    exit 1
  fi
  echo "✅ $1 found"
}

echo ""
echo "Checking prerequisites..."
check_prerequisite node
check_prerequisite npm
check_prerequisite psql
check_prerequisite redis-cli

# Setup backend
echo ""
echo "📦 Setting up backend..."
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
cd ..

# Setup frontend
echo ""
echo "📦 Setting up frontend..."
cd frontend
npm install
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  npm run dev"
echo ""
echo "This will start:"
echo "  - Backend API at http://localhost:3001"
echo "  - Frontend at http://localhost:3000"
echo ""
echo "Demo credentials:"
echo "  Email: demo@engagement-platform.com"
echo "  Password: Demo123!"
