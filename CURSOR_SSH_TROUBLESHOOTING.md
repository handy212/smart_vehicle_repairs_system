# Cursor SSH Remote Connection Troubleshooting Guide

## Issues Identified

1. **Stale Connection**: Cursor client is trying to connect to old ports (38235, 37417) that no longer exist
2. **Windows SSH Config Permission Error**: `EPERM: operation not permitted` when reading SSH config
3. **Connection Refused**: TCP forwarding connections are being refused

## Solutions

### Solution 1: Clean Up Stale Cursor Server Processes (Remote Server)

Run this on the remote server (172.16.20.59):

```bash
# Option A: Use the cleanup script
bash /opt/smart_vehicle_repairs_system/scripts/fix-cursor-remote.sh

# Option B: Manual cleanup
# Kill all cursor-server processes
pkill -f "cursor-server"
pkill -f "multiplex-server"

# Clean up old lock and token files
find /tmp -name "cursor-remote-lock.*" -type f -mmin +60 -delete 2>/dev/null
find /tmp -name "cursor-remote-*.token.*" -type f -mmin +60 -delete 2>/dev/null
```

### Solution 2: Fix Windows SSH Config Permission Issue

The error `EPERM: operation not permitted, open 'C:\Users\Admin Computer\.ssh\config'` indicates a permissions problem.

**Fix on Windows:**

1. **Check file permissions:**
   ```powershell
   # Run PowerShell as Administrator
   icacls "C:\Users\Admin Computer\.ssh\config"
   ```

2. **Fix permissions:**
   ```powershell
   # Grant full control to your user
   icacls "C:\Users\Admin Computer\.ssh\config" /grant "${env:USERNAME}:(F)"
   
   # Or remove and recreate the file
   Remove-Item "C:\Users\Admin Computer\.ssh\config" -Force
   New-Item "C:\Users\Admin Computer\.ssh\config" -ItemType File
   ```

3. **Fix folder permissions:**
   ```powershell
   # Ensure the .ssh folder has correct permissions
   icacls "C:\Users\Admin Computer\.ssh" /grant "${env:USERNAME}:(OI)(CI)F"
   ```

4. **Alternative: Use a different SSH config location**
   - Create the config file in a location without spaces in the path
   - Or use SSH config in `C:\Users\AdminComputer\.ssh\config` (without space)

### Solution 3: Reconnect Cursor to Remote Server

1. **In Cursor (Windows):**
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type: `Remote-SSH: Kill VS Code Server on Host`
   - Select your remote host: `ssh root@172.16.20.59`
   - Wait for it to complete

2. **Disconnect and reconnect:**
   - Press `Ctrl+Shift+P`
   - Type: `Remote-SSH: Close Remote Connection`
   - Then reconnect: `Remote-SSH: Connect to Host` → `ssh root@172.16.20.59`

3. **If still failing, uninstall and reinstall the server:**
   - Press `Ctrl+Shift+P`
   - Type: `Remote-SSH: Uninstall VS Code Server from Host`
   - Select: `ssh root@172.16.20.59`
   - Then reconnect (it will reinstall automatically)

### Solution 4: Verify SSH Server Configuration

The SSH server configuration is correct (TCP forwarding is enabled), but verify:

```bash
# On remote server (172.16.20.59)
sudo grep -E "AllowTcpForwarding|PermitTunnel" /etc/ssh/sshd_config
sudo sshd -T | grep -E "allowtcpforwarding|permittunnel"

# Should show:
# allowtcpforwarding yes
# permittunnel no
```

### Solution 5: Check Firewall Rules

Ensure no firewall is blocking the forwarded ports:

```bash
# On remote server
sudo iptables -L -n | grep -E "38235|37417|42151"
sudo ufw status  # if using UFW
```

### Solution 6: Use SSH Key Authentication

To avoid password prompts and improve connection stability:

1. **Generate SSH key on Windows (if not exists):**
   ```powershell
   ssh-keygen -t ed25519 -C "cursor-remote"
   ```

2. **Copy public key to remote server:**
   ```powershell
   type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@172.16.20.59 "cat >> ~/.ssh/authorized_keys"
   ```

3. **Test connection:**
   ```powershell
   ssh root@172.16.20.59
   ```

## Quick Fix Summary

**On Windows:**
1. Fix SSH config permissions (Solution 2)
2. Kill and reconnect Cursor remote connection (Solution 3)

**On Remote Server:**
1. Run cleanup script: `bash /opt/smart_vehicle_repairs_system/scripts/fix-cursor-remote.sh`
2. Wait 30 seconds
3. Try reconnecting from Cursor

## Prevention

1. **Use SSH keys** instead of passwords
2. **Keep Cursor updated** to the latest version
3. **Regularly clean up** old lock files (run cleanup script weekly)
4. **Avoid spaces in Windows usernames** (use `AdminComputer` instead of `Admin Computer`)

## Still Having Issues?

1. Check Cursor logs: `Help` → `Toggle Developer Tools` → `Console` tab
2. Check remote server logs: `/tmp/cursor-remote-*.log.*`
3. Verify SSH connection works: `ssh root@172.16.20.59` from command line
4. Try connecting from a different Windows machine to isolate the issue

