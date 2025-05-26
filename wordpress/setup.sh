#!/bin/bash

# FynMesh WordPress Development Environment Setup

echo "🚀 Setting up FynMesh WordPress Development Environment..."

# Create wp-content directory if it doesn't exist
if [ ! -d "wp-content" ]; then
    echo "📁 Creating wp-content directory..."
    mkdir -p wp-content/{plugins,themes,uploads}
fi

# Start Docker containers
echo "🐳 Starting Docker containers..."
docker-compose up -d

# Wait for WordPress to be ready
echo "⏳ Waiting for WordPress to be ready..."
sleep 30

# Check if WordPress is accessible
echo "🔍 Checking WordPress accessibility..."
if curl -s http://localhost:8080 > /dev/null; then
    echo "✅ WordPress is running!"
    echo ""
    echo "🌐 Access your WordPress site:"
    echo "   WordPress: http://localhost:8080"
    echo "   phpMyAdmin: http://localhost:8081"
    echo ""
    echo "📋 Database credentials:"
    echo "   Database: wordpress"
    echo "   Username: wordpress"
    echo "   Password: wordpress"
    echo ""
    echo "🔧 To complete setup:"
    echo "   1. Visit http://localhost:8080"
    echo "   2. Follow the WordPress installation wizard"
    echo "   3. Create your admin account"
    echo ""
    echo "🛑 To stop the environment:"
    echo "   docker-compose down"
    echo ""
    echo "🗑️  To reset everything (removes all data):"
    echo "   docker-compose down -v"
else
    echo "❌ WordPress is not accessible. Check Docker logs:"
    echo "   docker-compose logs wordpress"
fi
