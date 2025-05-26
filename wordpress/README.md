# WordPress Development Environment

This directory contains a Docker-based WordPress development environment for testing and developing FynMesh integrations.

## Directory Structure

```
wordpress/
├── README.md                           # This file
├── docker-compose.yml                  # Docker services configuration
├── setup.sh                           # Quick setup script
├── env.example                        # Environment variables example
├── .gitignore                         # Git ignore rules
└── wp-content/                        # WordPress content directory (created on first run)
    ├── plugins/                       # Custom plugins
    ├── themes/                        # Custom themes
    └── uploads/                       # Media uploads
```

## Quick Start

### Option 1: Automated Setup (Recommended)

```bash
cd wordpress
./setup.sh
```

### Option 2: Manual Setup

```bash
cd wordpress
docker-compose up -d
```

Then visit http://localhost:8080 to complete WordPress installation.

## What's Included

This environment provides:
- **WordPress** at http://localhost:8080
- **MySQL 8.0** database
- **phpMyAdmin** at http://localhost:8081 (database management)
- **Redis** at localhost:6379 (optional caching)
- **CORS enabled** for REST API access
- **Debug mode enabled** for development

## Default Credentials

- **Database Name:** wordpress
- **Database User:** wordpress
- **Database Password:** wordpress
- **Root Password:** rootpassword

## WordPress Installation

1. Visit http://localhost:8080
2. Select your language
3. Create admin account:
   - Username: (your choice)
   - Password: (your choice)
   - Email: (your choice)
4. Complete installation

## Managing the Environment

### Start the environment:
```bash
docker-compose up -d
```

### Stop the environment:
```bash
docker-compose down
```

### Reset everything (removes all data):
```bash
docker-compose down -v
```

### View logs:
```bash
docker-compose logs wordpress
docker-compose logs db
```

## WordPress REST API

The environment is pre-configured with CORS headers for REST API access. You can test the API:

```bash
# Get all posts
curl http://localhost:8080/wp-json/wp/v2/posts

# Get all pages
curl http://localhost:8080/wp-json/wp/v2/pages

# Get site info
curl http://localhost:8080/wp-json/wp/v2/
```

## Development Tips

1. **Custom Plugins/Themes:** Place them in `wp-content/plugins/` or `wp-content/themes/`
2. **Database Access:** Use phpMyAdmin at http://localhost:8081
3. **Debug Logs:** Check `wp-content/debug.log` for WordPress errors
4. **Redis Cache:** Available at localhost:6379 for caching plugins

## Troubleshooting

### Common Issues:

1. **Port conflicts:** Change ports in docker-compose.yml if 8080/8081 are in use
2. **Permission issues:** Ensure Docker has proper permissions
3. **WordPress not loading:** Check `docker-compose logs wordpress`
4. **Database connection errors:** Verify MySQL container is running

### Useful Commands:

```bash
# Check container status
docker-compose ps

# Restart a specific service
docker-compose restart wordpress

# Access WordPress container shell
docker-compose exec wordpress bash

# Access MySQL directly
docker-compose exec db mysql -u wordpress -p wordpress
```

## Next Steps

Once WordPress is running, you can:
1. Install plugins for FynMesh integration
2. Create custom themes with micro-frontend support
3. Develop Gutenberg blocks as FynApps
4. Set up headless WordPress for FynMesh applications

## License

[Apache 2.0](LICENSE)
