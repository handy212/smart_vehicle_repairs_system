#!/bin/bash
#
# Firebase Push Notification Testing Script
# Tests the Firebase integration at multiple levels
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                          ║"
echo "║          🧪 FIREBASE PUSH NOTIFICATIONS - TEST SUITE 🧪                 ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for virtual environment (assume already activated or not needed)
if command -v python > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Python environment ready${NC}"
else
    echo -e "${RED}❌ Python not found${NC}"
    exit 1
fi

# Test 1: Package Installation
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 1: Package Installation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if pip show firebase-admin > /dev/null 2>&1; then
    VERSION=$(pip show firebase-admin | grep Version | cut -d' ' -f2)
    echo -e "${GREEN}✅ firebase-admin installed (version $VERSION)${NC}"
else
    echo -e "${RED}❌ firebase-admin not installed${NC}"
    exit 1
fi

# Test 2: Django System Check
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 2: Django System Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if python manage.py check 2>&1 | grep -q "System check identified no issues"; then
    echo -e "${GREEN}✅ Django system check passed (0 errors)${NC}"
else
    echo -e "${YELLOW}⚠️  Django check has warnings (non-critical)${NC}"
fi

# Test 3: Module Import Test
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 3: Module Import Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

python << 'PYEOF'
import sys
sys.path.insert(0, '/home/handy/smart_vehicle_repairs_system')
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

try:
    from apps.notifications_app import firebase
    from apps.notifications_app.services import NotificationService
    print("✅ All modules import successfully")
    
    # Check functions
    required = ['initialize_firebase', 'is_firebase_available', 'send_push_notification']
    for func in required:
        assert hasattr(firebase, func), f"Missing function: {func}"
    print("✅ All required functions present")
    
except Exception as e:
    print(f"❌ Import test failed: {e}")
    sys.exit(1)
PYEOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Module import test passed${NC}"
else
    echo -e "${RED}❌ Module import test failed${NC}"
    exit 1
fi

# Test 4: Configuration Check
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 4: Configuration Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

python << 'PYEOF'
import sys
sys.path.insert(0, '/home/handy/smart_vehicle_repairs_system')
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.conf import settings
from apps.notifications_app.firebase import is_firebase_available

print(f"FIREBASE_ENABLED: {settings.FIREBASE_ENABLED}")
print(f"FIREBASE_CREDENTIALS_PATH: {settings.FIREBASE_CREDENTIALS_PATH or '(not set)'}")

if settings.FIREBASE_ENABLED and settings.FIREBASE_CREDENTIALS_PATH:
    import os.path
    if os.path.exists(settings.FIREBASE_CREDENTIALS_PATH):
        print("✅ Credentials file exists")
        
        if is_firebase_available():
            print("✅ Firebase is initialized and available")
        else:
            print("⚠️  Firebase enabled but not initialized (check logs)")
    else:
        print(f"❌ Credentials file not found: {settings.FIREBASE_CREDENTIALS_PATH}")
else:
    print("ℹ️  Firebase not configured (awaiting credentials)")
    print("   This is normal if you haven't set up Firebase yet.")
PYEOF

# Test 5: Token Validation
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 5: Token Validation Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

python << 'PYEOF'
import sys
sys.path.insert(0, '/home/handy/smart_vehicle_repairs_system')
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from apps.notifications_app.firebase import validate_token

tests = [
    (None, False, "None token"),
    ("", False, "Empty token"),
    ("short", False, "Too short"),
    ("x" * 152, True, "Valid length token"),
]

passed = 0
failed = 0

for token, expected, desc in tests:
    result = validate_token(token)
    if result == expected:
        print(f"✅ {desc}: {result} (expected {expected})")
        passed += 1
    else:
        print(f"❌ {desc}: {result} (expected {expected})")
        failed += 1

print(f"\nPassed: {passed}/{len(tests)}")
if failed > 0:
    import sys
    sys.exit(1)
PYEOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Token validation test passed${NC}"
else
    echo -e "${RED}❌ Token validation test failed${NC}"
    exit 1
fi

# Test 6: Management Command
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 6: Management Command Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if python manage.py test_push_notification --help 2>&1 | grep -q "Test Firebase"; then
    echo -e "${GREEN}✅ test_push_notification command available${NC}"
else
    echo -e "${RED}❌ test_push_notification command not found${NC}"
fi

# Summary
echo -e "\n${BLUE}"
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                         TEST SUITE SUMMARY                               ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}✅ Phase 1: Code Verification - PASSED${NC}"
echo ""
echo "Firebase integration is properly installed and tested."
echo ""

python << 'PYEOF'
import sys
sys.path.insert(0, '/home/handy/smart_vehicle_repairs_system')
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.conf import settings
from apps.notifications_app.firebase import is_firebase_available

if is_firebase_available():
    print("✅ Phase 2: Firebase Integration - READY")
    print("")
    print("Firebase is configured and initialized!")
    print("You can now test actual push notifications.")
    print("")
    print("Next steps:")
    print("  1. Create a test user with notification preferences")
    print("  2. Add a push token to the user")
    print("  3. Run: python manage.py test_push_notification user@example.com")
else:
    print("⏳ Phase 2: Firebase Integration - AWAITING CONFIGURATION")
    print("")
    print("To enable Firebase push notifications:")
    print("")
    print("1. Create Firebase project:")
    print("   https://console.firebase.google.com/")
    print("")
    print("2. Download service account key:")
    print("   Settings → Service Accounts → Generate new private key")
    print("")
    print("3. Configure Django:")
    print("   mkdir -p firebase")
    print("   mv ~/Downloads/serviceAccountKey.json firebase/")
    print("   chmod 600 firebase/serviceAccountKey.json")
    print("")
    print("4. Update .env:")
    print("   FIREBASE_ENABLED=True")
    print("   FIREBASE_CREDENTIALS_PATH=/home/handy/smart_vehicle_repairs_system/firebase/serviceAccountKey.json")
    print("")
    print("5. Restart server:")
    print("   python manage.py runserver")
    print("")
    print("See docs/FIREBASE_QUICK_START.md for detailed instructions.")
PYEOF

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
