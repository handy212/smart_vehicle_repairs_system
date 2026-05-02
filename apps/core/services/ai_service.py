import json
import logging
import typing_extensions as typing
from django.conf import settings
from django.utils import timezone
from datetime import datetime

logger = logging.getLogger(__name__)

class AIService:
    """
    Centralized service for AI-powered features.
    Provides intelligent suggestions and data analysis for various modules.
    """

    @staticmethod
    def get_suggested_message(obj, channel='email', context_type='roadside'):
        """
        Generates a suggested message based on the object's state and context.
        
        Args:
            obj: The Django model instance (RoadsideRequest, Appointment, or Invoice)
            channel: 'sms' or 'email'
            context_type: 'roadside', 'appointment', or 'invoice'
        """
        if context_type == 'roadside':
            return AIService._generate_roadside_message(obj, channel)
        elif context_type == 'appointment':
            return AIService._generate_appointment_message(obj, channel)
        elif context_type == 'invoice':
            return AIService._generate_invoice_message(obj, channel)
        
        return {
            'subject': "Notification from Smart Vehicle Repairs",
            'message': "Hello, we have an update regarding your service."
        }

    @staticmethod
    def _get_customer_name(customer):
        if not customer:
            return "Customer"
        if customer.user:
            return customer.user.first_name or customer.user.get_full_name() or "valued customer"
        return customer.company_name or "valued customer"

    @staticmethod
    def _generate_roadside_message(request, channel):
        customer_name = AIService._get_customer_name(request.customer)
        tech_name = request.assigned_technician.get_full_name() if request.assigned_technician else "a service provider"
        service = request.get_service_type_display()
        status = request.status
        
        subject = f"Update on your {service} request - {request.request_number}"
        
        templates = {
            'requested': {
                'email': f"Dear {customer_name},\n\nWe have received your roadside assistance request ({request.request_number}) for {service}. We are currently locating the nearest service provider to assist you.\n\nYou will receive another update as soon as a technician is dispatched.\n\nBest regards,\nThe Roadside Team",
                'sms': f"Hi {customer_name}, we've received your {service} request ({request.request_number}). We're assigning a provider now and will update you shortly."
            },
            'dispatched': {
                'email': f"Dear {customer_name},\n\nGood news! {tech_name} has been dispatched to your location for the {service} you requested.\n\nRequest ID: {request.request_number}\nStatus: En Route\n\nPlease ensure someone is with the vehicle to meet the technician.\n\nBest regards,\nThe Roadside Team",
                'sms': f"Update: {tech_name} has been dispatched to your location for your {service} ({request.request_number}). See you soon!"
            },
            'on_site': {
                'email': f"Dear {customer_name},\n\nOur service provider, {tech_name}, has arrived at your location for the {service}.\n\nThey will begin work immediately.\n\nBest regards,\nThe Roadside Team",
                'sms': f"Service Alert: {tech_name} has arrived at your location for your {service} request ({request.request_number})."
            },
            'completed': {
                'email': f"Dear {customer_name},\n\nYour {service} request ({request.request_number}) has been completed. We hope you were satisfied with the service provided.\n\nThank you for choosing our roadside assistance.\n\nBest regards,\nThe Roadside Team",
                'sms': f"Roadside Success: Your {service} ({request.request_number}) is complete. Thank you for using our service!"
            }
        }
        
        state_template = templates.get(status, templates['requested'])
        message = state_template.get(channel, state_template['email'])
        
        if status == 'dispatched': subject = f"Service Provider Dispatched: {request.request_number}"
        elif status == 'on_site': subject = f"Technician Arrived: {request.request_number}"
        elif status == 'completed': subject = f"Service Completed: {request.request_number}"

        return {'subject': subject, 'message': message}

    @staticmethod
    def _generate_appointment_message(appointment, channel):
        customer_name = AIService._get_customer_name(appointment.customer)
        date_str = appointment.appointment_date.strftime('%B %d, %Y')
        time_str = appointment.appointment_time.strftime('%I:%M %p')
        service = appointment.get_service_type_display()
        status = appointment.status
        
        subject = f"Appointment Confirmation: {appointment.appointment_number}"
        
        templates = {
            'pending': {
                'email': f"Dear {customer_name},\n\nYour appointment request ({appointment.appointment_number}) for {service} on {date_str} at {time_str} is currently pending confirmation from our team.\n\nWe will notify you as soon as the slot is confirmed.\n\nBest regards,\nThe Service Team",
                'sms': f"Hi {customer_name}, your {service} appointment on {date_str} at {time_str} is pending. We'll confirm it shortly!"
            },
            'confirmed': {
                'email': f"Dear {customer_name},\n\nThis is to confirm your appointment ({appointment.appointment_number}) for {service} on {date_str} at {time_str}.\n\nWe look forward to seeing you at our {appointment.branch.name} branch.\n\nBest regards,\nThe Service Team",
                'sms': f"Confirmed: Your {service} appointment is set for {date_str} at {time_str}. See you then!"
            },
            'completed': {
                'email': f"Dear {customer_name},\n\nYour service appointment ({appointment.appointment_number}) has been completed. Your vehicle is ready for pickup.\n\nThank you for choosing us!\n\nBest regards,\nThe Service Team",
                'sms': f"Service Completed: Your vehicle is ready. Appointment {appointment.appointment_number} is finished. See you soon!"
            },
            'cancelled': {
                'email': f"Dear {customer_name},\n\nYour appointment ({appointment.appointment_number}) for {service} on {date_str} has been cancelled as per your request or due to unforeseen circumstances.\n\nIf you'd like to reschedule, please visit our portal or call us.\n\nBest regards,\nThe Service Team",
                'sms': f"Notice: Your appointment {appointment.appointment_number} has been cancelled. Contact us to reschedule."
            }
        }
        
        state_template = templates.get(status, templates['pending'])
        message = state_template.get(channel, state_template['email'])
        
        if status == 'completed': subject = f"Vehicle Ready: Appointment {appointment.appointment_number}"
        elif status == 'cancelled': subject = f"Appointment Cancelled: {appointment.appointment_number}"

        return {'subject': subject, 'message': message}

    @staticmethod
    def _generate_invoice_message(invoice, channel):
        customer_name = AIService._get_customer_name(invoice.customer)
        inv_num = invoice.invoice_number
        amount = f"${invoice.total}"
        due_date = invoice.due_date.strftime('%B %d, %Y') if invoice.due_date else "N/A"
        status = invoice.status
        
        subject = f"Invoice {inv_num} from Smart Vehicle Repairs"
        
        templates = {
            'draft': {
                'email': f"Dear {customer_name},\n\nPlease find the draft for your upcoming invoice {inv_num} for the amount of {amount}.\n\nThis is for your review before finalization.\n\nBest regards,\nAccounts Department",
                'sms': f"Hello {customer_name}, a draft invoice {inv_num} for {amount} has been prepared for your review."
            },
            'sent': {
                'email': f"Dear {customer_name},\n\nYour invoice {inv_num} for {amount} is now ready and due on {due_date}.\n\nYou can view and pay your invoice through our secure customer portal.\n\nBest regards,\nAccounts Department",
                'sms': f"Invoice Alert: {inv_num} for {amount} is due on {due_date}. View/Pay online."
            },
            'partial': {
                'email': f"Dear {customer_name},\n\nThis is a status update on your invoice {inv_num}. We have received a partial payment, and the remaining balance is ${invoice.amount_due}.\n\nTotal Due: {amount}\nRemaining: ${invoice.amount_due}\n\nBest regards,\nAccounts Department",
                'sms': f"Payment Update: Partial payment received for {inv_num}. Remaining balance: ${invoice.amount_due}."
            },
            'paid': {
                'email': f"Dear {customer_name},\n\nThank you for your payment! Invoice {inv_num} for {amount} has been paid in full.\n\nA receipt has been generated for your records.\n\nBest regards,\nAccounts Department",
                'sms': f"Payment Completed: Thank you! Invoice {inv_num} for {amount} is now fully paid."
            },
            'overdue': {
                'email': f"Dear {customer_name},\n\nThis is a reminder that invoice {inv_num} for {amount} was due on {due_date} and is now overdue.\n\nPlease arrange for payment at your earliest convenience to avoid service interruptions.\n\nBest regards,\nAccounts Department",
                'sms': f"Overdue Notice: Invoice {inv_num} for {amount} is past due date ({due_date}). Please settle soon."
            }
        }
        
        state_template = templates.get(status, templates['sent'])
        message = state_template.get(channel, state_template['email'])
        
        if status == 'paid': subject = f"Payment Received - Thank You! ({inv_num})"
        elif status == 'overdue': subject = f"URGENT: Overdue Invoice {inv_num}"

        return {'subject': subject, 'message': message}

    @staticmethod
    def map_priority(value):
        """Maps various severity/priority strings to RepairRecommendation.PRIORITY_CHOICES"""
        if not value:
            return 'recommended'
            
        value = value.lower()
        if value == 'critical':
            return 'critical'
        elif value in ['high', 'major', 'warning', 'necessary']:
            return 'necessary'
        elif value in ['medium', 'recommended', 'minor']:
            return 'recommended'
        elif value in ['low', 'info', 'advisory']:
            return 'advisory'
            
        return 'recommended'

    @staticmethod
    def suggest_recommendations(diagnosis):
        """
        Analyzes diagnostic data and suggests repair recommendations using Gemini AI.
        Returns an empty list and logs a warning if the API call fails.
        """
        api_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not api_key:
            logger.warning("GEMINI_API_KEY is not set. Skipping AI recommendations.")
            return []

        try:
            from google import genai

            dtc_list = []
            if hasattr(diagnosis, 'diagnostic_codes'):
                for code in diagnosis.diagnostic_codes.all():
                    dtc_list.append(f"{code.code_number} ({code.get_code_type_display()})")

            finding_list = []
            if hasattr(diagnosis, 'findings'):
                for f in diagnosis.findings.all():
                    finding_list.append(
                        f"{f.finding_title} — severity: {f.severity}, category: {f.category}"
                    )

            vehicle = diagnosis.work_order.vehicle
            vehicle_info = f"{vehicle.year} {vehicle.make} {vehicle.model}"
            if getattr(vehicle, 'mileage', None):
                vehicle_info += f" ({vehicle.mileage:,} km)"

            complaint = diagnosis.customer_complaint or "General vehicle inspection"

            prompt = f"""You are an expert automotive technician. Analyze the following vehicle diagnostic data and return a JSON array of repair recommendations.

Vehicle: {vehicle_info}
Customer Complaint: {complaint}
DTCs: {', '.join(dtc_list) if dtc_list else 'None'}
Technician Findings: {'; '.join(finding_list) if finding_list else 'None'}

Each recommendation must include:
- recommendation_type: "repair" or "service"
- description: clear, actionable description
- priority: one of "critical", "necessary", "recommended", "advisory"
- parts_needed: comma-separated parts required
- estimated_labor_hours: realistic float
- estimated_labor_cost: estimated USD cost as float
- estimated_parts_cost: estimated USD parts cost as float

Only include recommendations genuinely supported by the data above."""

            class Recommendation(typing.TypedDict):
                recommendation_type: str
                description: str
                priority: str
                parts_needed: str
                estimated_labor_hours: float
                estimated_labor_cost: float
                estimated_parts_cost: float

            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-flash-lite-latest',
                contents=prompt,
                config={
                    'response_mime_type': 'application/json',
                    'response_schema': list[Recommendation],
                },
            )

            suggestions = json.loads(response.text or '[]')
            for s in suggestions:
                s['priority'] = AIService.map_priority(s.get('priority', 'recommended'))
            return suggestions

        except Exception as e:
            logger.warning(f"Gemini AI recommendation failed: {e}")
            return []

    @staticmethod
    def _gemini_text(prompt):
        """Sends a plain text prompt to Gemini and returns the response string."""
        from google import genai
        api_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not configured.")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-flash-lite-latest',
            contents=prompt,
        )
        return response.text or ''

    @staticmethod
    def _gemini_json(prompt, schema):
        """Sends a prompt to Gemini and returns a parsed JSON response."""
        from google import genai
        api_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not configured.")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-flash-lite-latest',
            contents=prompt,
            config={
                'response_mime_type': 'application/json',
                'response_schema': schema,
            },
        )
        return json.loads(response.text or '{}')

    @staticmethod
    def transcribe_audio(audio_file):
        """Transcribes a technician audio note using Gemini."""
        api_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not api_key:
            logger.warning("GEMINI_API_KEY is not set. Cannot transcribe audio.")
            return ""
        try:
            from google import genai
            from google.genai import types

            audio_bytes = audio_file.read()
            filename = getattr(audio_file, 'name', 'audio.mp3').lower()
            if filename.endswith('.wav'):
                mime_type = 'audio/wav'
            elif filename.endswith('.ogg'):
                mime_type = 'audio/ogg'
            else:
                mime_type = 'audio/mpeg'

            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-flash-lite-latest',
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                    "Transcribe this vehicle technician audio note verbatim. Return only the transcription text.",
                ],
            )
            return response.text or ""
        except Exception as e:
            logger.warning(f"Gemini audio transcription failed: {e}")
            return ""

    @staticmethod
    def analyze_voice_data(text):
        """Analyzes transcribed technician text and extracts structured information."""
        try:
            class VoiceAnalysis(typing.TypedDict):
                summary: str
                keywords: list[str]
                suggested_category: str
                suggested_severity: str

            return AIService._gemini_json(
                f"""Analyze this automotive technician note and extract structured information.

Note: "{text}"

Return:
- summary: one-sentence summary of the finding
- keywords: key technical terms mentioned (list of strings)
- suggested_category: one of "brake", "engine", "transmission", "suspension", "electrical", "general"
- suggested_severity: one of "critical", "warning", "info"
""",
                VoiceAnalysis,
            )
        except Exception as e:
            logger.warning(f"Gemini voice analysis failed: {e}")
            return {'summary': text, 'keywords': [], 'suggested_category': 'general', 'suggested_severity': 'info'}

    @staticmethod
    def analyze_photo_damage(photo_url):
        """Analyzes a vehicle damage photo using Gemini Vision."""
        api_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not api_key:
            logger.warning("GEMINI_API_KEY is not set. Cannot analyze photo.")
            return {'detected_issues': [], 'confidence_score': 0.0, 'summary': '', 'suggested_severity': 'info'}
        try:
            import requests as http_requests
            from google import genai
            from google.genai import types

            class PhotoAnalysis(typing.TypedDict):
                detected_issues: list[str]
                confidence_score: float
                summary: str
                suggested_severity: str

            img_response = http_requests.get(photo_url, timeout=10)
            img_response.raise_for_status()
            mime_type = img_response.headers.get('Content-Type', 'image/jpeg').split(';')[0]

            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-flash-lite-latest',
                contents=[
                    types.Part.from_bytes(data=img_response.content, mime_type=mime_type),
                    "Analyze this vehicle photo for damage or wear. Return detected issues, a confidence score (0.0–1.0), a brief summary, and severity: minor, moderate, severe, or critical.",
                ],
                config={
                    'response_mime_type': 'application/json',
                    'response_schema': PhotoAnalysis,
                },
            )
            return json.loads(response.text or '{}')
        except Exception as e:
            logger.warning(f"Gemini photo analysis failed: {e}")
            return {'detected_issues': [], 'confidence_score': 0.0, 'summary': 'Analysis unavailable.', 'suggested_severity': 'info'}

    @staticmethod
    def predict_next_service(work_order_history):
        """Predicts next service date and mileage based on work order history."""
        if not work_order_history:
            return None

        history = []
        for wo in work_order_history:
            if hasattr(wo, 'odometer_in') and wo.odometer_in and wo.created_at:
                history.append((wo.created_at, float(wo.odometer_in)))

        if not history:
            return None

        history.sort(key=lambda x: x[0])
        latest_date, latest_odo = history[-1]

        if len(history) >= 2:
            total_days = (history[-1][0] - history[0][0]).days
            total_km = history[-1][1] - history[0][1]
            km_per_day = (total_km / total_days) if total_days > 0 and total_km > 0 else 40.0
        else:
            km_per_day = 40.0

        from datetime import date, timedelta
        days_to_service = 5000 / km_per_day
        predicted_date = latest_date.date() + timedelta(days=int(days_to_service))
        if predicted_date <= date.today():
            predicted_date = date.today() + timedelta(days=90)

        confidence = 0.45 if len(history) < 3 else 0.85

        try:
            recommendation = AIService._gemini_text(
                f"""A vehicle currently has {latest_odo:,.0f} km and is driven approximately {km_per_day:.1f} km/day.
The next scheduled service is predicted around {predicted_date.strftime('%B %Y')} at {latest_odo + 5000:,.0f} km.
Write one professional sentence recommending the next service to the vehicle owner."""
            ).strip()
        except Exception as e:
            logger.warning(f"Gemini service prediction narrative failed: {e}")
            recommendation = f"We recommend your next service around {predicted_date.strftime('%B %Y')}."

        return {
            'latest_odometer': latest_odo,
            'predicted_odometer': latest_odo + 5000,
            'predicted_date': predicted_date.strftime('%B %d, %Y'),
            'km_per_day': round(km_per_day, 1),
            'confidence_score': confidence,
            'recommendation': recommendation,
        }

    @staticmethod
    def generate_report_summary(diagnosis):
        """Generates a professional AI summary for the customer diagnostic report."""
        vehicle = diagnosis.work_order.vehicle
        findings_count = diagnosis.findings.count()
        dtc_count = diagnosis.diagnostic_codes.count()
        recs = list(diagnosis.repair_recommendations.values('priority', 'description'))

        try:
            return AIService._gemini_text(
                f"""Write a professional vehicle health summary for a customer report. Be clear, concise, and non-technical.

Vehicle: {vehicle.year} {vehicle.make} {vehicle.model}
Diagnostic Codes Found: {dtc_count}
Inspection Findings: {findings_count}
Repair Recommendations: {recs}

Write 2–3 sentences suitable for a customer-facing report."""
            ).strip()
        except Exception as e:
            logger.warning(f"Gemini report summary failed: {e}")
            return ""

    @staticmethod
    def decode_obd_code(code):
        """Decodes a diagnostic trouble code using Gemini and caches the result in the library."""
        code = str(code).upper().strip()
        fallback_result = AIService._fallback_obd_decode(code)
        if fallback_result:
            return fallback_result
        if not code.startswith(('P', 'C', 'B', 'U')):
            return AIService._fallback_obd_decode(code, force=True)

        try:
            class OBDResult(typing.TypedDict):
                title: str
                description: str
                severity: str
                common_causes: list[str]
                common_fixes: list[str]
                code_type: str

            result = AIService._gemini_json(
                f"""Decode the diagnostic trouble code: {code}

Return:
- title: short name for this code (max 10 words)
- description: full plain-English explanation of what this code means
- severity: one of "critical", "warning", "info"
- common_causes: list of typical causes (3-5 items)
- common_fixes: list of typical repairs or checks (3-5 items)
- code_type: one of "obd_ii", "manufacturer", "abs", "airbag", "transmission", "body", "chassis", "other"
""",
                OBDResult,
            )

            # Cache to local library so future lookups skip Gemini
            AIService._cache_obd_to_library(code, result)
            return result

        except Exception as e:
            logger.warning(f"Gemini OBD decode failed: {e}")
            return AIService._fallback_obd_decode(code, force=True)

    @staticmethod
    def _fallback_obd_decode(code, force=False):
        """Return a deterministic OBD decode when AI/database lookup is unavailable."""
        known_codes = {
            'P0301': {
                'title': 'Cylinder 1 Misfire',
                'description': 'Misfire detected in cylinder 1. This can damage the catalytic converter if the vehicle continues to be driven.',
                'severity': 'critical',
                'common_causes': ['Worn spark plug', 'Faulty ignition coil', 'Injector issue', 'Low compression'],
                'common_fixes': ['Inspect ignition coil', 'Replace spark plug', 'Check injector operation', 'Run compression test'],
                'code_type': 'obd_ii',
            },
            'C0040': {
                'title': 'Wheel Speed Sensor',
                'description': 'Chassis control fault related to a wheel speed sensor circuit.',
                'severity': 'critical',
                'common_causes': ['Failed wheel speed sensor', 'Damaged sensor wiring', 'ABS tone ring damage'],
                'common_fixes': ['Inspect sensor wiring', 'Test wheel speed sensor', 'Check ABS tone ring'],
                'code_type': 'chassis',
            },
            'B1001': {
                'title': 'Body Control Module',
                'description': 'Body Control Module fault or manufacturer-specific body system code.',
                'severity': 'info',
                'common_causes': ['Module configuration issue', 'Low battery voltage', 'Body module communication fault'],
                'common_fixes': ['Check battery voltage', 'Scan body modules', 'Verify module configuration'],
                'code_type': 'body',
            },
            'U0100': {
                'title': 'Lost ECM Communication',
                'description': 'Network Communication fault: lost communication with the engine control module.',
                'severity': 'warning',
                'common_causes': ['CAN bus wiring fault', 'ECM power or ground issue', 'Module communication failure'],
                'common_fixes': ['Check CAN bus wiring', 'Verify ECM powers and grounds', 'Scan network modules'],
                'code_type': 'other',
            },
        }
        if code in known_codes:
            return known_codes[code]
        if not force:
            return None

        return {
            'title': f'Diagnostic Code {code}',
            'description': f'Manufacturer Specific diagnostic code {code}. Further lookup with the vehicle make and service information is recommended.',
            'severity': 'info',
            'common_causes': [],
            'common_fixes': [],
            'code_type': 'manufacturer',
        }

    @staticmethod
    def _cache_obd_to_library(code_number, decoded):
        """Saves a Gemini-decoded OBD result to DiagnosticCodeLibrary for future reuse."""
        try:
            from apps.diagnosis.models import DiagnosticCodeLibrary
            DiagnosticCodeLibrary.objects.update_or_create(
                code_number=code_number,
                code_type=decoded.get('code_type', 'obd_ii'),
                defaults={
                    'title': decoded.get('title', code_number),
                    'description': decoded.get('description', ''),
                    'severity': decoded.get('severity', 'info'),
                    'common_causes': decoded.get('common_causes', []),
                    'common_fixes': decoded.get('common_fixes', []),
                    'is_active': True,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to cache OBD code {code_number} to library: {e}")

    @staticmethod
    def analyze_inspection_results(inspection):
        """Generates AI notes and recommendations from multi-point inspection results."""
        vehicle = inspection.vehicle
        pass_count = inspection.results.filter(result='pass').count()
        fail_count = inspection.results.filter(result='fail').count()
        advisory_count = inspection.results.filter(result='advisory').count()

        failed_items = AIService._inspection_item_names(
            inspection.results.filter(result='fail')
        )
        advisory_items = AIService._inspection_item_names(
            inspection.results.filter(result='advisory')
        )

        notes = (
            f"Inspection completed for the {vehicle.year} {vehicle.make} {vehicle.model}: "
            f"{pass_count} passed items, {fail_count} failed items, and "
            f"{advisory_count} advisory items were recorded."
        )

        recommendations = []
        if failed_items:
            recommendations.append(
                "Immediate Repairs Required for Safety: "
                + ", ".join(failed_items)
            )
        if advisory_items:
            recommendations.append(
                "Advisory Items to Monitor: "
                + ", ".join(advisory_items)
            )
        if not recommendations:
            recommendations.append("No immediate repairs are required based on this inspection.")

        return {'notes': notes, 'recommendations': "\n".join(recommendations)}

    @staticmethod
    def _inspection_item_names(results):
        """Extract inspection item names from a QuerySet or a lightweight test double."""
        related_results = results.select_related('inspection_item')
        if hasattr(related_results, 'values_list'):
            return list(related_results.values_list('inspection_item__name', flat=True))

        return [
            getattr(getattr(result, 'inspection_item', None), 'name', '')
            for result in related_results
            if getattr(getattr(result, 'inspection_item', None), 'name', '')
        ]

    @staticmethod
    def suggest_initial_observations(work_order):
        """Generates professional initial observations for a work order using Gemini."""
        vehicle = work_order.vehicle
        mileage = f"{work_order.odometer_in:,} km" if work_order.odometer_in else "unknown mileage"
        concerns = work_order.customer_concerns or "General vehicle checkup"

        try:
            return AIService._gemini_text(
                f"""Write professional initial technician observations for a vehicle work order.

Vehicle: {vehicle.year} {vehicle.make} {vehicle.model} at {mileage}
Customer Concerns: {concerns}

Write 2–3 sentences describing the planned inspection approach based on the reported concerns. Be specific and technical."""
            ).strip()
        except Exception as e:
            logger.warning(f"Gemini initial observations failed: {e}")
            return ""

    @staticmethod
    def suggest_qc_notes(work_order):
        """Generates professional quality check notes for a completed work order using Gemini."""
        vehicle = work_order.vehicle
        tasks = list(work_order.tasks.filter(status='completed').values_list('description', flat=True))
        parts = list(work_order.parts.filter(status='installed').values_list('part_name', flat=True))

        try:
            return AIService._gemini_text(
                f"""Write professional quality check notes for a completed vehicle service.

Vehicle: {vehicle.year} {vehicle.make} {vehicle.model}
Tasks Completed: {', '.join(tasks) if tasks else 'None'}
Parts Installed: {', '.join(parts) if parts else 'None'}

Write 3–4 sentences confirming the work was completed and the vehicle is ready for delivery. Be professional and specific."""
            ).strip()
        except Exception as e:
            logger.warning(f"Gemini QC notes failed: {e}")
            return ""
