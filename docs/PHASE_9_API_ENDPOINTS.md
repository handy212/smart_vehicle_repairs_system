# Phase 9: Document Management API Endpoints

## Overview
Complete RESTful API for document management with file uploads, versioning, sharing, and digital signatures.

## Base URL
`/api/documents/`

---

## Document Categories

### 1. List Categories
**GET** `/api/documents/categories/`
- **Description**: Get all document categories
- **Auth**: Required
- **Query Params**: 
  - `search` - Search by name, slug, description
  - `is_active` - Filter by active status
  - `parent` - Filter by parent category
  - `ordering` - Order by name, display_order, created_at
- **Response**: List of categories

### 2. Create Category
**POST** `/api/documents/categories/`
- **Description**: Create a new document category
- **Auth**: Required
- **Body**: 
  ```json
  {
    "name": "Invoice Documents",
    "slug": "invoice-documents",
    "description": "Documents related to invoices",
    "icon": "fa-file-invoice",
    "parent": null,
    "is_active": true,
    "display_order": 1
  }
  ```

### 3. Get Category
**GET** `/api/documents/categories/{id}/`
- **Description**: Get category details
- **Auth**: Required

### 4. Update Category
**PUT/PATCH** `/api/documents/categories/{id}/`
- **Description**: Update category
- **Auth**: Required

### 5. Delete Category
**DELETE** `/api/documents/categories/{id}/`
- **Description**: Delete category
- **Auth**: Required

### 6. Get Category Tree
**GET** `/api/documents/categories/tree/`
- **Description**: Get hierarchical category tree
- **Auth**: Required
- **Response**: Nested category structure with children

---

## Documents

### 7. List Documents
**GET** `/api/documents/documents/`
- **Description**: Get all documents (with filters)
- **Auth**: Required
- **Query Params**:
  - `search` - Search by document_number, title, description, tags, filename
  - `status` - Filter by status (draft, active, archived)
  - `category` - Filter by category ID
  - `file_type` - Filter by file type (MIME type)
  - `is_public` - Filter by public status
  - `uploaded_by` - Filter by uploader
  - `customer` - Filter by customer ID
  - `vehicle` - Filter by vehicle ID
  - `work_order` - Filter by work order ID
  - `appointment` - Filter by appointment ID
  - `invoice` - Filter by invoice ID
  - `estimate` - Filter by estimate ID
  - `ordering` - Order by uploaded_at, title, access_count, file_size
- **Response**: Lightweight list of documents

### 8. Upload Document
**POST** `/api/documents/documents/`
- **Description**: Upload a new document
- **Auth**: Required
- **Content-Type**: multipart/form-data
- **Body**:
  - `file` (required) - File to upload (max 50MB)
  - `title` (required) - Document title
  - `description` - Document description
  - `category` - Category ID
  - `tags` - Comma-separated tags
  - `status` - Status (draft/active/archived)
  - `is_public` - Public access flag
  - `customer` - Customer ID
  - `vehicle` - Vehicle ID
  - `work_order` - Work order ID
  - `appointment` - Appointment ID
  - `invoice` - Invoice ID
  - `estimate` - Estimate ID

### 9. Get Document
**GET** `/api/documents/documents/{id}/`
- **Description**: Get document details (logs access)
- **Auth**: Required
- **Response**: Complete document details with relationships

### 10. Update Document
**PUT/PATCH** `/api/documents/documents/{id}/`
- **Description**: Update document metadata
- **Auth**: Required
- **Note**: Does not update the file itself (use upload_version for that)

### 11. Delete Document
**DELETE** `/api/documents/documents/{id}/`
- **Description**: Delete document
- **Auth**: Required

### 12. Download Document
**GET** `/api/documents/documents/{id}/download/`
- **Description**: Download document file (logs download)
- **Auth**: Required
- **Response**: File with attachment disposition

### 13. Preview Document
**GET** `/api/documents/documents/{id}/preview/`
- **Description**: Preview document inline
- **Auth**: Required
- **Response**: File with inline disposition

### 14. Upload New Version
**POST** `/api/documents/documents/{id}/upload_version/`
- **Description**: Upload a new version of the document
- **Auth**: Required
- **Content-Type**: multipart/form-data
- **Body**:
  - `file` (required) - New file version
  - `changes_description` - Description of changes
- **Response**: New version details

### 15. Get Document Versions
**GET** `/api/documents/documents/{id}/versions/`
- **Description**: Get all versions of document
- **Auth**: Required
- **Response**: List of versions

### 16. Restore Version
**POST** `/api/documents/documents/{id}/restore_version/`
- **Description**: Restore a specific version
- **Auth**: Required
- **Body**:
  ```json
  {
    "version_id": 123
  }
  ```
- **Response**: Confirmation message with new version number

