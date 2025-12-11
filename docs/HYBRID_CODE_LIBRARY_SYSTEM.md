# Hybrid Diagnostic Code Library System

## Overview

A hybrid system that combines **local database caching** with **external API fallback** and **periodic synchronization** for comprehensive diagnostic code coverage.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Request                         │
│              (Code Lookup API Call)                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│          Step 1: Check Local Database                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  DiagnosticCodeLibrary.objects.get(code_number)  │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼ Found                       ▼ Not Found
┌──────────────────┐      ┌──────────────────────────────┐
│ Return from DB   │      │  Step 2: External API        │
│ (Fast!)          │      │  ┌────────────────────────┐  │
│                  │      │  │ CarScan API            │  │
│ ✅ Increment     │      │  │ OBD Codes API          │  │
│    use_count     │      │  │ (with caching)         │  │
│                  │      │  └────────────────────────┘  │
└──────────────────┘      └──────────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  Step 3: Auto-Save   │
                              │  to Local DB         │
                              │  (for future cache)  │
                              └──────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  Return Result       │
                              └──────────────────────┘

┌─────────────────────────────────────────────────────────┐
│          Step 4: Periodic Sync (Daily at 3 AM)         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Celery Task: sync_popular_diagnostic_codes     │   │
│  │  • Fetches 100 most common codes                │   │
│  │  • Updates local database                       │   │
│  │  • Keeps cache fresh                            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. **Local Database Cache** (`DiagnosticCodeLibrary`)
- Fast lookups (milliseconds)
- Stores popular/frequently used codes
- Tracks usage statistics
- No API costs for cached codes

### 2. **External API Integration** (`ExternalCodeAPIService`)
- CarScan API (paid, comprehensive)
- OBD Codes API (free, limited)
- Automatic fallback mechanism
- Redis caching to reduce API calls

### 3. **Auto-Save on Lookup** (`CodeSyncService`)
- Automatically saves external codes to local DB
- Builds cache over time based on actual usage
- No manual intervention needed

### 4. **Periodic Sync** (`sync_popular_diagnostic_codes` Celery Task)
- Runs daily at 3 AM
- Syncs 100 most common codes
- Keeps local database updated
- Configurable via management command

## Usage

### API Lookup (Automatic Hybrid Mode)

```bash
# Local lookup (fast, free)
GET /api/diagnosis/code-library/lookup/?code_number=P0305&code_type=obd_ii

# With external fallback (if not found locally)
GET /api/diagnosis/code-library/lookup/?code_number=P3005&code_type=obd_ii&use_external=true
```

**Behavior:**
1. Checks local database first
2. If found → returns immediately (fast!)
3. If not found AND `use_external=true`:
   - Fetches from external API
   - Auto-saves to local DB
   - Returns result
   - Future lookups will be fast (from local DB)

### Manual Sync Commands

```bash
# Sync popular codes (100 most common)
python manage.py sync_code_library

# Sync specific code
python manage.py sync_code_library --code P3005

# Show statistics
python manage.py sync_code_library --stats

# Sync more codes
python manage.py sync_code_library --limit 200
```

### Periodic Sync (Automatic)

The system automatically syncs popular codes daily at 3 AM via Celery Beat.

**To enable:**
1. Ensure Celery Beat is running:
   ```bash
   celery -A config beat -l info
   ```

2. Check if task is scheduled:
   ```bash
   python manage.py shell
   >>> from django_celery_beat.models import PeriodicTask
   >>> PeriodicTask.objects.filter(name__icontains='diagnostic')
   ```

## Configuration

### Environment Variables

Add to `.env` for external API integration:

```bash
# CarScan API (FREE tier: 25 requests/month, no credit card required)
# Register at: https://dev.carscan.com/api
CARSCAN_API_KEY=your_free_api_key_here

# Redis (for caching)
REDIS_URL=redis://localhost:6379/0
```

> **💡 Note**: CarScan API offers a **FREE tier with 25 requests/month** (no credit card required). Perfect for development and low-volume production. See [API_PRICING_AND_FREE_OPTIONS.md](./API_PRICING_AND_FREE_OPTIONS.md) for details.

