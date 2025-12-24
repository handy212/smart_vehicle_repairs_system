# Development Data Seeding Guide

This guide explains all available seed commands for populating your development database with test data.

## Quick Start

### Option 1: Full Demo Environment (Recommended for Testing)
```bash
cd /home/dev/smart_vehicle_repairs_system
source venv-dev/bin/activate
export DJANGO_SETTINGS_MODULE=config.settings.development

# Seed everything (demo users + inventory data)
python manage.py seed_demo_data
python manage.py seed_dev_data
```

### Option 2: Minimal Setup (Production-Like)
Just run the dev server - essential data is auto-seeded:
```bash
bash scripts/dev-server.sh
```

---

## Auto-Seeded Data (Runs on Every Dev Server Start)

These are **automatically** run by `bash scripts/dev-server.sh`:

| Command | What It Seeds | Count |
|---------|--------------|-------|
| `init_permissions` | Roles & Permissions | 155 permissions, 8 roles |
| `init_settings` | System Settings | 102 settings |
| `create_all_email_templates` | Email Templates | 19 templates |
| `setup_invoice_email_templates` | Invoice Email Templates | 4 templates |
| `create_inspection_templates` | Inspection Checklists | 6 templates |
| `seed_aa_membership` | Subscription Packages | 4 AA packages |

**Total**: ~280+ essential configuration items

---

## Optional Demo Data Seeds (Run Manually)

### 1. Demo Users & Sample Data

**Command:**
```bash
python manage.py seed_demo_data
```

**What it creates:**
- ✅ **16 demo users** (2 per role)
  - Admins (superusers)
  - Managers
  - Service Coordinators
  - Receptionists
  - Technicians
  - Parts Managers
  - Accountants
  - Customers
- ✅ **2 branches** (HQ and West)
- ✅ **2 customer profiles** with notes
- ✅ **4 vehicles** (2 per customer)
- ✅ **Sample inventory** parts and transactions

**Default credentials:**
- Email: `demo.{role}{number}@demo.local`
- Password: `demo12345`

**Examples:**
```
Email: demo.admin1@demo.local      Password: demo12345
Email: demo.manager1@demo.local    Password: demo12345
Email: demo.technician1@demo.local Password: demo12345
Email: demo.customer1@demo.local   Password: demo12345
```

**Options:**
- `--users-per-role 3` - Create 3 users per role instead of 2
- `--password "mypass"` - Use custom password instead of "demo12345"
- `--email-domain "test.com"` - Use different domain
- `--prefix "test"` - Use different prefix

**Idempotent:** ✅ Safe to re-run (won't create duplicates)

---

### 2. Development Inventory Data

**Command:**
```bash
python manage.py seed_dev_data
```

**What it creates:**
- ✅ **10 part categories** (Engine, Brakes, Suspension, Electrical, Filters, Fluids, Belts & Hoses, Lighting, Body Parts, Interior)
- ✅ **5 suppliers**:
  - AutoZone Parts
  - NAPA Auto Parts (preferred)
  - OEM Direct
  - Budget Auto Supply
  - Premium Parts Co (preferred)
- ✅ **25+ inventory parts** with realistic pricing:
  - Engine parts (oil filters, air filters, spark plugs, etc.)
  - Brake parts (pads, rotors, fluids)
  - Suspension (struts, ball joints)
  - Fluids (motor oil, coolant, transmission fluid)
  - Electrical (batteries, alternators, starters)
  - Lighting (bulbs, LED kits)
  - Low stock items (for alert testing)
- ✅ **5-8 purchase orders** with varying statuses
- ✅ **Sample customers and vehicles**

**Options:**
- `--clear` - ⚠️ **DESTRUCTIVE!** Clears all existing data first

**Idempotent:** ✅ Safe to re-run (won't create duplicates)

---

## Specialized Seeds

### 3. AA Membership Packages (Auto-Seeded)

**Command:**
```bash
python manage.py seed_aa_membership
```

**What it creates:**
- AA Basic ($195/year) - 8 service calls, 30km towing
- AA Plus ($295/year) - 9 service calls, 50km towing  
- AA Premier ($395/year) - 14 service calls, 70km towing
- AA Platinum ($595/year) - 24 service calls, 100km towing

**Features per package:**
- Roadside first aid
- Towing services (varying km)
- Call-out charges
- Emergency fuel
- Key lock-out assistance
- Accident estimates
- Pre-purchase inspections
- Battery boosts
- Flat tire service

---

## Recommended Workflows

### For Feature Development
```bash
# Start fresh with full demo data
bash scripts/dev-server.sh
python manage.py seed_demo_data
python manage.py seed_dev_data
```

### For Testing Subscriptions
```bash
# Essential data + demo customers
bash scripts/dev-server.sh
python manage.py seed_demo_data
# AA packages are already auto-seeded
```

### For Production-Like Environment
```bash
# Only essential configuration
bash scripts/dev-server.sh
# Then create real data manually via UI
```

---

## Resetting Development Data

### Soft Reset (Keep Users, Clear Data)
```bash
python manage.py seed_dev_data --clear
python manage.py seed_dev_data
```

### Hard Reset (Nuclear Option)
```bash
# ⚠️ WARNING: This deletes EVERYTHING!
python manage.py flush
python manage.py migrate
bash scripts/dev-server.sh  # Re-seeds essential data
python manage.py createsuperuser  # Create your admin
```

---

## Troubleshooting

### "No admin user found"
**Solution:** Create an admin/superuser first:
```bash
python manage.py createsuperuser
```

### "Command not found"
**Solution:** Activate the virtual environment:
```bash
source venv-dev/bin/activate
export DJANGO_SETTINGS_MODULE=config.settings.development
```

### Duplicate Key Errors
**Solution:** Most commands are idempotent (safe to re-run). If you see duplicates, they're being skipped automatically.

---

## Summary

✅ **Auto-seeded on every dev server start:**
- Permissions, Settings, Templates, AA Packages (~280 items)

🔧 **Optional for development/testing:**
- `seed_demo_data` - Demo users & sample data
- `seed_dev_data` - Full inventory & purchase orders

🎯 **Recommended for most developers:**
```bash
bash scripts/dev-server.sh
python manage.py seed_demo_data
```

This gives you a fully populated development environment with test users and realistic data!
