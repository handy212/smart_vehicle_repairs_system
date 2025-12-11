"""
Management command to populate Diagnostic Code Library with comprehensive OBD-II codes
Based on standard SAE OBD-II diagnostic trouble codes
"""
from django.core.management.base import BaseCommand
from apps.diagnosis.models import DiagnosticCodeLibrary


class Command(BaseCommand):
    help = 'Populate diagnostic code library with comprehensive OBD-II codes'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Populating Diagnostic Code Library...'))
        
        # Comprehensive list of common OBD-II codes
        codes = [
            # P0xxx - Generic Powertrain Codes
            {'code_number': 'P0100', 'code_type': 'obd_ii', 'title': 'Mass or Volume Air Flow Circuit Malfunction',
             'description': 'The mass air flow (MAF) sensor circuit has malfunctioned. The MAF sensor measures the amount of air entering the engine.',
             'severity': 'warning', 'common_causes': ['Faulty MAF sensor', 'Wiring issue', 'Intake leak'],
             'common_fixes': ['Check MAF sensor connections', 'Test MAF sensor', 'Inspect for intake leaks']},
            
            {'code_number': 'P0101', 'code_type': 'obd_ii', 'title': 'Mass or Volume Air Flow Circuit Range/Performance Problem',
             'description': 'The MAF sensor signal is outside the expected range but the circuit is functioning.',
             'severity': 'warning', 'common_causes': ['Dirty MAF sensor', 'Intake leak', 'Faulty MAF sensor'],
             'common_fixes': ['Clean MAF sensor', 'Check for intake leaks', 'Replace MAF sensor if needed']},
            
            {'code_number': 'P0102', 'code_type': 'obd_ii', 'title': 'Mass or Volume Air Flow Circuit Low Input',
             'description': 'The MAF sensor is reporting a lower air flow reading than expected.',
             'severity': 'warning', 'common_causes': ['Dirty MAF sensor', 'Wiring issue', 'Intake restriction'],
             'common_fixes': ['Clean MAF sensor', 'Check wiring', 'Inspect air filter']},
            
            {'code_number': 'P0103', 'code_type': 'obd_ii', 'title': 'Mass or Volume Air Flow Circuit High Input',
             'description': 'The MAF sensor is reporting a higher air flow reading than expected.',
             'severity': 'warning', 'common_causes': ['Faulty MAF sensor', 'Intake leak', 'Wiring issue'],
             'common_fixes': ['Test MAF sensor', 'Check for intake leaks', 'Inspect wiring']},
            
            {'code_number': 'P0106', 'code_type': 'obd_ii', 'title': 'Manifold Absolute Pressure/Barometric Pressure Circuit Range/Performance Problem',
             'description': 'The MAP sensor signal is outside the expected range.',
             'severity': 'warning', 'common_causes': ['Faulty MAP sensor', 'Vacuum leak', 'Wiring issue'],
             'common_fixes': ['Test MAP sensor', 'Check for vacuum leaks', 'Inspect wiring']},
            
            {'code_number': 'P0107', 'code_type': 'obd_ii', 'title': 'Manifold Absolute Pressure/Barometric Pressure Circuit Low Input',
             'description': 'The MAP sensor is reporting low pressure readings.',
             'severity': 'warning', 'common_causes': ['Faulty MAP sensor', 'Vacuum leak', 'Wiring short'],
             'common_fixes': ['Replace MAP sensor', 'Check for vacuum leaks', 'Test wiring']},
            
            {'code_number': 'P0108', 'code_type': 'obd_ii', 'title': 'Manifold Absolute Pressure/Barometric Pressure Circuit High Input',
             'description': 'The MAP sensor is reporting high pressure readings.',
             'severity': 'warning', 'common_causes': ['Faulty MAP sensor', 'Wiring issue', 'Sensor failure'],
             'common_fixes': ['Test MAP sensor', 'Check wiring connections', 'Replace if faulty']},
            
            {'code_number': 'P0112', 'code_type': 'obd_ii', 'title': 'Intake Air Temperature Circuit Low Input',
             'description': 'The intake air temperature (IAT) sensor is reporting abnormally low temperature readings.',
             'severity': 'warning', 'common_causes': ['Faulty IAT sensor', 'Wiring short', 'Sensor failure'],
             'common_fixes': ['Test IAT sensor', 'Check wiring', 'Replace sensor if needed']},
            
            {'code_number': 'P0113', 'code_type': 'obd_ii', 'title': 'Intake Air Temperature Circuit High Input',
             'description': 'The IAT sensor is reporting abnormally high temperature readings.',
             'severity': 'warning', 'common_causes': ['Faulty IAT sensor', 'Wiring issue', 'Sensor failure'],
             'common_fixes': ['Test IAT sensor', 'Check wiring connections', 'Replace if faulty']},
            
            {'code_number': 'P0116', 'code_type': 'obd_ii', 'title': 'Engine Coolant Temperature Circuit Range/Performance Problem',
             'description': 'The engine coolant temperature (ECT) sensor signal is outside the expected range.',
             'severity': 'warning', 'common_causes': ['Faulty ECT sensor', 'Cooling system issue', 'Wiring problem'],
             'common_fixes': ['Test ECT sensor', 'Check coolant level', 'Inspect wiring']},
            
            {'code_number': 'P0117', 'code_type': 'obd_ii', 'title': 'Engine Coolant Temperature Circuit Low Input',
             'description': 'The ECT sensor is reporting low temperature readings.',
             'severity': 'warning', 'common_causes': ['Faulty ECT sensor', 'Wiring short', 'Open circuit'],
             'common_fixes': ['Replace ECT sensor', 'Check wiring', 'Test sensor resistance']},
            
            {'code_number': 'P0118', 'code_type': 'obd_ii', 'title': 'Engine Coolant Temperature Circuit High Input',
             'description': 'The ECT sensor is reporting high temperature readings.',
             'severity': 'warning', 'common_causes': ['Faulty ECT sensor', 'Wiring short to ground', 'Sensor failure'],
             'common_fixes': ['Test ECT sensor', 'Check wiring', 'Replace sensor']},
            
            {'code_number': 'P0121', 'code_type': 'obd_ii', 'title': 'Throttle/Pedal Position Sensor/Switch A Circuit Range/Performance Problem',
             'description': 'The throttle position sensor (TPS) signal is outside the expected range.',
             'severity': 'warning', 'common_causes': ['Faulty TPS', 'Wiring issue', 'Throttle body problem'],
             'common_fixes': ['Test TPS', 'Check wiring', 'Clean throttle body']},
            
            {'code_number': 'P0122', 'code_type': 'obd_ii', 'title': 'Throttle/Pedal Position Sensor/Switch A Circuit Low Input',
             'description': 'The TPS is reporting low voltage readings.',
             'severity': 'warning', 'common_causes': ['Faulty TPS', 'Wiring short', 'Open circuit'],
             'common_fixes': ['Replace TPS', 'Check wiring', 'Test sensor voltage']},
            
            {'code_number': 'P0123', 'code_type': 'obd_ii', 'title': 'Throttle/Pedal Position Sensor/Switch A Circuit High Input',
             'description': 'The TPS is reporting high voltage readings.',
             'severity': 'warning', 'common_causes': ['Faulty TPS', 'Wiring short to power', 'Sensor failure'],
             'common_fixes': ['Test TPS', 'Check wiring', 'Replace sensor']},
            
            {'code_number': 'P0125', 'code_type': 'obd_ii', 'title': 'Insufficient Coolant Temperature for Closed Loop Fuel Control',
             'description': 'The engine is not reaching operating temperature, preventing closed-loop fuel control.',
             'severity': 'warning', 'common_causes': ['Stuck-open thermostat', 'Faulty ECT sensor', 'Cooling system issue'],
             'common_fixes': ['Replace thermostat', 'Test ECT sensor', 'Check cooling system']},
            
            {'code_number': 'P0128', 'code_type': 'obd_ii', 'title': 'Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)',
             'description': 'The engine is not reaching the proper operating temperature, indicating a stuck-open thermostat.',
             'severity': 'warning', 'common_causes': ['Stuck-open thermostat', 'Low coolant', 'Faulty ECT sensor'],
             'common_fixes': ['Replace thermostat', 'Check coolant level', 'Test ECT sensor']},
            
            {'code_number': 'P0131', 'code_type': 'obd_ii', 'title': 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 1)',
             'description': 'The upstream oxygen sensor (Bank 1, Sensor 1) is reporting low voltage, indicating a lean condition.',
             'severity': 'warning', 'common_causes': ['Faulty O2 sensor', 'Vacuum leak', 'Exhaust leak'],
             'common_fixes': ['Replace O2 sensor', 'Check for vacuum leaks', 'Inspect exhaust']},
            
            {'code_number': 'P0132', 'code_type': 'obd_ii', 'title': 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 1)',
             'description': 'The upstream O2 sensor is reporting high voltage, indicating a rich condition.',
             'severity': 'warning', 'common_causes': ['Faulty O2 sensor', 'Fuel pressure high', 'Faulty injector'],
             'common_fixes': ['Replace O2 sensor', 'Check fuel pressure', 'Test fuel injectors']},
            
            {'code_number': 'P0133', 'code_type': 'obd_ii', 'title': 'O2 Sensor Circuit Slow Response (Bank 1 Sensor 1)',
             'description': 'The upstream O2 sensor is responding too slowly to changes in air/fuel ratio.',
             'severity': 'warning', 'common_causes': ['Aging O2 sensor', 'Contaminated sensor', 'Exhaust leak'],
             'common_fixes': ['Replace O2 sensor', 'Check for exhaust leaks', 'Inspect sensor']},
            
            {'code_number': 'P0135', 'code_type': 'obd_ii', 'title': 'O2 Sensor Heater Circuit Malfunction (Bank 1 Sensor 1)',
             'description': 'The O2 sensor heater circuit has malfunctioned, preventing the sensor from reaching operating temperature quickly.',
             'severity': 'warning', 'common_causes': ['Faulty heater element', 'Wiring issue', 'Fuse problem'],
             'common_fixes': ['Replace O2 sensor', 'Check wiring', 'Test fuse']},
            
            {'code_number': 'P0136', 'code_type': 'obd_ii', 'title': 'O2 Sensor Circuit Malfunction (Bank 1 Sensor 2)',
             'description': 'The downstream O2 sensor (Bank 1, Sensor 2) has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty O2 sensor', 'Wiring issue', 'Catalyst problem'],
             'common_fixes': ['Replace O2 sensor', 'Check wiring', 'Test catalyst efficiency']},
            
            {'code_number': 'P0137', 'code_type': 'obd_ii', 'title': 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 2)',
             'description': 'The downstream O2 sensor is reporting low voltage readings.',
             'severity': 'warning', 'common_causes': ['Faulty O2 sensor', 'Exhaust leak', 'Catalyst issue'],
             'common_fixes': ['Replace O2 sensor', 'Check for exhaust leaks', 'Test catalyst']},
            
            {'code_number': 'P0138', 'code_type': 'obd_ii', 'title': 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 2)',
             'description': 'The downstream O2 sensor is reporting high voltage readings.',
             'severity': 'warning', 'common_causes': ['Faulty O2 sensor', 'Catalyst failure', 'Wiring short'],
             'common_fixes': ['Replace O2 sensor', 'Check catalyst', 'Inspect wiring']},
            
            {'code_number': 'P0140', 'code_type': 'obd_ii', 'title': 'O2 Sensor Circuit No Activity Detected (Bank 1 Sensor 2)',
             'description': 'The downstream O2 sensor is not responding or showing no activity.',
             'severity': 'warning', 'common_causes': ['Faulty O2 sensor', 'Disconnected wiring', 'Open circuit'],
             'common_fixes': ['Replace O2 sensor', 'Check wiring connections', 'Test sensor']},
            
            {'code_number': 'P0141', 'code_type': 'obd_ii', 'title': 'O2 Sensor Heater Circuit Malfunction (Bank 1 Sensor 2)',
             'description': 'The downstream O2 sensor heater circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty heater', 'Wiring issue', 'Fuse problem'],
             'common_fixes': ['Replace O2 sensor', 'Check wiring', 'Test fuse']},
            
            {'code_number': 'P0171', 'code_type': 'obd_ii', 'title': 'System Too Lean (Bank 1)',
             'description': 'The engine is running too lean (too much air, not enough fuel).',
             'severity': 'warning', 'common_causes': ['Vacuum leak', 'Faulty MAF sensor', 'Low fuel pressure', 'Faulty O2 sensor'],
             'common_fixes': ['Check for vacuum leaks', 'Test MAF sensor', 'Check fuel pressure', 'Replace O2 sensor']},
            
            {'code_number': 'P0172', 'code_type': 'obd_ii', 'title': 'System Too Rich (Bank 1)',
             'description': 'The engine is running too rich (too much fuel, not enough air).',
             'severity': 'warning', 'common_causes': ['Faulty MAF sensor', 'High fuel pressure', 'Faulty injector', 'Faulty O2 sensor'],
             'common_fixes': ['Test MAF sensor', 'Check fuel pressure', 'Test injectors', 'Replace O2 sensor']},
            
            {'code_number': 'P0174', 'code_type': 'obd_ii', 'title': 'System Too Lean (Bank 2)',
             'description': 'The engine is running too lean on bank 2.',
             'severity': 'warning', 'common_causes': ['Vacuum leak', 'Faulty MAF sensor', 'Low fuel pressure'],
             'common_fixes': ['Check for vacuum leaks', 'Test MAF sensor', 'Check fuel pressure']},
            
            {'code_number': 'P0175', 'code_type': 'obd_ii', 'title': 'System Too Rich (Bank 2)',
             'description': 'The engine is running too rich on bank 2.',
             'severity': 'warning', 'common_causes': ['Faulty MAF sensor', 'High fuel pressure', 'Faulty injector'],
             'common_fixes': ['Test MAF sensor', 'Check fuel pressure', 'Test injectors']},
            
            {'code_number': 'P0201', 'code_type': 'obd_ii', 'title': 'Injector Circuit Malfunction - Cylinder 1',
             'description': 'The fuel injector circuit for cylinder 1 has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty injector', 'Wiring issue', 'PCM problem'],
             'common_fixes': ['Test injector', 'Check wiring', 'Test injector driver circuit']},
            
            {'code_number': 'P0202', 'code_type': 'obd_ii', 'title': 'Injector Circuit Malfunction - Cylinder 2',
             'description': 'The fuel injector circuit for cylinder 2 has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty injector', 'Wiring issue', 'PCM problem'],
             'common_fixes': ['Test injector', 'Check wiring', 'Test injector driver circuit']},
            
            {'code_number': 'P0203', 'code_type': 'obd_ii', 'title': 'Injector Circuit Malfunction - Cylinder 3',
             'description': 'The fuel injector circuit for cylinder 3 has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty injector', 'Wiring issue', 'PCM problem'],
             'common_fixes': ['Test injector', 'Check wiring', 'Test injector driver circuit']},
            
            {'code_number': 'P0204', 'code_type': 'obd_ii', 'title': 'Injector Circuit Malfunction - Cylinder 4',
             'description': 'The fuel injector circuit for cylinder 4 has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty injector', 'Wiring issue', 'PCM problem'],
             'common_fixes': ['Test injector', 'Check wiring', 'Test injector driver circuit']},
            
            {'code_number': 'P0230', 'code_type': 'obd_ii', 'title': 'Fuel Pump Primary Circuit Malfunction',
             'description': 'The fuel pump primary circuit has malfunctioned.',
             'severity': 'critical', 'common_causes': ['Faulty fuel pump relay', 'Wiring issue', 'Fuse problem'],
             'common_fixes': ['Test fuel pump relay', 'Check wiring', 'Test fuse', 'Check fuel pump']},
            
            {'code_number': 'P0300', 'code_type': 'obd_ii', 'title': 'Random/Multiple Cylinder Misfire Detected',
             'description': 'The PCM has detected random or multiple cylinder misfires.',
             'severity': 'warning', 'common_causes': ['Faulty spark plugs', 'Bad ignition coils', 'Fuel delivery issues', 'Vacuum leaks'],
             'common_fixes': ['Replace spark plugs', 'Test ignition coils', 'Check fuel pressure', 'Inspect for vacuum leaks']},
            
            {'code_number': 'P0301', 'code_type': 'obd_ii', 'title': 'Cylinder 1 Misfire Detected',
             'description': 'The PCM has detected that cylinder 1 is misfiring.',
             'severity': 'warning', 'common_causes': ['Faulty spark plug', 'Bad ignition coil', 'Fuel injector issue', 'Compression problem'],
             'common_fixes': ['Replace spark plug', 'Test ignition coil', 'Check fuel injector', 'Perform compression test']},
            
            {'code_number': 'P0302', 'code_type': 'obd_ii', 'title': 'Cylinder 2 Misfire Detected',
             'description': 'The PCM has detected that cylinder 2 is misfiring.',
             'severity': 'warning', 'common_causes': ['Faulty spark plug', 'Bad ignition coil', 'Fuel injector issue'],
             'common_fixes': ['Replace spark plug', 'Test ignition coil', 'Check fuel injector']},
            
            {'code_number': 'P0303', 'code_type': 'obd_ii', 'title': 'Cylinder 3 Misfire Detected',
             'description': 'The PCM has detected that cylinder 3 is misfiring.',
             'severity': 'warning', 'common_causes': ['Faulty spark plug', 'Bad ignition coil', 'Fuel injector issue'],
             'common_fixes': ['Replace spark plug', 'Test ignition coil', 'Check fuel injector']},
            
            {'code_number': 'P0304', 'code_type': 'obd_ii', 'title': 'Cylinder 4 Misfire Detected',
             'description': 'The PCM has detected that cylinder 4 is misfiring.',
             'severity': 'warning', 'common_causes': ['Faulty spark plug', 'Bad ignition coil', 'Fuel injector issue'],
             'common_fixes': ['Replace spark plug', 'Test ignition coil', 'Check fuel injector']},
            
            {'code_number': 'P0305', 'code_type': 'obd_ii', 'title': 'Cylinder 5 Misfire Detected',
             'description': 'The PCM has detected that cylinder 5 is misfiring.',
             'severity': 'warning', 'common_causes': ['Faulty spark plug', 'Bad ignition coil', 'Fuel injector issue'],
             'common_fixes': ['Replace spark plug', 'Test ignition coil', 'Check fuel injector']},
            
            {'code_number': 'P0306', 'code_type': 'obd_ii', 'title': 'Cylinder 6 Misfire Detected',
             'description': 'The PCM has detected that cylinder 6 is misfiring.',
             'severity': 'warning', 'common_causes': ['Faulty spark plug', 'Bad ignition coil', 'Fuel injector issue'],
             'common_fixes': ['Replace spark plug', 'Test ignition coil', 'Check fuel injector']},
            
            {'code_number': 'P0325', 'code_type': 'obd_ii', 'title': 'Knock Sensor 1 Circuit Malfunction (Bank 1)',
             'description': 'The knock sensor circuit has malfunctioned, preventing the PCM from detecting engine knock.',
             'severity': 'warning', 'common_causes': ['Faulty knock sensor', 'Wiring issue', 'Sensor failure'],
             'common_fixes': ['Replace knock sensor', 'Check wiring', 'Test sensor']},
            
            {'code_number': 'P0335', 'code_type': 'obd_ii', 'title': 'Crankshaft Position Sensor A Circuit Malfunction',
             'description': 'The crankshaft position sensor circuit has malfunctioned. This sensor is critical for engine timing.',
             'severity': 'critical', 'common_causes': ['Faulty CKP sensor', 'Wiring issue', 'Sensor gap problem'],
             'common_fixes': ['Replace CKP sensor', 'Check wiring', 'Check sensor gap']},
            
            {'code_number': 'P0340', 'code_type': 'obd_ii', 'title': 'Camshaft Position Sensor Circuit Malfunction',
             'description': 'The camshaft position sensor circuit has malfunctioned.',
             'severity': 'critical', 'common_causes': ['Faulty CMP sensor', 'Wiring issue', 'Timing chain/belt problem'],
             'common_fixes': ['Replace CMP sensor', 'Check wiring', 'Inspect timing components']},
            
            {'code_number': 'P0341', 'code_type': 'obd_ii', 'title': 'Camshaft Position Sensor Circuit Range/Performance',
             'description': 'The CMP sensor signal is outside the expected range.',
             'severity': 'warning', 'common_causes': ['Faulty CMP sensor', 'Timing issue', 'Sensor alignment problem'],
             'common_fixes': ['Test CMP sensor', 'Check timing', 'Verify sensor alignment']},
            
            {'code_number': 'P0351', 'code_type': 'obd_ii', 'title': 'Ignition Coil A Primary/Secondary Circuit Malfunction',
             'description': 'The ignition coil A primary or secondary circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty ignition coil', 'Wiring issue', 'Coil failure'],
             'common_fixes': ['Replace ignition coil', 'Check wiring', 'Test coil resistance']},
            
            {'code_number': 'P0352', 'code_type': 'obd_ii', 'title': 'Ignition Coil B Primary/Secondary Circuit Malfunction',
             'description': 'The ignition coil B primary or secondary circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty ignition coil', 'Wiring issue', 'Coil failure'],
             'common_fixes': ['Replace ignition coil', 'Check wiring', 'Test coil resistance']},
            
            {'code_number': 'P0401', 'code_type': 'obd_ii', 'title': 'Exhaust Gas Recirculation Flow Insufficient Detected',
             'description': 'The EGR system is not flowing enough exhaust gas back into the intake.',
             'severity': 'warning', 'common_causes': ['Clogged EGR valve', 'Faulty EGR valve', 'Carbon buildup'],
             'common_fixes': ['Clean EGR valve', 'Replace EGR valve', 'Inspect EGR passages']},
            
            {'code_number': 'P0402', 'code_type': 'obd_ii', 'title': 'Exhaust Gas Recirculation Flow Excessive Detected',
             'description': 'The EGR system is flowing too much exhaust gas back into the intake.',
             'severity': 'warning', 'common_causes': ['Stuck-open EGR valve', 'Faulty EGR control', 'Valve failure'],
             'common_fixes': ['Replace EGR valve', 'Test EGR control solenoid', 'Check EGR operation']},
            
            {'code_number': 'P0420', 'code_type': 'obd_ii', 'title': 'Catalyst System Efficiency Below Threshold (Bank 1)',
             'description': 'The catalytic converter is not working efficiently enough to reduce emissions.',
             'severity': 'warning', 'common_causes': ['Failed catalytic converter', 'Oxygen sensor malfunction', 'Exhaust leak'],
             'common_fixes': ['Replace catalytic converter', 'Check O2 sensors', 'Inspect exhaust system']},
            
            {'code_number': 'P0421', 'code_type': 'obd_ii', 'title': 'Warm Up Catalyst Efficiency Below Threshold (Bank 1)',
             'description': 'The warm-up catalytic converter efficiency is below the threshold.',
             'severity': 'warning', 'common_causes': ['Faulty warm-up catalyst', 'O2 sensor issue', 'Exhaust leak'],
             'common_fixes': ['Replace warm-up catalyst', 'Check O2 sensors', 'Inspect exhaust']},
            
            {'code_number': 'P0430', 'code_type': 'obd_ii', 'title': 'Catalyst System Efficiency Below Threshold (Bank 2)',
             'description': 'The catalytic converter on bank 2 is not working efficiently enough.',
             'severity': 'warning', 'common_causes': ['Failed catalytic converter', 'Oxygen sensor malfunction'],
             'common_fixes': ['Replace catalytic converter', 'Check O2 sensors']},
            
            {'code_number': 'P0440', 'code_type': 'obd_ii', 'title': 'Evaporative Emission Control System Malfunction',
             'description': 'The EVAP system has a general malfunction.',
             'severity': 'info', 'common_causes': ['EVAP leak', 'Faulty purge valve', 'Loose gas cap'],
             'common_fixes': ['Check gas cap', 'Inspect EVAP system', 'Test purge valve']},
            
            {'code_number': 'P0441', 'code_type': 'obd_ii', 'title': 'Evaporative Emission Control System Incorrect Purge Flow',
             'description': 'The EVAP purge flow is incorrect.',
             'severity': 'warning', 'common_causes': ['Faulty purge valve', 'Blocked purge line', 'PCM issue'],
             'common_fixes': ['Replace purge valve', 'Inspect purge lines', 'Test PCM']},
            
            {'code_number': 'P0442', 'code_type': 'obd_ii', 'title': 'Evaporative Emission Control System Leak Detected (Small Leak)',
             'description': 'A small leak has been detected in the EVAP system.',
             'severity': 'info', 'common_causes': ['Loose gas cap', 'Leaking EVAP hose', 'Faulty purge valve'],
             'common_fixes': ['Tighten/replace gas cap', 'Inspect EVAP hoses', 'Test purge valve']},
            
            {'code_number': 'P0443', 'code_type': 'obd_ii', 'title': 'Evaporative Emission Control System Purge Control Valve Circuit Malfunction',
             'description': 'The EVAP purge control valve circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty purge valve', 'Wiring issue', 'PCM problem'],
             'common_fixes': ['Replace purge valve', 'Check wiring', 'Test PCM']},
            
            {'code_number': 'P0444', 'code_type': 'obd_ii', 'title': 'Evaporative Emission Control System Purge Control Valve Circuit Open',
             'description': 'The EVAP purge control valve circuit is open.',
             'severity': 'warning', 'common_causes': ['Open wiring', 'Faulty purge valve', 'Disconnected connector'],
             'common_fixes': ['Check wiring connections', 'Replace purge valve', 'Inspect connectors']},
            
            {'code_number': 'P0445', 'code_type': 'obd_ii', 'title': 'Evaporative Emission Control System Purge Control Valve Circuit Shorted',
             'description': 'The EVAP purge control valve circuit is shorted.',
             'severity': 'warning', 'common_causes': ['Shorted wiring', 'Faulty purge valve', 'PCM problem'],
             'common_fixes': ['Check wiring', 'Replace purge valve', 'Test PCM']},
            
            {'code_number': 'P0446', 'code_type': 'obd_ii', 'title': 'Evaporative Emission Control System Vent Control Circuit Malfunction',
             'description': 'The EVAP vent control circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty vent valve', 'Wiring issue', 'Blocked vent'],
             'common_fixes': ['Replace vent valve', 'Check wiring', 'Inspect vent system']},
            
            {'code_number': 'P0455', 'code_type': 'obd_ii', 'title': 'Evaporative Emission Control System Leak Detected (Gross Leak)',
             'description': 'A large leak has been detected in the EVAP system.',
             'severity': 'warning', 'common_causes': ['Loose gas cap', 'Large EVAP leak', 'Damaged EVAP components'],
             'common_fixes': ['Check gas cap', 'Inspect EVAP system for leaks', 'Test EVAP components']},
            
            {'code_number': 'P0505', 'code_type': 'obd_ii', 'title': 'Idle Air Control System Malfunction',
             'description': 'The idle air control (IAC) system has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty IAC valve', 'Carbon buildup', 'Wiring issue'],
             'common_fixes': ['Clean IAC valve', 'Replace IAC valve', 'Check wiring']},
            
            {'code_number': 'P0506', 'code_type': 'obd_ii', 'title': 'Idle Air Control System RPM Lower Than Expected',
             'description': 'The engine idle speed is lower than expected.',
             'severity': 'warning', 'common_causes': ['Faulty IAC valve', 'Vacuum leak', 'Throttle body issue'],
             'common_fixes': ['Test IAC valve', 'Check for vacuum leaks', 'Clean throttle body']},
            
            {'code_number': 'P0507', 'code_type': 'obd_ii', 'title': 'Idle Air Control System RPM Higher Than Expected',
             'description': 'The engine idle speed is higher than expected.',
             'severity': 'warning', 'common_causes': ['Faulty IAC valve', 'Vacuum leak', 'Throttle sticking'],
             'common_fixes': ['Test IAC valve', 'Check for vacuum leaks', 'Clean throttle body']},
            
            {'code_number': 'P0510', 'code_type': 'obd_ii', 'title': 'Closed Throttle Position Switch Malfunction',
             'description': 'The closed throttle position switch has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty TPS', 'Throttle body issue', 'Wiring problem'],
             'common_fixes': ['Test TPS', 'Check throttle body', 'Inspect wiring']},
            
            {'code_number': 'P0520', 'code_type': 'obd_ii', 'title': 'Engine Oil Pressure Sensor/Switch Circuit Malfunction',
             'description': 'The engine oil pressure sensor circuit has malfunctioned.',
             'severity': 'critical', 'common_causes': ['Faulty oil pressure sensor', 'Wiring issue', 'Low oil pressure'],
             'common_fixes': ['Test oil pressure sensor', 'Check wiring', 'Verify actual oil pressure']},
            
            {'code_number': 'P0601', 'code_type': 'obd_ii', 'title': 'Internal Control Module Memory Check Sum Error',
             'description': 'The PCM internal memory has a checksum error.',
             'severity': 'critical', 'common_causes': ['PCM failure', 'Corrupted memory', 'Software issue'],
             'common_fixes': ['Flash PCM software', 'Replace PCM', 'Check for updates']},
            
            {'code_number': 'P0602', 'code_type': 'obd_ii', 'title': 'Control Module Programming Error',
             'description': 'The PCM programming has an error.',
             'severity': 'critical', 'common_causes': ['PCM programming issue', 'Corrupted software'],
             'common_fixes': ['Re-flash PCM', 'Replace PCM', 'Check for software updates']},
            
            {'code_number': 'P0603', 'code_type': 'obd_ii', 'title': 'Internal Control Module Keep Alive Memory (KAM) Error',
             'description': 'The PCM KAM memory has an error.',
             'severity': 'warning', 'common_causes': ['PCM memory issue', 'Battery disconnect', 'Corrupted memory'],
             'common_fixes': ['Clear codes and test', 'Replace PCM if persistent', 'Check battery']},
            
            {'code_number': 'P0604', 'code_type': 'obd_ii', 'title': 'Internal Control Module Random Access Memory (RAM) Error',
             'description': 'The PCM RAM has an error.',
             'severity': 'critical', 'common_causes': ['PCM failure', 'Memory issue', 'Hardware problem'],
             'common_fixes': ['Replace PCM', 'Check for PCM updates', 'Test PCM']},
            
            {'code_number': 'P0605', 'code_type': 'obd_ii', 'title': 'Internal Control Module Read Only Memory (ROM) Error',
             'description': 'The PCM ROM has an error.',
             'severity': 'critical', 'common_causes': ['PCM failure', 'Corrupted firmware'],
             'common_fixes': ['Replace PCM', 'Attempt firmware update', 'Check for recalls']},
            
            {'code_number': 'P0700', 'code_type': 'obd_ii', 'title': 'Transmission Control System Malfunction',
             'description': 'The transmission control system has a general malfunction.',
             'severity': 'warning', 'common_causes': ['Transmission issue', 'TCM problem', 'Wiring issue'],
             'common_fixes': ['Check transmission codes', 'Test TCM', 'Inspect wiring']},
            
            {'code_number': 'P0701', 'code_type': 'obd_ii', 'title': 'Transmission Control System Range/Performance',
             'description': 'The transmission control system is performing outside normal range.',
             'severity': 'warning', 'common_causes': ['Transmission mechanical issue', 'TCM problem', 'Sensor issue'],
             'common_fixes': ['Check transmission', 'Test TCM', 'Inspect sensors']},
            
            {'code_number': 'P0702', 'code_type': 'obd_ii', 'title': 'Transmission Control System Electrical',
             'description': 'The transmission control system has an electrical malfunction.',
             'severity': 'warning', 'common_causes': ['Wiring issue', 'TCM problem', 'Sensor failure'],
             'common_fixes': ['Check wiring', 'Test TCM', 'Inspect electrical connections']},
            
            {'code_number': 'P0703', 'code_type': 'obd_ii', 'title': 'Torque Converter/Brake Switch B Circuit Malfunction',
             'description': 'The torque converter clutch brake switch circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty brake switch', 'Wiring issue', 'Switch failure'],
             'common_fixes': ['Test brake switch', 'Check wiring', 'Replace switch']},
            
            {'code_number': 'P0704', 'code_type': 'obd_ii', 'title': 'Clutch Switch Input Circuit Malfunction',
             'description': 'The clutch switch circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty clutch switch', 'Wiring issue', 'Switch failure'],
             'common_fixes': ['Test clutch switch', 'Check wiring', 'Replace switch']},
            
            {'code_number': 'P0705', 'code_type': 'obd_ii', 'title': 'Transmission Range Sensor Circuit Malfunction (PRNDL Input)',
             'description': 'The transmission range sensor (PRNDL switch) circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty range sensor', 'Wiring issue', 'Adjustment needed'],
             'common_fixes': ['Test range sensor', 'Check wiring', 'Adjust sensor']},
            
            {'code_number': 'P0706', 'code_type': 'obd_ii', 'title': 'Transmission Range Sensor Circuit Range/Performance',
             'description': 'The transmission range sensor signal is outside the expected range.',
             'severity': 'warning', 'common_causes': ['Faulty range sensor', 'Misadjustment', 'Wiring issue'],
             'common_fixes': ['Test range sensor', 'Adjust sensor', 'Check wiring']},
            
            {'code_number': 'P0715', 'code_type': 'obd_ii', 'title': 'Input/Turbine Speed Sensor Circuit Malfunction',
             'description': 'The transmission input/turbine speed sensor circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty speed sensor', 'Wiring issue', 'Sensor failure'],
             'common_fixes': ['Replace speed sensor', 'Check wiring', 'Test sensor']},
            
            {'code_number': 'P0720', 'code_type': 'obd_ii', 'title': 'Output Speed Sensor Circuit Malfunction',
             'description': 'The transmission output speed sensor circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty speed sensor', 'Wiring issue', 'Sensor failure'],
             'common_fixes': ['Replace speed sensor', 'Check wiring', 'Test sensor']},
            
            {'code_number': 'P0740', 'code_type': 'obd_ii', 'title': 'Torque Converter Clutch Circuit Malfunction',
             'description': 'The torque converter clutch circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty TCC solenoid', 'Transmission issue', 'Wiring problem'],
             'common_fixes': ['Test TCC solenoid', 'Check transmission', 'Inspect wiring']},
            
            {'code_number': 'P0741', 'code_type': 'obd_ii', 'title': 'Torque Converter Clutch Circuit Performance or Stuck Off',
             'description': 'The torque converter clutch is not engaging or is stuck off.',
             'severity': 'warning', 'common_causes': ['Faulty TCC solenoid', 'Transmission fluid issue', 'Transmission problem'],
             'common_fixes': ['Test TCC solenoid', 'Check transmission fluid', 'Inspect transmission']},
            
            {'code_number': 'P0742', 'code_type': 'obd_ii', 'title': 'Torque Converter Clutch Circuit Stuck On',
             'description': 'The torque converter clutch is stuck in the engaged position.',
             'severity': 'warning', 'common_causes': ['Faulty TCC solenoid', 'Transmission issue', 'Stuck valve'],
             'common_fixes': ['Replace TCC solenoid', 'Check transmission', 'Inspect valve body']},
            
            {'code_number': 'P0750', 'code_type': 'obd_ii', 'title': 'Shift Solenoid A Malfunction',
             'description': 'The shift solenoid A has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty shift solenoid', 'Wiring issue', 'Transmission problem'],
             'common_fixes': ['Replace shift solenoid', 'Check wiring', 'Test transmission']},
            
            {'code_number': 'P0751', 'code_type': 'obd_ii', 'title': 'Shift Solenoid A Performance or Stuck Off',
             'description': 'Shift solenoid A is not operating correctly or is stuck off.',
             'severity': 'warning', 'common_causes': ['Faulty solenoid', 'Transmission fluid dirty', 'Valve body issue'],
             'common_fixes': ['Replace solenoid', 'Change transmission fluid', 'Inspect valve body']},
            
            {'code_number': 'P0752', 'code_type': 'obd_ii', 'title': 'Shift Solenoid A Stuck On',
             'description': 'Shift solenoid A is stuck in the on position.',
             'severity': 'warning', 'common_causes': ['Faulty solenoid', 'Stuck valve', 'Transmission issue'],
             'common_fixes': ['Replace solenoid', 'Inspect valve body', 'Check transmission']},
            
            {'code_number': 'P0753', 'code_type': 'obd_ii', 'title': 'Shift Solenoid A Electrical',
             'description': 'Shift solenoid A has an electrical malfunction.',
             'severity': 'warning', 'common_causes': ['Wiring issue', 'Faulty solenoid', 'Open or short circuit'],
             'common_fixes': ['Check wiring', 'Test solenoid resistance', 'Replace solenoid']},
            
            {'code_number': 'P0755', 'code_type': 'obd_ii', 'title': 'Shift Solenoid B Malfunction',
             'description': 'The shift solenoid B has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty shift solenoid', 'Wiring issue', 'Transmission problem'],
             'common_fixes': ['Replace shift solenoid', 'Check wiring', 'Test transmission']},
            
            {'code_number': 'P0756', 'code_type': 'obd_ii', 'title': 'Shift Solenoid B Performance or Stuck Off',
             'description': 'Shift solenoid B is not operating correctly or is stuck off.',
             'severity': 'warning', 'common_causes': ['Faulty solenoid', 'Transmission fluid dirty', 'Valve body issue'],
             'common_fixes': ['Replace solenoid', 'Change transmission fluid', 'Inspect valve body']},
            
            {'code_number': 'P0757', 'code_type': 'obd_ii', 'title': 'Shift Solenoid B Stuck On',
             'description': 'Shift solenoid B is stuck in the on position.',
             'severity': 'warning', 'common_causes': ['Faulty solenoid', 'Stuck valve', 'Transmission issue'],
             'common_fixes': ['Replace solenoid', 'Inspect valve body', 'Check transmission']},
            
            {'code_number': 'P0758', 'code_type': 'obd_ii', 'title': 'Shift Solenoid B Electrical',
             'description': 'Shift solenoid B has an electrical malfunction.',
             'severity': 'warning', 'common_causes': ['Wiring issue', 'Faulty solenoid', 'Open or short circuit'],
             'common_fixes': ['Check wiring', 'Test solenoid resistance', 'Replace solenoid']},
            
            {'code_number': 'P1404', 'code_type': 'obd_ii', 'title': 'EGR Valve Closed Position Performance',
             'description': 'The EGR valve is not closing properly.',
             'severity': 'warning', 'common_causes': ['Carbon buildup', 'Faulty EGR valve', 'Valve sticking'],
             'common_fixes': ['Clean EGR valve', 'Replace EGR valve', 'Inspect EGR system']},
            
            {'code_number': 'P1406', 'code_type': 'obd_ii', 'title': 'EGR Valve Position Sensor Circuit',
             'description': 'The EGR valve position sensor circuit has malfunctioned.',
             'severity': 'warning', 'common_causes': ['Faulty position sensor', 'Wiring issue', 'Sensor failure'],
             'common_fixes': ['Test position sensor', 'Check wiring', 'Replace sensor']},
            
            {'code_number': 'P1494', 'code_type': 'obd_ii', 'title': 'EGR Valve Lift Insufficient',
             'description': 'The EGR valve is not opening enough.',
             'severity': 'warning', 'common_causes': ['Carbon buildup', 'Faulty EGR valve', 'Vacuum issue'],
             'common_fixes': ['Clean EGR valve', 'Replace EGR valve', 'Check vacuum supply']},
            
            {'code_number': 'P1495', 'code_type': 'obd_ii', 'title': 'EGR Valve Lift Excessive',
             'description': 'The EGR valve is opening too much.',
             'severity': 'warning', 'common_causes': ['Faulty EGR valve', 'Control issue', 'Stuck valve'],
             'common_fixes': ['Test EGR valve', 'Replace EGR valve', 'Check EGR control']},
            
            # Note: P3005 is not a standard OBD-II code, but added for compatibility
            # Standard code would be P0305 (Cylinder 5 Misfire)
            {'code_number': 'P3005', 'code_type': 'obd_ii', 'title': 'Random/Multiple Cylinder Misfire Detected (Non-Standard)',
             'description': 'The powertrain control module (PCM) has detected random or multiple cylinder misfires. This can cause rough idle, loss of power, hesitation, and increased emissions. Note: P3005 is not a standard OBD-II code; P0300 is the standard code for this condition.',
             'severity': 'warning', 'common_causes': ['Faulty spark plugs', 'Bad ignition coils', 'Fuel system issues', 'Vacuum leaks', 'Low compression'],
             'common_fixes': ['Inspect/replace spark plugs', 'Test ignition coils', 'Check fuel pressure', 'Perform compression test', 'Inspect for vacuum leaks']},
        ]
        
        created_count = 0
        updated_count = 0
        
        for code_data in codes:
            code, created = DiagnosticCodeLibrary.objects.update_or_create(
                code_number=code_data['code_number'],
                code_type=code_data['code_type'],
                defaults=code_data
            )
            if created:
                created_count += 1
            else:
                updated_count += 1
        
        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Code Library Population Complete!'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'   - Created: {created_count} new codes'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'   - Updated: {updated_count} existing codes'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'   - Total: {len(codes)} codes processed'
        ))

