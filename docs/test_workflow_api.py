#!/usr/bin/env python
"""
Standalone script to test the work order workflow via API endpoints.

This script simulates the frontend workflow by making API calls to test all transitions.

Usage:
    python test_workflow_api.py [--base-url BASE_URL] [--username USERNAME] [--password PASSWORD] [--work-order-id ID]

Prerequisites:
    - Django server must be running
    - Valid user credentials
    - At least one branch exists in the system
"""

import argparse
import requests
import json
import sys
from typing import Dict, List, Optional

class WorkflowTester:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.token = None
        self.work_order_id = None
        
    def authenticate(self) -> bool:
        """Authenticate and get token."""
        print("Authenticating...")
        try:
            response = self.session.post(
                f'{self.base_url}/api/auth/login/',
                json={'username': self.username, 'password': self.password}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('token') or data.get('access_token')
                if self.token:
                    self.session.headers.update({
                        'Authorization': f'Token {self.token}',
                        'Content-Type': 'application/json'
                    })
                    print("✓ Authentication successful\n")
                    return True
                else:
                    print("✗ No token in response")
                    return False
            else:
                print(f"✗ Authentication failed: {response.status_code}")
                print(f"  Response: {response.text}")
                return False
        except Exception as e:
            print(f"✗ Authentication error: {str(e)}")
            return False
    
    def create_test_work_order(self) -> Optional[int]:
        """Create a test work order."""
        print("Creating test work order...")
        
        # Get branches first
        branches_response = self.session.get(f'{self.base_url}/api/branches/branches/')
        if branches_response.status_code != 200:
            print("✗ Failed to get branches")
            return None
        
        branches = branches_response.json().get('results', [])
        if not branches:
            print("✗ No branches found. Please create a branch first.")
            return None
        
        branch_id = branches[0]['id']
        
        # Get or create customer
        customers_response = self.session.get(
            f'{self.base_url}/api/customers/customers/',
            params={'email': 'workflow_test@example.com'}
        )
        
        if customers_response.status_code == 200:
            customers = customers_response.json().get('results', [])
            if customers:
                customer_id = customers[0]['id']
            else:
                # Create customer
                customer_response = self.session.post(
                    f'{self.base_url}/api/customers/customers/',
                    json={
                        'email': 'workflow_test@example.com',
                        'first_name': 'Workflow',
                        'last_name': 'Test',
                        'phone': '555-0100',
                    }
                )
                if customer_response.status_code in [200, 201]:
                    customer_id = customer_response.json()['id']
                else:
                    print(f"✗ Failed to create customer: {customer_response.text}")
                    return None
        else:
            print(f"✗ Failed to get customers: {customers_response.text}")
            return None
        
        # Get customer vehicles
        vehicles_response = self.session.get(
            f'{self.base_url}/api/vehicles/vehicles/',
            params={'owner': customer_id}
        )
        
        if vehicles_response.status_code == 200:
            vehicles = vehicles_response.json().get('results', [])
            if vehicles:
                vehicle_id = vehicles[0]['id']
            else:
                # Create vehicle
                vehicle_response = self.session.post(
                    f'{self.base_url}/api/vehicles/vehicles/',
                    json={
                        'owner': customer_id,
                        'make': 'Toyota',
                        'model': 'Camry',
                        'year': 2020,
                        'vin': 'TESTWORKFLOW123',
                        'license_plate': 'TEST123',
                        'current_mileage': 50000,
                    }
                )
                if vehicle_response.status_code in [200, 201]:
                    vehicle_id = vehicle_response.json()['id']
                else:
                    print(f"✗ Failed to create vehicle: {vehicle_response.text}")
                    return None
        else:
            print(f"✗ Failed to get vehicles: {vehicles_response.text}")
            return None
        
        # Create work order
        work_order_response = self.session.post(
            f'{self.base_url}/api/workorders/work-orders/',
            json={
                'customer': customer_id,
                'vehicle': vehicle_id,
                'branch': branch_id,
                'customer_concerns': 'Test workflow - oil change needed',
                'odometer_in': 50000,
                'status': 'draft',
                'priority': 'normal',
            }
        )
        
        if work_order_response.status_code in [200, 201]:
            work_order = work_order_response.json()
            self.work_order_id = work_order['id']
            print(f"✓ Created work order: {work_order['work_order_number']}\n")
            return self.work_order_id
        else:
            print(f"✗ Failed to create work order: {work_order_response.text}")
            return None
    
    def test_action(self, action_name: str, method: str, endpoint: str, 
                   data: Optional[Dict] = None, expected_status: int = 200) -> bool:
        """Test a workflow action."""
        try:
            url = f'{self.base_url}{endpoint}'
            
            if method == 'POST':
                response = self.session.post(url, json=data or {})
            elif method == 'PATCH':
                response = self.session.patch(url, json=data or {})
            else:
                response = self.session.get(url)
            
            if response.status_code == expected_status:
                print(f"  ✓ {action_name}")
                return True
            else:
                print(f"  ✗ {action_name}: {response.status_code}")
                print(f"    {response.text[:200]}")
                return False
        except Exception as e:
            print(f"  ✗ {action_name}: {str(e)}")
            return False
    
    def get_work_order(self) -> Optional[Dict]:
        """Get current work order status."""
        response = self.session.get(
            f'{self.base_url}/api/workorders/work-orders/{self.work_order_id}/'
        )
        if response.status_code == 200:
            return response.json()
        return None
    
    def run_tests(self, work_order_id: Optional[int] = None):
        """Run all workflow tests."""
        results = {'passed': 0, 'failed': 0}
        
        if work_order_id:
            self.work_order_id = work_order_id
            wo = self.get_work_order()
            if wo:
                print(f"Using existing work order: {wo['work_order_number']}\n")
            else:
                print(f"✗ Work order {work_order_id} not found")
                return
        else:
            if not self.create_test_work_order():
                return
        
        print("=== Phase 1: Customer Intake & Diagnosis ===\n")
        
        # Test Inspection
        if self.test_action(
            "Draft → Inspection",
            "PATCH",
            f'/api/workorders/work-orders/{self.work_order_id}/',
            {'status': 'inspection'}
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Reset to draft
        self.test_action(
            "Reset to Draft",
            "PATCH",
            f'/api/workorders/work-orders/{self.work_order_id}/',
            {'status': 'draft'}
        )
        
        # Test Start Intake
        if self.test_action(
            "Start Intake",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/start_intake/'
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Test Start Diagnosis
        if self.test_action(
            "Start Diagnosis",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/start_diagnosis/'
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Test Complete Diagnosis
        if self.test_action(
            "Complete Diagnosis (with approval)",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/complete_diagnosis/',
            {
                'diagnosis_notes': 'Diagnosis complete: Oil change needed',
                'requires_approval': True,
                'estimated_labor_cost': '50.00',
                'estimated_parts_cost': '30.00',
            }
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        wo = self.get_work_order()
        if wo and wo['status'] == 'awaiting_approval':
            # Test Request Approval (manual)
            if self.test_action(
                "Request Approval",
                "POST",
                f'/api/workorders/work-orders/{self.work_order_id}/request_approval/'
            ):
                results['passed'] += 1
            else:
                results['failed'] += 1
        
        print("\n=== Phase 2: Quotation & Customer Approval ===\n")
        
        # Test Approve
        if self.test_action(
            "Approve Work Order",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/approve/',
            {
                'approval_method': 'phone',
                'approval_notes': 'Customer approved via phone',
            }
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        print("\n=== Phase 3: Repair Execution ===\n")
        
        # Test Start Work
        if self.test_action(
            "Start Work",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/start_work/'
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Test Additional Work Found
        if self.test_action(
            "Additional Work Found",
            "PATCH",
            f'/api/workorders/work-orders/{self.work_order_id}/',
            {'status': 'additional_work_found'}
        ):
            results['passed'] += 1
            # Verify note was created
            notes_response = self.session.get(
                f'{self.base_url}/api/workorders/notes/',
                params={'work_order': self.work_order_id}
            )
            if notes_response.status_code == 200:
                notes = notes_response.json().get('results', [])
                if any('additional' in note.get('note', '').lower() for note in notes):
                    print("    ✓ Additional work note created")
                else:
                    print("    ⚠ Additional work note may not have been created")
        else:
            results['failed'] += 1
        
        # Request approval for additional work
        wo = self.get_work_order()
        if wo and wo['status'] == 'additional_work_found':
            if self.test_action(
                "Request Approval for Additional Work",
                "POST",
                f'/api/workorders/work-orders/{self.work_order_id}/request_approval/'
            ):
                results['passed'] += 1
            else:
                results['failed'] += 1
            
            # Re-approve
            if self.test_action(
                "Re-approve Work Order",
                "POST",
                f'/api/workorders/work-orders/{self.work_order_id}/approve/',
                {'approval_method': 'phone'}
            ):
                results['passed'] += 1
            else:
                results['failed'] += 1
            
            # Restart work
            if self.test_action(
                "Restart Work",
                "POST",
                f'/api/workorders/work-orders/{self.work_order_id}/start_work/'
            ):
                results['passed'] += 1
            else:
                results['failed'] += 1
        
        # Test Pause
        if self.test_action(
            "Pause Work Order",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/pause/',
            {'reason': 'Waiting for parts'}
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Test Resume
        if self.test_action(
            "Resume Work Order",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/resume/'
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        print("\n=== Phase 4: Quality Control & Billing ===\n")
        
        # Test Request Quality Check
        if self.test_action(
            "Request Quality Check",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/request_quality_check/'
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Test Quality Check
        if self.test_action(
            "Perform Quality Check (Passed)",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/quality_check/',
            {
                'passed': True,
                'notes': 'Quality check passed',
            }
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Test Complete
        if self.test_action(
            "Complete Work Order",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/complete/',
            {
                'odometer_out': 50100,
                'completion_notes': 'Work completed successfully',
            }
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Test Mark Invoiced
        if self.test_action(
            "Mark as Invoiced",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/mark_invoiced/'
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        print("\n=== Phase 5: Vehicle Handover ===\n")
        
        # Test Close
        if self.test_action(
            "Close Work Order",
            "POST",
            f'/api/workorders/work-orders/{self.work_order_id}/close/'
        ):
            results['passed'] += 1
        else:
            results['failed'] += 1
        
        # Get final status
        wo = self.get_work_order()
        if wo:
            print(f"\nFinal Status: {wo['status']}")
            print(f"Work Order: {wo['work_order_number']}")
        
        # Print summary
        print(f"\n=== Test Summary ===")
        print(f"Passed: {results['passed']}")
        print(f"Failed: {results['failed']}")
        print(f"Success Rate: {(results['passed']/(results['passed']+results['failed'])*100):.1f}%")


def main():
    parser = argparse.ArgumentParser(description='Test work order workflow via API')
    parser.add_argument('--base-url', default='http://localhost:8000',
                       help='Base URL of the API (default: http://localhost:8000)')
    parser.add_argument('--username', default='admin',
                       help='Username for authentication (default: admin)')
    parser.add_argument('--password', default='admin123',
                       help='Password for authentication (default: admin123)')
    parser.add_argument('--work-order-id', type=int,
                       help='Use existing work order ID instead of creating new one')
    
    args = parser.parse_args()
    
    tester = WorkflowTester(args.base_url, args.username, args.password)
    
    if not tester.authenticate():
        print("\n✗ Failed to authenticate. Exiting.")
        sys.exit(1)
    
    tester.run_tests(args.work_order_id)


if __name__ == '__main__':
    main()


