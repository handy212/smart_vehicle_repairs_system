"""
VIN Decoder Integration using NHTSA API
Decodes Vehicle Identification Numbers to retrieve vehicle specifications
"""
import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)


class VehicleVINDecoder:
    """
    Wrapper for NHTSA VIN Decoder with enhanced error handling and data mapping
    """
    
    def decode_vin(self, vin: str, timeout_seconds: float = 5.0):
        """
        Decode VIN and return structured vehicle data
        
        Args:
            vin (str): 17-character VIN
            
        Returns:
            tuple: (success, data_dict or error_message)
            
        Example:
            success, data = decoder.decode_vin('1HGBH41JXMN109186')
            if success:
                print(data['make'], data['model'], data['year'])
        """
        if not vin or len(vin) != 17:
            return False, "VIN must be exactly 17 characters"
        
        # Validate VIN format (exclude I, O, Q)
        invalid_chars = set('IOQ')
        if any(char in invalid_chars for char in vin.upper()):
            return False, "VIN cannot contain letters I, O, or Q"
        
        try:
            # Decode VIN using NHTSA VPIC API (with an explicit timeout).
            # NOTE: Some environments have restricted outbound HTTPS; without a timeout
            # this can hang until the client aborts.
            result = self._fetch_nhtsa_vpic(vin, timeout_seconds=timeout_seconds)
            vehicle_data = self._extract_vehicle_data_from_dict(result)
            return True, vehicle_data
            
        except requests.Timeout:
            logger.warning("VIN decode timed out for %s (timeout=%ss)", vin, timeout_seconds)
            return False, f"NHTSA VIN decode timed out after {timeout_seconds}s. VPIC may be slow or blocked from this server."
        except requests.HTTPError as e:
            resp = getattr(e, "response", None)
            if resp is not None and resp.status_code == 503:
                return False, "NHTSA VPIC returned 503 Service Unavailable. Try again later."
            return False, f"NHTSA VIN decode failed (HTTP error). {str(e)}"
        except requests.RequestException as e:
            logger.error("VIN decode request error for %s: %s", vin, str(e))
            return False, f"NHTSA VIN decode failed (network error). {str(e)}"
        except Exception as e:
            logger.error(f"VIN decode error for {vin}: {str(e)}")
            return False, f"Decode failed: {str(e)}"

    def _fetch_nhtsa_vpic(self, vin: str, timeout_seconds: float) -> dict[str, Any]:
        """
        Fetch VIN decode results from NHTSA VPIC.
        """
        headers = {
            # VPIC sometimes behaves better with an explicit UA.
            "User-Agent": "SmartVehicleRepairs/1.0 (+https://workshop.aapgh.com)",
            "Accept": "application/json",
        }

        def fetch(url: str) -> dict[str, Any]:
            resp = requests.get(url, timeout=timeout_seconds, headers=headers)
            # If VPIC is down/unavailable, it may return 503.
            if resp.status_code == 503:
                raise requests.HTTPError("VPIC returned 503 Service Unavailable", response=resp)
            resp.raise_for_status()
            payload = resp.json()
            results = payload.get("Results") or []
            if not results or not isinstance(results, list):
                raise ValueError("No Results returned from NHTSA VPIC")
            first = results[0]
            if not isinstance(first, dict):
                raise ValueError("Unexpected Results format from NHTSA VPIC")
            return first

        # Prefer the extended endpoint, but fall back to the simpler endpoint if needed.
        extended_url = f"https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/{vin}?format=json"
        basic_url = f"https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{vin}?format=json"
        try:
            return fetch(extended_url)
        except requests.HTTPError as e:
            # If VPIC is returning 503, retry once using the basic endpoint.
            resp = getattr(e, "response", None)
            if resp is not None and resp.status_code == 503:
                return fetch(basic_url)
            raise

    def _extract_vehicle_data_from_dict(self, d: dict[str, Any]) -> dict[str, Any]:
        """
        Map NHTSA VPIC response dict keys to our internal fields.
        """
        class DictWrapper:
            def __init__(self, data: dict[str, Any]):
                self._data = data

            def __getattr__(self, item: str) -> Any:
                # Preserve previous attribute style access used by _get_value
                return self._data.get(item, "")

        return self._extract_vehicle_data(DictWrapper(d))
    
    def _extract_vehicle_data(self, vin_obj):
        """
        Extract relevant vehicle data from NHTSA Vin object
        
        Args:
            vin_obj: Vin object from NHTSA decoder
            
        Returns:
            dict: Structured vehicle data
        """
        data = {}
        
        # Basic identification
        data['make'] = self._get_value(vin_obj, 'Make')
        data['model'] = self._get_value(vin_obj, 'Model')
        data['year'] = self._get_int_value(vin_obj, 'ModelYear')
        data['trim'] = self._get_value(vin_obj, 'Trim')
        
        # Vehicle type and body
        data['vehicle_type'] = self._get_value(vin_obj, 'VehicleType')
        data['body_class'] = self._get_value(vin_obj, 'BodyClass')
        data['doors'] = self._get_int_value(vin_obj, 'Doors')
        
        # Engine information
        # Raw fuel/electrification values (from NHTSA)
        data['fuel_type_primary'] = self._get_value(vin_obj, 'FuelTypePrimary')
        data['fuel_type_secondary'] = self._get_value(vin_obj, 'FuelTypeSecondary')
        data['electrification_level'] = self._get_value(vin_obj, 'ElectrificationLevel')

        data['engine_type'] = self._map_fuel_type(
            data.get('fuel_type_primary', '')
        )
        data['engine_size'] = self._format_engine_size(
            self._get_value(vin_obj, 'DisplacementL'),
            self._get_value(vin_obj, 'EngineCylinders')
        )
        data['engine_cylinders'] = self._get_int_value(vin_obj, 'EngineCylinders')
        data['engine_hp'] = self._get_int_value(vin_obj, 'EngineHP')
        data['engine_kw'] = self._get_int_value(vin_obj, 'EngineKW')
        data['engine_model'] = self._get_value(vin_obj, 'EngineModel')
        data['engine_manufacturer'] = self._get_value(vin_obj, 'EngineManufacturer')
        data['engine_displacement_l'] = self._get_value(vin_obj, 'DisplacementL')
        
        # Transmission
        data['transmission_style'] = self._get_value(vin_obj, 'TransmissionStyle')
        data['transmission_type'] = self._map_transmission_type(
            data.get('transmission_style', '')
        )
        data['transmission_speeds'] = self._get_value(vin_obj, 'TransmissionSpeeds')
        
        # Drive type
        data['drive_type'] = self._get_value(vin_obj, 'DriveType')
        
        # Manufacturer info
        data['manufacturer'] = self._get_value(vin_obj, 'Manufacturer')
        data['plant_country'] = self._get_value(vin_obj, 'PlantCountry')
        data['plant_city'] = self._get_value(vin_obj, 'PlantCity')
        
        # Specifications
        data['gvwr'] = self._get_value(vin_obj, 'GVWR')  # Gross Vehicle Weight Rating
        data['curb_weight'] = self._get_int_value(vin_obj, 'CurbWeightLB')
        
        # Safety features
        data['airbag_front'] = self._get_value(vin_obj, 'AirBagLocFront')
        data['airbag_knee'] = self._get_value(vin_obj, 'AirBagLocKnee')
        data['airbag_side'] = self._get_value(vin_obj, 'AirBagLocSide')
        data['airbag_curtain'] = self._get_value(vin_obj, 'AirBagLocCurtain')
        data['airbag_seat_cushion'] = self._get_value(vin_obj, 'AirBagLocSeatCushion')
        data['other_restraint_info'] = self._get_value(vin_obj, 'OtherRestraintSystemInfo')
        data['abs'] = self._get_value(vin_obj, 'ABS')
        data['esc'] = self._get_value(vin_obj, 'ESC')  # Electronic Stability Control
        data['tpms'] = self._get_value(vin_obj, 'TPMS')  # Tire Pressure Monitoring
        
        # Dimensions
        data['wheelbase'] = self._get_value(vin_obj, 'WheelBaseType')
        data['track_width'] = self._get_value(vin_obj, 'TrackWidth')
        
        # Series info
        data['series'] = self._get_value(vin_obj, 'Series')
        
        # Additional info
        data['error_codes'] = self._get_value(vin_obj, 'ErrorCode')
        data['error_text'] = self._get_value(vin_obj, 'ErrorText')
        
        # Check for errors
        if data['error_codes'] and data['error_codes'] not in ['0', '']:
            data['has_errors'] = True
            data['error_message'] = data['error_text']
        else:
            data['has_errors'] = False
        
        return data
    
    def _get_value(self, vin_obj, attr):
        """Get value from Vin object attribute, return empty string if not found or null"""
        try:
            value = getattr(vin_obj, attr, '')
            # Handle None or 'Not Applicable' values
            if value is None or value == 'Not Applicable' or value == 'N/A':
                return ''
            return str(value).strip()
        except:
            return ''
    
    def _get_int_value(self, vin_obj, attr):
        """Get integer value from Vin object attribute"""
        value = self._get_value(vin_obj, attr)
        if not value:
            return None
        try:
            return int(float(value))
        except:
            return None
    
    def _format_engine_size(self, displacement, cylinders):
        """Format engine size string (e.g., '2.0L I4', '3.5L V6')"""
        if not displacement:
            return ''
        
        engine_str = f"{displacement}L"
        
        if cylinders:
            try:
                cyl_int = int(cylinders)
                # Determine engine configuration
                if cyl_int <= 4:
                    engine_str += f" I{cyl_int}"
                elif cyl_int in [6, 8, 10, 12]:
                    engine_str += f" V{cyl_int}"
                else:
                    engine_str += f" {cyl_int}-cyl"
            except:
                pass
        
        return engine_str
    
    def _map_fuel_type(self, fuel_type):
        """Map NHTSA fuel type to our engine type choices"""
        if not fuel_type:
            return 'gasoline'
        
        fuel_type_lower = fuel_type.lower()
        
        mapping = {
            'gasoline': 'gasoline',
            'gas': 'gasoline',
            'petrol': 'gasoline',
            'diesel': 'diesel',
            'electric': 'electric',
            'battery electric vehicle': 'electric',
            'bev': 'electric',
            'hybrid': 'hybrid',
            'plug-in hybrid': 'plug_in_hybrid',
            'phev': 'plug_in_hybrid',
            'plug-in hybrid electric vehicle': 'plug_in_hybrid',
        }
        
        for key, value in mapping.items():
            if key in fuel_type_lower:
                return value
        
        return 'gasoline'  # Default
    
    def _map_transmission_type(self, transmission_style):
        """Map NHTSA transmission style to our transmission type choices"""
        if not transmission_style:
            return 'automatic'
        
        trans_lower = transmission_style.lower()
        
        if 'manual' in trans_lower or 'mt' in trans_lower:
            return 'manual'
        elif 'cvt' in trans_lower or 'continuously variable' in trans_lower:
            return 'cvt'
        elif 'dct' in trans_lower or 'dual clutch' in trans_lower or 'dual-clutch' in trans_lower:
            return 'dual_clutch'
        elif 'automatic' in trans_lower or 'at' in trans_lower:
            return 'automatic'
        
        return 'automatic'  # Default
    
    def get_vehicle_summary(self, vin):
        """
        Get a human-readable summary of the vehicle
        
        Args:
            vin (str): Vehicle VIN
            
        Returns:
            str: Formatted vehicle description
        """
        success, data = self.decode_vin(vin)
        
        if not success:
            return f"Error: {data}"
        
        # Build summary regardless of errors (warnings are OK)
        parts = []
        
        if data.get('year'):
            parts.append(str(data['year']))
        if data.get('make'):
            parts.append(data['make'])
        if data.get('model'):
            parts.append(data['model'])
        if data.get('trim'):
            parts.append(data['trim'])
        
        summary = ' '.join(parts)
        
        # Add engine info
        if data.get('engine_size'):
            summary += f" - {data['engine_size']}"
        
        # Add transmission
        if data.get('transmission_type'):
            trans_display = data['transmission_type'].replace('_', ' ').title()
            summary += f" {trans_display}"
        
        # If we have a summary, return it (errors/warnings don't prevent this)
        if summary:
            return summary
        
        # Only if we have no data at all, return the error message
        if data.get('has_errors'):
            return f"Limited data available: {data.get('error_message', 'Unknown error')}"
        
        return "Vehicle information not available"


def decode_vin(vin):
    """
    Convenience function to decode VIN
    
    Args:
        vin (str): 17-character VIN
        
    Returns:
        tuple: (success, data_dict or error_message)
    """
    decoder = VehicleVINDecoder()
    return decoder.decode_vin(vin)


def get_vehicle_specs(vin):
    """
    Get vehicle specifications from VIN
    Returns only the essential data for Vehicle model
    
    Args:
        vin (str): 17-character VIN
        
    Returns:
        dict: Vehicle specifications for database
    """
    success, data = decode_vin(vin)
    
    if not success:
        return None
    
    if data.get('has_errors'):
        return None
    
    # Return only fields that match our Vehicle model
    specs = {
        'year': data.get('year'),
        'make': data.get('make'),
        'model': data.get('model'),
        'trim': data.get('trim'),
        'engine_type': data.get('engine_type'),
        'engine_size': data.get('engine_size'),
        'transmission_type': data.get('transmission_type'),
    }
    
    # Remove None values
    specs = {k: v for k, v in specs.items() if v is not None}
    
    return specs
