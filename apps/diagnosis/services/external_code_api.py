"""
External API integration service for OBD-II diagnostic codes
Hybrid system: Local DB cache + External API fallback + Periodic sync
"""
import requests
import logging
from typing import Optional, Dict, Any, List
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


class ExternalCodeAPIService:
    """
    Service to fetch diagnostic codes from external APIs
    Supports multiple API providers with fallback mechanism
    """
    
    # API Configuration
    CARSCAN_API_KEY = getattr(settings, 'CARSCAN_API_KEY', None)
    CARSCAN_API_BASE = "https://api.carscan.com/v1"
    
    # Free/Open APIs (limited rate)
    OBD_CODES_API_BASE = "https://www.obd-codes.com/api/v1"
    
    # Cache settings
    CACHE_TIMEOUT = 60 * 60 * 24  # 24 hours
    
    @staticmethod
    def fetch_from_carscan_api(code_number: str, code_type: str = 'obd_ii') -> Optional[Dict[str, Any]]:
        """
        Fetch code from CarScan API (paid service)
        Requires CARSCAN_API_KEY in settings
        """
        if not ExternalCodeAPIService.CARSCAN_API_KEY:
            logger.debug("CarScan API key not configured")
            return None
        
        try:
            headers = {
                "Authorization": f"Bearer {ExternalCodeAPIService.CARSCAN_API_KEY}",
                "Content-Type": "application/json"
            }
            url = f"{ExternalCodeAPIService.CARSCAN_API_BASE}/codes/{code_number}"
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'code_number': code_number,
                    'code_type': code_type,
                    'title': data.get('title') or data.get('code_description') or f'Code {code_number}',
                    'description': data.get('description') or data.get('full_description') or '',
                    'severity': data.get('severity', 'warning'),
                    'common_causes': data.get('common_causes', []) or data.get('possible_causes', []),
                    'common_fixes': data.get('common_fixes', []) or data.get('solutions', []),
                    'tsb_references': data.get('tsb_references', []),
                    'source': 'carscan_api',
                    'external_data': data
                }
            elif response.status_code == 404:
                logger.debug(f"Code {code_number} not found in CarScan API")
            else:
                logger.warning(f"CarScan API error {response.status_code}: {response.text}")
                
        except requests.exceptions.Timeout:
            logger.warning(f"CarScan API timeout for code {code_number}")
        except Exception as e:
            logger.error(f"Failed to fetch from CarScan API: {e}", exc_info=True)
        
        return None
    
    @staticmethod
    def fetch_from_obd_codes_api(code_number: str, code_type: str = 'obd_ii') -> Optional[Dict[str, Any]]:
        """
        Fetch code from OBD-Codes.com API (if available)
        Note: This is a placeholder - actual API endpoints may vary
        """
        try:
            url = f"{ExternalCodeAPIService.OBD_CODES_API_BASE}/codes/{code_number}"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'code_number': code_number,
                    'code_type': code_type,
                    'title': data.get('title', f'Code {code_number}'),
                    'description': data.get('description', ''),
                    'severity': data.get('severity', 'warning'),
                    'common_causes': data.get('common_causes', []),
                    'common_fixes': data.get('common_fixes', []),
                    'source': 'obd_codes_api'
                }
        except Exception as e:
            logger.debug(f"OBD Codes API not available: {e}")
        
        return None
    
    @staticmethod
    def lookup_external(code_number: str, code_type: str = 'obd_ii', use_cache: bool = True) -> Optional[Dict[str, Any]]:
        """
        Try to fetch code from external APIs with caching
        Returns code data if found, None otherwise
        
        Priority order:
        1. CarScan API (if configured)
        2. OBD Codes API
        3. Other free APIs
        
        Uses cache to reduce API calls
        """
        # Check cache first
        cache_key = f"code_lookup:{code_number}:{code_type}"
        if use_cache:
            cached_result = cache.get(cache_key)
            if cached_result:
                logger.debug(f"Code {code_number} found in cache")
                return cached_result
        
        # Try CarScan API first (paid, most comprehensive)
        result = ExternalCodeAPIService.fetch_from_carscan_api(code_number, code_type)
        if result:
            # Cache the result
            if use_cache:
                cache.set(cache_key, result, ExternalCodeAPIService.CACHE_TIMEOUT)
            return result
        
        # Try OBD Codes API as fallback
        result = ExternalCodeAPIService.fetch_from_obd_codes_api(code_number, code_type)
        if result:
            if use_cache:
                cache.set(cache_key, result, ExternalCodeAPIService.CACHE_TIMEOUT)
            return result
        
        # Cache negative result to avoid repeated lookups
        if use_cache:
            cache.set(cache_key, None, 60 * 60)  # Cache for 1 hour
        
        return None
    
    @staticmethod
    def fetch_popular_codes(limit: int = 100, code_type: str = 'obd_ii') -> List[Dict[str, Any]]:
        """
        Fetch popular/common diagnostic codes from external API
        Used for periodic sync to populate local database
        """
        popular_codes = []
        
        # List of most common OBD-II codes to sync
        common_codes = [
            # Misfire codes
            'P0300', 'P0301', 'P0302', 'P0303', 'P0304', 'P0305', 'P0306',
            # Air/Fuel mixture
            'P0171', 'P0172', 'P0174', 'P0175',
            # O2 Sensors
            'P0131', 'P0132', 'P0133', 'P0135', 'P0136', 'P0137', 'P0138',
            # Catalyst
            'P0420', 'P0430',
            # EGR
            'P0401', 'P0402',
            # EVAP
            'P0440', 'P0441', 'P0442', 'P0443', 'P0445',
            # MAF/MAP
            'P0100', 'P0101', 'P0102', 'P0106', 'P0107',
            # TPS
            'P0121', 'P0122', 'P0123',
            # Coolant temp
            'P0116', 'P0117', 'P0118', 'P0125', 'P0128',
            # Transmission
            'P0700', 'P0701', 'P0702', 'P0705',
            # Add more as needed
        ]
        
        codes_to_fetch = common_codes[:limit]
        
        for code_number in codes_to_fetch:
            result = ExternalCodeAPIService.lookup_external(code_number, code_type, use_cache=True)
            if result:
                popular_codes.append(result)
        
        return popular_codes


