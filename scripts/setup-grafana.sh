#!/bin/bash

# Grafana Setup Script for DAO Copilot WebSocket Monitoring
# This script sets up Grafana with Docker and configures dashboards and alerting

set -euo pipefail

# Configuration
GRAFANA_VERSION="10.2.0"
GRAFANA_PORT="3000"
GRAFANA_DATA_DIR="./grafana-data"
GRAFANA_CONFIG_DIR="./src/monitoring/grafana"
PROMETHEUS_URL="http://host.docker.internal:9090"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    log_info "Checking Docker availability..."
    if ! docker --version &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_success "Docker is available"
}

# Create necessary directories
setup_directories() {
    log_info "Setting up directories..."
    
    # Create Grafana data directory
    mkdir -p "$GRAFANA_DATA_DIR"
    mkdir -p "$GRAFANA_DATA_DIR/dashboards"
    mkdir -p "$GRAFANA_DATA_DIR/provisioning/datasources"
    mkdir -p "$GRAFANA_DATA_DIR/provisioning/dashboards"
    mkdir -p "$GRAFANA_DATA_DIR/provisioning/alerting"
    
    # Set proper permissions (Grafana runs as user ID 472)
    if [[ "$OSTYPE" != "msys" ]]; then
        sudo chown -R 472:472 "$GRAFANA_DATA_DIR" 2>/dev/null || {
            log_warning "Could not set Grafana directory permissions. You may need to run: sudo chown -R 472:472 $GRAFANA_DATA_DIR"
        }
    fi
    
    log_success "Directories created"
}

# Copy configuration files
copy_configs() {
    log_info "Copying configuration files..."
    
    # Copy dashboards
    cp "$GRAFANA_CONFIG_DIR/dashboards/"*.json "$GRAFANA_DATA_DIR/dashboards/" 2>/dev/null || {
        log_warning "No dashboard files found to copy"
    }
    
    # Copy provisioning configs
    cp "$GRAFANA_CONFIG_DIR/provisioning/"*.yml "$GRAFANA_DATA_DIR/provisioning/datasources/" 2>/dev/null || {
        log_warning "No datasource provisioning files found"
    }
    
    cp "$GRAFANA_CONFIG_DIR/provisioning/dashboards.yml" "$GRAFANA_DATA_DIR/provisioning/dashboards/" 2>/dev/null || {
        log_warning "No dashboard provisioning file found"
    }
    
    # Copy alert rules
    cp "$GRAFANA_CONFIG_DIR/alerts/"*.yml "$GRAFANA_DATA_DIR/provisioning/alerting/" 2>/dev/null || {
        log_warning "No alert rule files found"
    }
    
    log_success "Configuration files copied"
}

# Generate Grafana configuration
generate_grafana_config() {
    log_info "Generating Grafana configuration..."
    
    cat > "$GRAFANA_DATA_DIR/grafana.ini" << EOF
[server]
http_port = $GRAFANA_PORT
domain = localhost

[security]
admin_user = admin
admin_password = admin123
secret_key = SW2YcwTIb9zpOOhoPsMm

[analytics]
reporting_enabled = false
check_for_updates = false

[log]
mode = console
level = info

[paths]
data = /var/lib/grafana
logs = /var/log/grafana
plugins = /var/lib/grafana/plugins
provisioning = /etc/grafana/provisioning

[alerting]
enabled = true
execute_alerts = true

[unified_alerting]
enabled = true
EOF
    
    log_success "Grafana configuration generated"
}

# Start Grafana container
start_grafana() {
    log_info "Starting Grafana container..."
    
    # Stop existing container if running
    docker stop dao-copilot-grafana 2>/dev/null || true
    docker rm dao-copilot-grafana 2>/dev/null || true
    
    # Start new container
    docker run -d \
        --name dao-copilot-grafana \
        -p "$GRAFANA_PORT:$GRAFANA_PORT" \
        -v "$(pwd)/$GRAFANA_DATA_DIR:/var/lib/grafana" \
        -v "$(pwd)/$GRAFANA_DATA_DIR/grafana.ini:/etc/grafana/grafana.ini" \
        -v "$(pwd)/$GRAFANA_DATA_DIR/provisioning:/etc/grafana/provisioning" \
        -e "GF_SECURITY_ADMIN_PASSWORD=admin123" \
        -e "GF_USERS_ALLOW_SIGN_UP=false" \
        -e "GF_INSTALL_PLUGINS=redis-datasource" \
        --restart unless-stopped \
        grafana/grafana:$GRAFANA_VERSION
    
    log_success "Grafana container started"
}