### Settings

```python
# config/settings/base.py
CARSCAN_API_KEY = env('CARSCAN_API_KEY', default=None)

# Celery Beat schedule (already configured in config/celery.py)
'sync-popular-diagnostic-codes': {
    'task': 'sync_popular_diagnostic_codes',
    'schedule': crontab(hour=3, minute=0),  # Daily at 3 AM
}
```

## Benefits

### ✅ Performance
- **Fast local lookups** - milliseconds vs seconds
- **Reduced API calls** - cached popular codes
- **Redis caching** - prevents duplicate API requests

### ✅ Cost Efficiency
- **Minimize API costs** - only fetch what's needed
- **Auto-caching** - popular codes become free after first fetch
- **Smart sync** - only syncs common codes

### ✅ Reliability
- **Works offline** - cached codes available even if API is down
- **Fallback mechanism** - multiple API providers
- **Progressive enhancement** - cache builds over time

### ✅ Maintainability
- **Automatic updates** - periodic sync keeps data fresh
- **Usage tracking** - know which codes are popular
- **Easy expansion** - add more codes via management command

## Statistics

### Current State
- **Local codes**: 96 codes (from migration)
- **Coverage**: ~30-40% of commonly encountered codes
- **Growth**: Automatically expands based on usage

### Expected After Hybrid System
- **After 1 month**: 200-300 codes (most common)
- **After 6 months**: 500-800 codes (popular codes cached)
- **API calls**: Reduced by 80-90% (most lookups from cache)

## Monitoring

### View Statistics

```bash
python manage.py sync_code_library --stats
```

Output:
```
📊 Code Library Statistics
==================================================
Total codes: 96
By type:
  obd_ii: 96

Most used codes:
  P0300: 45 lookups
  P0420: 32 lookups
  P0171: 28 lookups
  ...
```

### Check Sync Status

```python
# Via Django shell
from apps.diagnosis.models import DiagnosticCodeLibrary
from django.utils import timezone
from datetime import timedelta

# Codes synced in last 24 hours
recent = DiagnosticCodeLibrary.objects.filter(
    updated_at__gte=timezone.now() - timedelta(days=1)
)
print(f"Codes synced in last 24h: {recent.count()}")
```

## Troubleshooting

### Codes Not Syncing

1. **Check Celery Beat is running:**
   ```bash
   celery -A config beat -l info
   ```

2. **Check task execution:**
   ```bash
   python manage.py shell
   >>> from apps.diagnosis.tasks import sync_popular_diagnostic_codes
   >>> result = sync_popular_diagnostic_codes()
   >>> print(result)
   ```

3. **Verify API keys:**
   ```bash
   python manage.py shell
   >>> from django.conf import settings
   >>> print(settings.CARSCAN_API_KEY)  # Should not be None
   ```

### External API Not Working

1. **Check cache:**
   ```bash
   python manage.py shell
   >>> from django.core.cache import cache
   >>> print(cache.get('code_lookup:P0305:obd_ii'))
   ```

2. **Test API directly:**
   ```python
   from apps.diagnosis.services.external_code_api import ExternalCodeAPIService
   result = ExternalCodeAPIService.lookup_external('P0305', 'obd_ii', use_cache=False)
   print(result)
   ```

## Future Enhancements

- [ ] Add more API providers (OBD Fusion, AllData)
- [ ] Machine learning to predict which codes to pre-cache
- [ ] Usage analytics dashboard
- [ ] API rate limit management
- [ ] Batch sync for multiple codes
- [ ] Webhook notifications for new codes

## Summary

The Hybrid System provides:
- ✅ **Fast local lookups** for cached codes
- ✅ **External API fallback** for unknown codes
- ✅ **Automatic caching** of popular codes
- ✅ **Periodic sync** to keep data fresh
- ✅ **Cost-efficient** API usage
- ✅ **Reliable** offline functionality

**Best of both worlds: Speed + Coverage!** 🚀