class CodeSyncService:
    """
    Service for syncing codes from external APIs to local database
    Handles bulk operations and periodic syncs
    """
    
    @staticmethod
    def save_external_code_to_local(external_data: Dict[str, Any], auto_create: bool = True) -> Optional[Any]:
        """
        Save external API code data to local database
        Returns the DiagnosticCodeLibrary instance if created/updated
        """
        from apps.diagnosis.models import DiagnosticCodeLibrary
        
        try:
            code, created = DiagnosticCodeLibrary.objects.update_or_create(
                code_number=external_data['code_number'],
                code_type=external_data.get('code_type', 'obd_ii'),
                defaults={
                    'title': external_data.get('title', ''),
                    'description': external_data.get('description', ''),
                    'severity': external_data.get('severity', 'warning'),
                    'common_causes': external_data.get('common_causes', []),
                    'common_fixes': external_data.get('common_fixes', []),
                    'tsb_references': external_data.get('tsb_references', []),
                    'is_active': True,
                }
            )
            
            if created:
                logger.info(f"Created new code {code.code_number} from external API")
            else:
                logger.debug(f"Updated code {code.code_number} from external API")
            
            return code
            
        except Exception as e:
            logger.error(f"Failed to save external code to local DB: {e}", exc_info=True)
            return None
    
    @staticmethod
    def sync_popular_codes(limit: int = 100) -> Dict[str, int]:
        """
        Sync popular codes from external API to local database
        Returns statistics about the sync operation
        """
        stats = {
            'fetched': 0,
            'created': 0,
            'updated': 0,
            'failed': 0
        }
        
        popular_codes = ExternalCodeAPIService.fetch_popular_codes(limit=limit)
        stats['fetched'] = len(popular_codes)
        
        for code_data in popular_codes:
            result = CodeSyncService.save_external_code_to_local(code_data)
            if result:
                # Check if it was created or updated
                from apps.diagnosis.models import DiagnosticCodeLibrary
                existing = DiagnosticCodeLibrary.objects.filter(
                    code_number=code_data['code_number'],
                    code_type=code_data.get('code_type', 'obd_ii')
                ).first()
                
                if existing and existing.created_at == existing.updated_at:
                    stats['created'] += 1
                else:
                    stats['updated'] += 1
            else:
                stats['failed'] += 1
        
        return stats
