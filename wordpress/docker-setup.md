# Docker Setup Guide

This guide provides complete instructions for setting up Docker on your system to run the WordPress development environment.

## macOS Setup

### Option 1: Docker Desktop (Recommended)

1. **Download Docker Desktop:**
   - Visit https://www.docker.com/products/docker-desktop/
   - Click "Download for Mac"
   - Choose the appropriate version:
     - **Apple Silicon (M1/M2/M3):** Download "Mac with Apple chip"
     - **Intel:** Download "Mac with Intel chip"

2. **Install Docker Desktop:**
   - Open the downloaded `.dmg` file
   - Drag Docker to your Applications folder
   - Launch Docker from Applications

3. **Complete Setup:**
   - Docker will ask for system permissions - grant them
   - Sign in with Docker Hub account (optional but recommended)
   - Accept the service agreement
   - Wait for Docker to start (you'll see a whale icon in your menu bar)

4. **Verify Installation:**
   ```bash
   docker --version
   docker-compose --version
   ```

### Option 2: Homebrew Installation

```bash
# Install Docker Desktop via Homebrew
brew install --cask docker

# Launch Docker Desktop
open /Applications/Docker.app
```

## Windows Setup

### Docker Desktop for Windows

1. **System Requirements:**
   - Windows 10/11 64-bit
   - WSL 2 feature enabled
   - Virtualization enabled in BIOS

2. **Download and Install:**
   - Visit https://www.docker.com/products/docker-desktop/
   - Download "Docker Desktop for Windows"
   - Run the installer
   - Restart when prompted

3. **Enable WSL 2:**
   ```powershell
   # Run in PowerShell as Administrator
   wsl --install
   wsl --set-default-version 2
   ```

## Linux Setup

### Ubuntu/Debian

```bash
# Update package index
sudo apt update

# Install prerequisites
sudo apt install apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Log out and back in for group changes to take effect
```

### CentOS/RHEL/Fedora

```bash
# Install Docker
sudo dnf install docker docker-compose

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
```

## Verification Steps

After installation, verify Docker is working:

```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker compose version

# Test Docker installation
docker run hello-world

# Check Docker daemon status
docker info
```

## Common Issues and Solutions

### Issue: "Cannot connect to the Docker daemon"

**Solution:**
```bash
# Check if Docker is running
docker info

# Start Docker Desktop (macOS/Windows)
open /Applications/Docker.app

# Start Docker service (Linux)
sudo systemctl start docker
```

### Issue: "Permission denied" errors

**Solution:**
```bash
# Add user to docker group (Linux)
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker
```

### Issue: Docker Desktop won't start on macOS

**Solutions:**
1. **Reset Docker Desktop:**
   - Click Docker icon in menu bar
   - Select "Troubleshoot" → "Reset to factory defaults"

2. **Check system requirements:**
   - macOS 10.15 or newer
   - At least 4GB RAM

3. **Restart Docker:**
   ```bash
   killall Docker && open /Applications/Docker.app
   ```

### Issue: WSL 2 issues on Windows

**Solutions:**
1. **Enable WSL 2:**
   ```powershell
   dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
   dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
   ```

2. **Update WSL 2:**
   - Download WSL 2 kernel update from Microsoft
   - Install and restart

### Issue: Port conflicts

**Solution:**
```bash
# Check what's using port 8080
lsof -i :8080

# Kill process using the port
sudo kill -9 <PID>

# Or change ports in docker-compose.yml
```

## Docker Desktop Configuration

### Recommended Settings:

1. **Resources:**
   - Memory: 4GB minimum, 8GB recommended
   - CPUs: 2 minimum, 4 recommended
   - Disk: 60GB minimum

2. **Features:**
   - Enable "Use Docker Compose V2"
   - Enable "Use containerd for pulling and storing images"

3. **File Sharing:**
   - Ensure your project directory is accessible to Docker

## Testing the WordPress Environment

Once Docker is properly installed and running:

```bash
# Navigate to wordpress directory
cd wordpress

# Run the setup script
./setup.sh

# Or manually start services
docker compose up -d

# Check container status
docker compose ps

# View logs if needed
docker compose logs wordpress
```

## Useful Docker Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View running containers
docker ps

# View all containers
docker ps -a

# Remove all containers and volumes
docker compose down -v

# View logs
docker compose logs [service-name]

# Execute commands in container
docker compose exec wordpress bash

# Rebuild containers
docker compose up --build
```

## Getting Help

If you encounter issues:

1. **Check Docker Desktop logs:**
   - macOS: `~/Library/Containers/com.docker.docker/Data/log/`
   - Windows: `%APPDATA%\Docker\log\`

2. **Docker Community:**
   - Docker Forums: https://forums.docker.com/
   - Stack Overflow: Tag questions with `docker`

3. **Official Documentation:**
   - https://docs.docker.com/get-started/

## Next Steps

After Docker is installed and working:
1. Return to the main README.md
2. Run `./setup.sh` to start WordPress
3. Visit http://localhost:8080 to complete WordPress installation
