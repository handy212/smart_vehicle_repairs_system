import logging
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
        Analyzes diagnostic data and suggests repair recommendations.
        Looking at DTCs, findings, and complaints.
        """
        suggestions = []
        
        # 1. Analyze DTCs (Highest priority)
        if hasattr(diagnosis, 'diagnostic_codes'):
            dtcs = diagnosis.diagnostic_codes.all()
            for code in dtcs:
                # Try to find in library (Late import to avoid circular dependency)
                from apps.diagnosis.models import DiagnosticCodeLibrary
                library_entry = DiagnosticCodeLibrary.objects.filter(
                    code_number__iexact=code.code_number,
                    code_type=code.code_type,
                    is_active=True
                ).first()
                
                if library_entry:
                    suggestions.append({
                        'recommendation_type': 'repair',
                        'description': f"Fix based on {code.code_number}: {library_entry.title}",
                        'priority': AIService.map_priority(library_entry.severity),
                        'parts_needed': library_entry.common_fixes or "Requires components inspection",
                        'estimated_labor_hours': 1.5,
                        'estimated_labor_cost': 150.0,
                        'estimated_parts_cost': 250.0,
                    })
        
        # 2. Analyze Findings
        if hasattr(diagnosis, 'findings'):
            findings = diagnosis.findings.all()
            for finding in findings:
                # Heuristic: Engine findings often need parts
                if finding.category == 'engine':
                    suggestions.append({
                        'recommendation_type': 'repair',
                        'description': f"Address Engine Issue: {finding.finding_title}",
                        'priority': AIService.map_priority(finding.severity),
                        'parts_needed': "Replacement parts based on teardown",
                        'estimated_labor_hours': 2.0,
                        'estimated_labor_cost': 200.0,
                        'estimated_parts_cost': 350.0,
                    })
                elif finding.severity == 'critical':
                    suggestions.append({
                        'recommendation_type': 'repair',
                        'description': f"CRITICAL REPAIR: {finding.finding_title}",
                        'priority': 'critical',
                        'parts_needed': "Check inventory for safety components",
                        'estimated_labor_hours': 3.0,
                        'estimated_labor_cost': 300.0,
                        'estimated_parts_cost': 500.0,
                    })
        
        # 3. Simple Keyword Matching (Complaint)
        complaint = diagnosis.customer_complaint.lower() if diagnosis.customer_complaint else ""
        if 'brake' in complaint or 'squeal' in complaint:
            suggestions.append({
                'recommendation_type': 'repair',
                'description': "Inspect and Replace Front Brake Pads/Rotors",
                'priority': 'necessary',
                'parts_needed': "Brake Pads, Brake Fluid",
                'estimated_labor_hours': 1.5,
                'estimated_labor_cost': 150.0,
                'estimated_parts_cost': 120.0,
            })
        elif 'oil' in complaint or 'service' in complaint:
            suggestions.append({
                'recommendation_type': 'service',
                'description': "Full Service: Oil & Filter Change + Multi-point Inspection",
                'priority': 'recommended',
                'parts_needed': "Synthetic Oil, Oil Filter, Gasket",
                'estimated_labor_hours': 1.0,
                'estimated_labor_cost': 100.0,
                'estimated_parts_cost': 85.0,
            })
        elif 'battery' in complaint or 'start' in complaint:
            suggestions.append({
                'recommendation_type': 'repair',
                'description': "Battery Charging System Test & Potential Replacement",
                'priority': 'recommended',
                'parts_needed': "12V Battery, Terminals",
                'estimated_labor_hours': 0.5,
                'estimated_labor_cost': 50.0,
                'estimated_parts_cost': 180.0,
            })

        # Remove approximate duplicates by description
        seen = set()
        unique_suggestions = []
        for s in suggestions:
            if s['description'] not in seen:
                unique_suggestions.append(s)
                seen.add(s['description'])

        return unique_suggestions

    @staticmethod
    def transcribe_audio(audio_file):
        """
        Transcribes audio to text.
        In a real implementation, this would call an external API (Whisper, Google Cloud Speech, etc.).
        For prototype, we simulate transcription based on file metadata.
        """
        # Simulate transcription based on content/filename if available
        filename = getattr(audio_file, 'name', '').lower()
        if 'brake' in filename:
            return "Checking the vehicle because of a squeaky noise when braking. Customer says it happens mostly in the morning. I suspect the front pads are worn down to the wear indicators."
        elif 'engine' in filename:
            return "Found an oil leak around the valve cover gasket. The oil is dripping onto the exhaust manifold which explains the burning smell reported by the customer. Recommend replacing the gasket and cleaning the area."
        else:
            return "Technician voice note: inspected the vehicle suspension. Found that the rear shocks are leaking fluid. Recommend replacement."

    @staticmethod
    def analyze_voice_data(text):
        """
        Analyzes transcribed text for structured information extraction.
        """
        text_lower = text.lower()
        analysis = {
            'summary': text[:100] + "..." if len(text) > 100 else text,
            'keywords': [],
            'suggested_category': 'general',
            'suggested_severity': 'info'
        }
        
        categories = ['brake', 'engine', 'transmission', 'suspension', 'electrical']
        for cat in categories:
            if cat in text_lower:
                analysis['suggested_category'] = cat
                break
        
        if any(word in text_lower for word in ['critical', 'urgent', 'danger', 'leaking', 'failure']):
            analysis['suggested_severity'] = 'critical'
        elif any(word in text_lower for word in ['worn', 'noise', 'smell', 'replace']):
            analysis['suggested_severity'] = 'warning'
            
        return analysis

    @staticmethod
    def analyze_photo_damage(photo_url):
        """
        Simulates AI analysis of a diagnostic photo.
        Returns detected issues and predicted severity.
        """
        # In a real scenario, this would use Vision models (e.g. Gemini Pro Vision)
        # For prototype, we'll return simulated data
        return {
            'detected_issues': [
                'Minor surface rust on subframe',
                'Fluid residue visible near CV boot',
                'Brake pad material thickness appears low'
            ],
            'confidence_score': 0.88,
            'summary': 'Visual inspection suggests moderate wear on suspension and braking components.',
            'suggested_severity': 'minor'
        }

    @staticmethod
    def predict_next_service(work_order_history):
        """
        Predicts next service date and odometer reading based on history.
        Expects a list or queryset of WorkOrder objects.
        """
        if not work_order_history:
            return None
            
        # Extract odometer readings and dates
        history = []
        for wo in work_order_history:
            if hasattr(wo, 'odometer_in') and wo.odometer_in and wo.created_at:
                history.append((wo.created_at, float(wo.odometer_in)))
        
        if not history:
            return None
            
        # Sort by date
        history.sort(key=lambda x: x[0])
        
        latest_date, latest_odo = history[-1]
        
        if len(history) >= 2:
            # Calculate average km per day
            total_days = (history[-1][0] - history[0][0]).days
            total_km = history[-1][1] - history[0][1]
            
            if total_days > 0 and total_km > 0:
                km_per_day = total_km / total_days
            else:
                km_per_day = 40.0 # Default fallback (average commute)
        else:
            km_per_day = 40.0 # Default fallback
            
        # Predict next 5,000 km service
        days_to_service = 5000 / km_per_day
        
        from datetime import date, timedelta
        predicted_date = latest_date.date() + timedelta(days=int(days_to_service))
        
        # Ensure predicted date is in the future
        if predicted_date <= date.today():
            predicted_date = date.today() + timedelta(days=90) # Fallback to 3 months from now
            
        return {
            'latest_odometer': latest_odo,
            'predicted_odometer': latest_odo + 5000,
            'predicted_date': predicted_date.strftime('%B %d, %Y'),
            'km_per_day': round(km_per_day, 1),
            'confidence_score': 0.45 if len(history) < 3 else 0.85,
            'recommendation': 'Based on your driving patterns, we recommend your next service around ' + predicted_date.strftime('%B %Y') + '.'
        }

    @staticmethod
    def generate_report_summary(diagnosis):
        """
        Generates a professional AI summary for the customer report.
        """
        findings_count = diagnosis.findings.count()
        recs_count = diagnosis.repair_recommendations.count()
        dtc_count = diagnosis.diagnostic_codes.count()
        
        vehicle = diagnosis.work_order.vehicle
        
        summary = f"Comprehensive health assessment for your {vehicle.year} {vehicle.make} {vehicle.model}. "
        
        if dtc_count > 0:
            summary += f"Our digital scan identified {dtc_count} system diagnostic code(s) requiring attention. "
            
        if findings_count > 0:
            summary += f"Physical inspection revealed {findings_count} key point(s) of interest. "
            
        critical_recs = diagnosis.repair_recommendations.filter(priority='critical').count()
        if critical_recs > 0:
            summary += f"AI analysis highlights {critical_recs} CRITICAL safety issue(s) that should be addressed immediately. "
        elif recs_count > 0:
            summary += f"We have prepared {recs_count} recommended service item(s) to maintain vehicle reliability and performance."
        else:
            summary += "Your vehicle is in good health with no immediate repairs recommended at this time."
            
        return summary

    @staticmethod
    def decode_obd_code(code):
        """
        AI Proxy to decode an unknown OBD-II code.
        In a production environment, this calls an LLM or an external OBD API
        (like CarMD) to get the description, severity, and common fixes dynamically.
        """
        code = str(code).upper().strip()
        
        # Simulate AI identifying P-codes (Powertrain), C-codes (Chassis), B-codes (Body), U-codes (Network)
        if code.startswith('P03'):
            return {"description": f"Cylinder/Ignition Misfire Detected ({code})", "severity": "critical", "common_fixes": "Inspect Spark Plugs and Ignition Coils"}
        elif code.startswith('P01'):
            return {"description": f"Fuel/Air Metering Issue ({code})", "severity": "warning", "common_fixes": "Check MAF sensor and Vacuum Leaks"}
        elif code.startswith('P04'):
            return {"description": f"Auxiliary Emission Controls ({code})", "severity": "warning", "common_fixes": "Inspect Catalytic Converter and O2 Sensors"}
        elif code.startswith('C'):
            return {"description": f"Chassis/ABS System Fault ({code})", "severity": "critical", "common_fixes": "Check Wheel Speed Sensors"}
        elif code.startswith('B'):
            return {"description": f"Body Control Module Fault ({code})", "severity": "info", "common_fixes": "Check Interior Electronics/Sensors"}
        elif code.startswith('U'):
            return {"description": f"Network Communication Error ({code})", "severity": "warning", "common_fixes": "Check CAN Bus Connections"}
            
        # Generic AI fallback for any totally unknown code
        return {
            "description": f"Manufacturer Specific Diagnostic Code {code}",
            "severity": "info",
            "common_fixes": "Perform detailed component diagnosis"
        }

    @staticmethod
    def analyze_inspection_results(inspection):
        """
        AI Proxy to analyze inspection results and generate notes + recommendations.
        """
        pass_count = inspection.results.filter(result='pass').count()
        fail_count = inspection.results.filter(result='fail').count()
        advisory_count = inspection.results.filter(result='advisory').count()
        attention_count = inspection.results.filter(needs_immediate_attention=True).count()
        
        vehicle = inspection.vehicle
        
        # AI generated summary
        notes = f"AI Analysis: Vehicle Health Report for {vehicle.year} {vehicle.make} {vehicle.model}.\n\n"
        notes += f"Overall Condition: The multi-point inspection recorded {pass_count} passed items, {fail_count} failed items, and {advisory_count} items requiring monitoring.\n\n"
        
        if fail_count > 0:
            notes += f"Safety Alert: {fail_count} components failed inspection"
            if attention_count > 0:
                notes += f", including {attention_count} critical item(s) that pose an immediate safety risk."
            else:
                notes += "."
        elif pass_count > 0:
            notes += "The vehicle is generally in good health with no major safety failures."
        
        # AI generated recommendation
        recommendations = "AI Generated Service Recommendations:\n"
        if fail_count > 0:
            failed_items = inspection.results.filter(result='fail').select_related('inspection_item')[:3]
            recommendations += "- Immediate Repairs Required for Safety:\n"
            for fail in failed_items:
                recommendations += f"  • {fail.inspection_item.name}\n"
            if fail_count > 3:
                recommendations += f"  • ...and {fail_count - 3} other items.\n"
        elif advisory_count > 0:
            recommendations += "- Near-term Maintenance Advice: Monitor the items marked as 'advisory' and plan to replace them within the next routine service interval.\n"
        else:
            recommendations += "- Congratulations, your vehicle passed with flying colors. Continue adhering to the manufacturer's preventative maintenance schedule."
            
        return {
            "notes": notes,
            "recommendations": recommendations,
        }
