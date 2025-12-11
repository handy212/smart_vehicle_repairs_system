# Code Library API Integration Guide

> **🚀 NEW: Hybrid System Implemented!**  
> See [HYBRID_CODE_LIBRARY_SYSTEM.md](./HYBRID_CODE_LIBRARY_SYSTEM.md) for complete documentation.

## Current Status

### ✅ What We Have
- **96 OBD-II codes** in local database
- Automatic population via migration
- Fast local lookups

### ❌ What's Missing
- **NOT all codes** - there are thousands of possible OBD-II codes
- Manufacturer-specific codes (P1xxx, P2xxx, P3xxx series)
- Extended codes for newer vehicles
- Real-time updates

## Available External APIs

### Free Options (Limited)

1. **OBD-Codes.com** (https://www.obd-codes.com)
   - Large database
   - May have API access (requires contact)
   - Rate limits apply

2. **OBD2AI** (https://www.obd2ai.com)
   - Free lookup tool
   - 11,000+ codes
   - No official API (would need scraping - not recommended)

3. **OBD-II Codes Database** (https://obd-2-codes.com)
   - Searchable database
   - Manual lookup available
   - May offer API access

### Paid/Commercial APIs (Recommended for Production)

1. **CarScan API** (https://dev.carscan.com/api)
   - ✅ Comprehensive vehicle diagnostic APIs
   - ✅ Includes TSBs, recalls, warranty info
   - ✅ Real-time updates
   - ❌ Requires API key and subscription
   - **Best for production use**

2. **OBD Fusion API**
   - Extensive code database
   - Real-time diagnostic data
   - Commercial license required

3. **AllData/Identifix APIs**
   - Professional diagnostic databases
   - Used by repair shops
   - Subscription-based

## Implementation Options

### Option 1: Fallback to External API (Current Implementation)

The lookup endpoint now supports external API fallback:

```
GET /api/diagnosis/code-library/lookup/?code_number=P3005&code_type=obd_ii&use_external=true
```

**How it works:**
1. First checks local database
2. If not found AND `use_external=true`, tries external APIs
3. Returns external data (optionally saves to local DB)

### Option 2: Integrate Paid API Service

For production, integrate a paid API:

```python
# In settings.py
CARSCAN_API_KEY = env('CARSCAN_API_KEY', default=None)

# In services/external_code_api.py
class CarScanAPIService:
    @staticmethod
    def lookup_code(code_number: str, api_key: str) -> Dict:
        headers = {"Authorization": f"Bearer {api_key}"}
        response = requests.get(
            f"https://api.carscan.com/v1/codes/{code_number}",
            headers=headers,
            timeout=5
        )
        return response.json()
```

### Option 3: Periodic Sync Job

Create a scheduled task to sync codes from external APIs:

```python
# management/commands/sync_code_library.py
class Command(BaseCommand):
    def handle(self, *args, **options):
        # Fetch popular codes from external API
        # Save to local database
        pass
```

Run via Celery Beat:
```python
@periodic_task(run_every=crontab(hours=24))  # Daily
def sync_popular_codes():
    # Sync most common codes
    pass
```

## Recommendation

### For Development/Testing
- Use current 96 codes (covers most common cases)
- Add codes manually via management command as needed

### For Production
1. **Short-term:** Keep current implementation + add popular codes manually
2. **Medium-term:** Integrate CarScan API or similar paid service
3. **Long-term:** Build hybrid system:
   - Local DB for fast lookups (cached popular codes)
   - External API for unknown codes
   - Periodic sync for code updates

## Adding More Codes Manually

### Via Management Command

Add codes to `populate_code_library.py`:

```python
codes = [
    # ... existing codes ...
    {'code_number': 'P3005', ...},  # Add new code
]
```

Then run:
```bash
python manage.py populate_code_library
```

### Via Admin Panel

Create Django admin interface for code management:
```python
@admin.register(DiagnosticCodeLibrary)
class DiagnosticCodeLibraryAdmin(admin.ModelAdmin):
    list_display = ['code_number', 'code_type', 'title', 'severity', 'is_active']
    search_fields = ['code_number', 'title']
    list_filter = ['code_type', 'severity', 'is_active']
```

## Statistics

- **Standard OBD-II codes:** ~1,000+ generic codes (P0xxx, P1xxx, P2xxx)
- **Manufacturer-specific:** Thousands more (P3xxx series varies by manufacturer)
- **Total possible codes:** 10,000+ unique codes
- **Commonly encountered:** ~200-300 codes cover 90% of cases
- **Our current coverage:** 96 codes (~30-40% of common codes)

## Next Steps

1. ✅ **Done:** Migration for initial codes
2. ✅ **Done:** External API integration framework
3. 🔄 **Next:** Integrate CarScan API or similar
4. 🔄 **Future:** Admin panel for code management
5. 🔄 **Future:** Periodic sync job for code updates

