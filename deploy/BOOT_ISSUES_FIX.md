# Server Boot Issues - Fixed

## Problem
After server reboot, login was failing with 400 errors even though services appeared to be running.

## Root Causes Identified

1. **Service Dependencies**: Services were starting before dependencies (PostgreSQL, Redis) were fully ready
2. **No Health Checks**: No automated way to verify services are working after boot
3. **Service Configuration**: Services didn't wait for database/redis to be ready before starting

## Solutions Implemented

### 1. Improved Service Files (`setup-services.sh`)
- Added `Requires=` directives to ensure dependencies start first
- Added `ExecStartPre=` checks that wait for PostgreSQL and Redis to be ready
- Changed Gunicorn binding to `0.0.0.0:8000` (was unix socket in template, but actual service uses port)
- Added better logging and error handling
- Added timeout configurations

### 2. Health Check Script (`health-check.sh`)
- Checks if all services are running
- Verifies database exists and is accessible
- Checks file permissions
- Tests API connectivity
- Automatically starts failed services

### 3. Boot Verification Script (`ensure-services-on-boot.sh`)
- Ensures all services are enabled to start on boot
- Verifies service configuration

## Usage

### After Server Reboot

1. **Run health check**:
   ```bash
   sudo bash /opt/smart_vehicle_repairs_system/deploy/health-check.sh
   ```

2. **Verify services are enabled**:
   ```bash
   sudo bash /opt/smart_vehicle_repairs_system/deploy/ensure-services-on-boot.sh
   ```

3. **Check service status**:
   ```bash
   systemctl status svr svr-celery svr-celerybeat svr-nextjs
   ```

### If Login Still Fails

The login endpoint requires reCAPTCHA if configured. Check:

1. **Is reCAPTCHA enabled?**
   ```bash
   grep RECAPTCHA /var/www/svr/.env
   ```

2. **Check login logs**:
   ```bash
   journalctl -u svr -f | grep "POST /api/auth/token"
   ```

3. **Test API directly**:
   ```bash
   curl -X POST http://localhost:8000/api/auth/token/ \
     -H "Content-Type: application/json" \
     -d '{"username":"your_username","password":"your_password","recaptcha_token":"test"}'
   ```

## Service Dependencies

Services now properly wait for:
- **svr** (Gunicorn): Waits for PostgreSQL and Redis
- **svr-celery**: Waits for Redis and PostgreSQL
- **svr-celerybeat**: Waits for Redis and PostgreSQL
- **svr-nextjs**: Only needs network

## Prevention

All services are now configured with:
- `Restart=always` - Auto-restart on failure
- `RestartSec=10` - Wait 10 seconds before restart
- Dependency checks before starting
- Proper logging to systemd journal

## Files Modified

1. `/opt/smart_vehicle_repairs_system/deploy/setup-services.sh` - Improved service configurations
2. `/opt/smart_vehicle_repairs_system/deploy/health-check.sh` - New health check script
3. `/opt/smart_vehicle_repairs_system/deploy/ensure-services-on-boot.sh` - New boot verification script

## Next Steps

If you update service configurations, run:
```bash
sudo bash /opt/smart_vehicle_repairs_system/deploy/setup-services.sh
sudo systemctl daemon-reload
sudo systemctl restart svr svr-celery svr-celerybeat
```