### 17. Create Share Link
**POST** `/api/documents/documents/{id}/share/`
- **Description**: Create a share link for document
- **Auth**: Required
- **Body**:
  ```json
  {
    "shared_with_email": "user@example.com",
    "access_code": "1234",
    "expires_in_days": 7,
    "max_views": 10,
    "send_email": true
  }
  ```
- **Response**: Share details with share_url and token

### 18. Request Signature
**POST** `/api/documents/documents/{id}/request_signature/`
- **Description**: Request a signature on document
- **Auth**: Required
- **Body**:
  ```json
  {
    "signer_name": "John Doe",
    "signer_email": "john@example.com",
    "expires_in_days": 7,
    "notes": "Please review and sign",
    "send_email": true
  }
  ```
- **Response**: Signature request details with signature_url

### 19. Get Document Signatures
**GET** `/api/documents/documents/{id}/signatures/`
- **Description**: Get all signature requests for document
- **Auth**: Required
- **Response**: List of signature requests

### 20. Get Document Access Logs
**GET** `/api/documents/documents/{id}/access_logs/`
- **Description**: Get access logs for document (last 100)
- **Auth**: Required
- **Response**: List of access log entries

### 21. Search Documents
**GET** `/api/documents/documents/search/`
- **Description**: Advanced document search
- **Auth**: Required
- **Query Params**:
  - `query` - Text search across multiple fields
  - `category` - Category ID
  - `status` - Document status
  - `file_type` - File type filter
  - `uploaded_by` - Uploader user ID
  - `customer` - Customer ID
  - `vehicle` - Vehicle ID
  - `work_order` - Work order ID
  - `date_from` - Start date (YYYY-MM-DD)
  - `date_to` - End date (YYYY-MM-DD)
  - `tags` - Comma-separated tags
- **Response**: Paginated search results

### 22. Get Document Statistics
**GET** `/api/documents/documents/stats/`
- **Description**: Get document statistics and analytics
- **Auth**: Required
- **Response**:
  ```json
  {
    "total_documents": 150,
    "total_size": 1073741824,
    "total_size_display": "1.0 GB",
    "by_status": {
      "Active": 120,
      "Draft": 20,
      "Archived": 10
    },
    "by_category": {
      "Invoices": 50,
      "Work Orders": 40,
      "Estimates": 30
    },
    "by_file_type": {
      "application/pdf": 80,
      "image/jpeg": 40,
      "image/png": 30
    },
    "recent_uploads": [...],
    "most_accessed": [...]
  }
  ```

### 23. Get Documents by Work Order
**GET** `/api/documents/documents/by_work_order/?work_order_id={id}`
- **Description**: Get all documents for a specific work order
- **Auth**: Required
- **Response**: List of documents

### 24. Get Documents by Customer
**GET** `/api/documents/documents/by_customer/?customer_id={id}`
- **Description**: Get all documents for a specific customer
- **Auth**: Required
- **Response**: List of documents

### 25. Get Documents by Vehicle
**GET** `/api/documents/documents/by_vehicle/?vehicle_id={id}`
- **Description**: Get all documents for a specific vehicle
- **Auth**: Required
- **Response**: List of documents

---

## Document Versions

### 26. List Versions
**GET** `/api/documents/versions/`
- **Description**: Get all document versions
- **Auth**: Required
- **Query Params**:
  - `document` - Filter by document ID
  - `uploaded_by` - Filter by uploader
  - `ordering` - Order by version_number, uploaded_at

### 27. Get Version
**GET** `/api/documents/versions/{id}/`
- **Description**: Get version details
- **Auth**: Required

### 28. Download Version
**GET** `/api/documents/versions/{id}/download/`
- **Description**: Download specific version (logs download)
- **Auth**: Required
- **Response**: File with attachment disposition

---

## Document Shares

### 29. List Shares
**GET** `/api/documents/shares/`
- **Description**: Get all share links
- **Auth**: Required
- **Query Params**:
  - `document` - Filter by document ID
  - `shared_by` - Filter by sharer
  - `is_active` - Filter by active status
  - `ordering` - Order by created_at, expires_at, view_count

### 30. Create Share
**POST** `/api/documents/shares/`
- **Description**: Create a share link
- **Auth**: Required
- **Body**: Same as document share action

### 31. Get Share
**GET** `/api/documents/shares/{id}/`
- **Description**: Get share details
- **Auth**: Required

### 32. Update Share
**PUT/PATCH** `/api/documents/shares/{id}/`
- **Description**: Update share settings
- **Auth**: Required

### 33. Delete Share (Revoke)
**DELETE** `/api/documents/shares/{id}/`
- **Description**: Revoke share link
- **Auth**: Required

### 34. Access Shared Document (PUBLIC)
**GET** `/api/documents/shares/{token}/`
- **Description**: Public endpoint to access shared document
- **Auth**: Not required
- **Response**: Document details or code requirement
- **Notes**: 
  - If access_code required, returns `requires_code: true`
  - Otherwise returns document and remaining views

