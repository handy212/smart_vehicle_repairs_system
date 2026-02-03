# Verification Plan: Roadside Module Integration

This plan outlines the steps to verify the end-to-end functionality of the Roadside Assistance module, ensuring seamless integration across the Customer Portal, Admin Dashboard, and Technician PWA.

## 1. Customer Flow (Portal)
- [ ] **Access Roadside Portal**: Log in as a customer and navigate to "Roadside Assistance" from the sidebar.
- [ ] **View History**: Verify the list of past requests is displayed correctly with status badges.
- [ ] **New Request**: 
    - Click "Request Assistance".
    - Select a vehicle.
    - Select "Towing" (verify mileage input appears) or "Flat Tyre".
    - Use "Get Current Location" (mock if needed) or type location.
    - Submit request.
    - Verify redirection to the Request Details page.
- [ ] **View Details**: Check that all details (Map, Vehicle, Status timeline) are correct.

## 2. Admin/Dispatch Flow (Dashboard)
- [ ] **View Incoming Request**: Log in as admin/dispatcher and navigate to "Roadside".
- [ ] **Filter/Sort**: Verify the new request appears at the top.
- [ ] **Review Details**: Open the request details.
- [ ] **Dispatch**:
    - Click "Dispatch".
    - Select a Technician from the list.
    - Confirm dispatch.
    - Verify status updates to "Dispatched".

## 3. Technician Flow (Mobile PWA)
- [ ] **View Assignment**: Log in as the assigned technician on mobile view.
- [ ] **Navigation**: Tap the "Roadside" tab.
- [ ] **Active Job**: Verify the new dispatched job appears.
- [ ] **Status Updates**:
    - Tap "Go to Breakdown" -> Verify status changes to "En Route".
    - Tap "I Have Arrived" -> Verify status changes to "On Site".
    - Tap "Start Service" -> Verify status changes to "In Progress".
    - Tap "Job Completed" -> Verify status changes to "Completed".
- [ ] **Safety/Notes**: Check that safety guidelines and details are visible.

## 4. Completion & Feedback
- [ ] **Admin Verification**: Verify the admin dashboard shows the request as "Completed".
- [ ] **Customer Feedback**:
    - Customer portal shows "Completed".
    - Customer can rate the service (1-5 stars).
- [ ] **Invoice Generation**: If applicable (chargeable service), verify invoice creation.

## 5. Subscription Logic (Backend Check)
- [ ] **Allowance Deduction**: If the customer has a subscription, verify the allowance was deducted (e.g., 1 tow used).
- [ ] **Access Control**: Verify non-subscribers or those with 0 allowance are handled correctly (Pay-As-You-Go or blocked based on config).
