from celery import shared_task
import logging
from .models import Vehicle

logger = logging.getLogger(__name__)

@shared_task
def calculate_fleet_health_scores():
    """
    Periodically updates the health score and risk flags for all active vehicles
    in the fleet based on their recent repair frequency.
    """
    logger.info("Starting fleet health score calculation")
    
    # We only care about active vehicles
    active_vehicles = Vehicle.objects.filter(status='active')
    
    updated_count = 0
    high_risk_count = 0
    
    for vehicle in active_vehicles:
        try:
            # Capture old state to check if it actually changed
            old_score = vehicle.health_score
            old_risk = vehicle.is_high_risk
            
            new_score, new_risk = vehicle.update_health_score(months_back=3, risk_threshold=3)
            
            if old_score != new_score or old_risk != new_risk:
                updated_count += 1
            if new_risk:
                high_risk_count += 1
                
        except Exception as e:
            logger.error(f"Failed to update health score for Vehicle {vehicle.id}: {str(e)}")
            
    result = (
        f"Fleet health calculation completed: {active_vehicles.count()} vehicles checked. "
        f"{updated_count} vehicles updated. {high_risk_count} vehicles currently flagged as high-risk."
    )
    logger.info(result)
    return result
