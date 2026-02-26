import pytest
from apps.core.services.ai_service import AIService

class TestOBDDecoding:
    def test_powertrain_code(self):
        result = AIService.decode_obd_code("P0301")
        assert result["severity"] == "critical"
        assert "Misfire" in result["description"]
        
    def test_chassis_code(self):
        result = AIService.decode_obd_code("C0040")
        assert result["severity"] == "critical"
        assert "Chassis" in result["description"]

    def test_body_code(self):
        result = AIService.decode_obd_code("B1001")
        assert result["severity"] == "info"
        assert "Body Control Module" in result["description"]
        
    def test_network_code(self):
        result = AIService.decode_obd_code("U0100")
        assert result["severity"] == "warning"
        assert "Network Communication" in result["description"]
        
    def test_unknown_code(self):
        result = AIService.decode_obd_code("Z9999")
        assert result["severity"] == "info"
        assert "Manufacturer Specific" in result["description"]
