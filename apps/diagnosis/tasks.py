"""
Celery tasks for diagnosis app
Periodic sync of diagnostic codes from external APIs
"""
from celery import shared_task
from django.utils import timezone
import logging
from apps.diagnosis.services.external_code_api import CodeSyncService, ExternalCodeAPIService

logger = logging.getLogger(__name__)


@shared_task(name='sync_popular_diagnostic_codes')
def sync_popular_diagnostic_codes(limit: int = 100):
    """
    Periodic task to sync popular diagnostic codes from external APIs
    This keeps the local database updated with commonly used codes
    
    Run frequency: Daily (configured in celery.py)
    """
    logger.info(f"Starting periodic sync of popular diagnostic codes (limit: {limit})")
    
    try:
        stats = CodeSyncService.sync_popular_codes(limit=limit)
        
        logger.info(
            f"Code sync completed: "
            f"Fetched: {stats['fetched']}, "
            f"Created: {stats['created']}, "
            f"Updated: {stats['updated']}, "
            f"Failed: {stats['failed']}"
        )
        
        return {
            'success': True,
            'stats': stats,
            'timestamp': timezone.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to sync diagnostic codes: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e),
            'timestamp': timezone.now().isoformat()
        }


@shared_task(name='sync_specific_code_from_external')
def sync_specific_code_from_external(code_number: str, code_type: str = 'obd_ii'):
    """
    Task to sync a specific code from external API
    Useful for on-demand syncing when a code is not found locally
    """
    logger.info(f"Syncing code {code_number} ({code_type}) from external API")
    
    try:
        external_result = ExternalCodeAPIService.lookup_external(
            code_number, 
            code_type, 
            use_cache=False  # Don't use cache for sync tasks
        )
        
        if external_result:
            saved_code = CodeSyncService.save_external_code_to_local(external_result, auto_create=True)
            
            if saved_code:
                logger.info(f"Successfully synced code {code_number} to local database")
                return {
                    'success': True,
                    'code_number': code_number,
                    'created': True if saved_code.created_at == saved_code.updated_at else False
                }
        
        logger.warning(f"Code {code_number} not found in external APIs")
        return {
            'success': False,
            'code_number': code_number,
            'message': 'Code not found in external APIs'
        }
        
    except Exception as e:
        logger.error(f"Failed to sync code {code_number}: {e}", exc_info=True)
        return {
            'success': False,
            'code_number': code_number,
            'error': str(e)
        }