### 35. Verify Share Access Code (PUBLIC)
**POST** `/api/documents/shares/{token}/verify_code/`
- **Description**: Verify access code for protected share
- **Auth**: Not required
- **Body**:
  ```json
  {
    "access_code": "1234"
  }
  ```
- **Response**: Document details if code is valid

### 36. Get Share Access Log
**GET** `/api/documents/shares/{id}/access_log/`
- **Description**: Get access log for share (last 50)
- **Auth**: Required
- **Response**: List of access log entries

---

## Access Logs (Audit Trail)

### 37. List Access Logs
**GET** `/api/documents/access-logs/`
- **Description**: Get all access logs
- **Auth**: Required
- **Query Params**:
  - `document` - Filter by document ID
  - `user` - Filter by user ID
  - `action` - Filter by action (viewed, downloaded, shared, etc.)
  - `ordering` - Order by accessed_at

### 38. Get Access Log
**GET** `/api/documents/access-logs/{id}/`
- **Description**: Get access log details
- **Auth**: Required

---

## Document Signatures

### 39. List Signature Requests
**GET** `/api/documents/signatures/`
- **Description**: Get all signature requests
- **Auth**: Required
- **Query Params**:
  - `document` - Filter by document ID
  - `status` - Filter by status (pending, signed, declined, expired)
  - `requested_by` - Filter by requester
  - `ordering` - Order by request_sent_at, signed_at

### 40. Create Signature Request
**POST** `/api/documents/signatures/`
- **Description**: Create a signature request
- **Auth**: Required
- **Body**: Same as document request_signature action

### 41. Get Signature Request
**GET** `/api/documents/signatures/{id}/`
- **Description**: Get signature request details
- **Auth**: Required

### 42. Update Signature Request
**PUT/PATCH** `/api/documents/signatures/{id}/`
- **Description**: Update signature request
- **Auth**: Required

### 43. Delete Signature Request
**DELETE** `/api/documents/signatures/{id}/`
- **Description**: Delete signature request
- **Auth**: Required

### 44. Access Signature Request (PUBLIC)
**GET** `/api/documents/signatures/{token}/`
- **Description**: Public endpoint to view signature request
- **Auth**: Not required
- **Response**: Signature request details and document
- **Notes**: 
  - Returns error if expired or already signed/declined
  - Shows requester info and document to be signed

### 45. Submit Signature (PUBLIC)
**POST** `/api/documents/signatures/{token}/sign/`
- **Description**: Public endpoint to submit signature
- **Auth**: Not required
- **Body**:
  ```json
  {
    "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
  ```
- **Response**: Confirmation message
- **Notes**: Signature data should be Base64-encoded data URL

### 46. Decline Signature (PUBLIC)
**POST** `/api/documents/signatures/{token}/decline/`
- **Description**: Public endpoint to decline signature
- **Auth**: Not required
- **Body**:
  ```json
  {
    "reason": "Cannot review at this time"
  }
  ```
- **Response**: Confirmation message

---

## File Upload Requirements

### Supported File Types
- **PDF**: application/pdf
- **Images**: image/jpeg, image/png, image/gif
- **Word**: application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document
- **Excel**: application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

### File Size Limit
- Maximum: 50 MB per file

### Automatic Features
- **Auto-numbering**: DOC-YYYY-MM-0001 format
- **Thumbnail generation**: Automatic for images (300x300)
- **Version tracking**: Full history maintained
- **Access logging**: All actions logged with IP and user agent

---

## Response Codes

- **200 OK**: Successful GET/PUT/PATCH request
- **201 Created**: Successful POST request
- **204 No Content**: Successful DELETE request
- **400 Bad Request**: Invalid input data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **410 Gone**: Share link or signature request expired

---

## Notes

### Public Endpoints (No Authentication Required)
- Access shared document by token
- Verify share access code
- View signature request by token
- Submit signature
- Decline signature

### Authentication Required for All Other Endpoints
Use Bearer token in Authorization header:
```
Authorization: Bearer <token>
```

### Pagination
List endpoints support pagination with query params:
- `page` - Page number
- `page_size` - Items per page (default: varies by endpoint)

### File Storage
- Files stored in: `media/documents/YYYY/MM/DD/`
- Thumbnails in: `media/documents/thumbnails/YYYY/MM/DD/`
- Organized by upload date for easy management

---

## Summary

**Total Endpoints**: 46
- **Category Endpoints**: 6
- **Document Endpoints**: 19
- **Version Endpoints**: 3
- **Share Endpoints**: 8
- **Access Log Endpoints**: 2
- **Signature Endpoints**: 8

**Public Endpoints**: 5
**Authenticated Endpoints**: 41