# Wait for Grafana to be ready
wait_for_grafana() {
    log_info "Waiting for Grafana to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$GRAFANA_PORT/api/health" | grep -q "ok"; then
            log_success "Grafana is ready"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts - waiting for Grafana..."
        sleep 2
        ((attempt++))
    done
    
    log_error "Grafana failed to start within expected time"
    return 1
}

# Configure Grafana via API
configure_grafana() {
    log_info "Configuring Grafana via API..."
    
    local grafana_url="http://admin:admin123@localhost:$GRAFANA_PORT"
    
    # Update admin password if needed
    curl -s -X PUT "$grafana_url/api/user/password" \
        -H "Content-Type: application/json" \
        -d '{"oldPassword":"admin","newPassword":"admin123","confirmNew":"admin123"}' \
        > /dev/null || true
    
    # Set up notification channels (example)
    curl -s -X POST "$grafana_url/api/alert-notifications" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "webhook-alerts",
            "type": "webhook",
            "isDefault": false,
            "sendReminder": false,
            "settings": {
                "url": "http://localhost:3001/webhook/alerts",
                "httpMethod": "POST"
            }
        }' > /dev/null || log_warning "Could not create webhook notification channel"
    
    log_success "Grafana configured"
}

# Print access information
print_access_info() {
    log_success "Grafana setup completed!"
    echo ""
    echo "=================================================="
    echo "  DAO Copilot - Grafana Dashboard Access"
    echo "=================================================="
    echo ""
    echo -e "${BLUE}Dashboard URL:${NC} http://localhost:$GRAFANA_PORT"
    echo -e "${BLUE}Username:${NC} admin"
    echo -e "${BLUE}Password:${NC} admin123"
    echo ""
    echo -e "${YELLOW}Available Dashboards:${NC}"
    echo "  • WebSocket Monitoring - Comprehensive WebSocket metrics"
    echo ""
    echo -e "${YELLOW}Prerequisites:${NC}"
    echo "  • Prometheus running on port 9090"
    echo "  • DAO Copilot application with metrics endpoint active"
    echo ""
    echo -e "${YELLOW}Useful Commands:${NC}"
    echo "  • View logs: docker logs dao-copilot-grafana"
    echo "  • Stop Grafana: docker stop dao-copilot-grafana"
    echo "  • Restart Grafana: docker restart dao-copilot-grafana"
    echo ""
    echo "=================================================="
}

# Show help
show_help() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  start         Start Grafana with full setup (default)"
    echo "  stop          Stop Grafana container"
    echo "  restart       Restart Grafana container"
    echo "  logs          Show Grafana container logs"
    echo "  clean         Remove Grafana container and data"
    echo "  help          Show this help message"
    echo ""
}

# Main execution
main() {
    local action="${1:-start}"
    
    case "$action" in
        "start")
            check_docker
            setup_directories
            copy_configs
            generate_grafana_config
            start_grafana
            wait_for_grafana
            configure_grafana
            print_access_info
            ;;
        "stop")
            log_info "Stopping Grafana container..."
            docker stop dao-copilot-grafana 2>/dev/null || log_warning "Container not running"
            log_success "Grafana stopped"
            ;;
        "restart")
            log_info "Restarting Grafana container..."
            docker restart dao-copilot-grafana 2>/dev/null || {
                log_warning "Container not running, starting fresh..."
                main start
            }
            log_success "Grafana restarted"
            ;;
        "logs")
            docker logs -f dao-copilot-grafana 2>/dev/null || log_error "Container not found"
            ;;
        "clean")
            log_warning "This will remove all Grafana data and containers"
            read -p "Are you sure? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker stop dao-copilot-grafana 2>/dev/null || true
                docker rm dao-copilot-grafana 2>/dev/null || true
                rm -rf "$GRAFANA_DATA_DIR"
                log_success "Grafana cleaned up"
            else
                log_info "Clean up cancelled"
            fi
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "Unknown action: $action"
            show_help
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"
