# Phase 9: Document Management Testing Guide

## Quick Start

### 1. Start Development Server
```bash
cd /home/handy/smart_vehicle_repairs_system
python3 manage.py runserver
```

### 2. Access Points
- **Admin Interface**: http://localhost:8000/admin/
- **API Root**: http://localhost:8000/api/documents/
- **Swagger Docs**: http://localhost:8000/api/docs/
- **ReDoc**: http://localhost:8000/api/redoc/

---

## Testing Checklist

### ✅ Admin Interface Testing

#### 1. Document Categories
- [ ] Navigate to Documents > Document categories
- [ ] Create a new category (e.g., "Work Order Documents")
- [ ] Set parent category to create hierarchy
- [ ] Add icon class (e.g., "fa-wrench")
- [ ] Verify category appears in tree structure

#### 2. Documents
- [ ] Navigate to Documents > Documents
- [ ] Click "Add document"
- [ ] Upload a file (PDF, image, etc.)
- [ ] Fill in title and description
- [ ] Select category
- [ ] Add tags (comma-separated)
- [ ] Link to customer/vehicle/work order if available
- [ ] Save and verify document number (DOC-YYYY-MM-0001)
- [ ] Check if thumbnail was generated (for images)
- [ ] View document in list with file type badge

#### 3. Document Versions
- [ ] Open an existing document
- [ ] Look for "Document versions" inline section
- [ ] Verify version 1 exists
- [ ] Note: Upload new versions via API

#### 4. Document Shares
- [ ] Open an existing document
- [ ] Look for "Document shares" inline section
- [ ] Note: Create shares via API for full functionality

#### 5. Document Signatures
- [ ] Open an existing document
- [ ] Look for "Document signatures" inline section
- [ ] Note: Create signature requests via API

#### 6. Access Logs
- [ ] Navigate to Documents > Document accesses
- [ ] Verify your document views are logged
- [ ] Check IP address and user agent captured

---

### 🔌 API Testing with cURL

#### Setup: Get Authentication Token
```bash
# Login to get token (adjust credentials)
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Save the token
export TOKEN="your_token_here"
```

#### Test 1: List Document Categories
```bash
curl -X GET http://localhost:8000/api/documents/categories/ \
  -H "Authorization: Bearer $TOKEN"
```

#### Test 2: Get Category Tree
```bash
curl -X GET http://localhost:8000/api/documents/categories/tree/ \
  -H "Authorization: Bearer $TOKEN"
```

#### Test 3: Create Document Category
```bash
curl -X POST http://localhost:8000/api/documents/categories/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Category",
    "slug": "test-category",
    "description": "Testing category creation",
    "is_active": true,
    "display_order": 1
  }'
```

#### Test 4: Upload Document
```bash
# Create a test file first
echo "Test document content" > test.txt

curl -X POST http://localhost:8000/api/documents/documents/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.txt" \
  -F "title=Test Document" \
  -F "description=Testing document upload" \
  -F "tags=test,upload"
```

#### Test 5: List Documents
```bash
curl -X GET http://localhost:8000/api/documents/documents/ \
  -H "Authorization: Bearer $TOKEN"
```

#### Test 6: Get Document Details (replace {id})
```bash
curl -X GET http://localhost:8000/api/documents/documents/{id}/ \
  -H "Authorization: Bearer $TOKEN"
```

#### Test 7: Download Document (replace {id})
```bash
curl -X GET http://localhost:8000/api/documents/documents/{id}/download/ \
  -H "Authorization: Bearer $TOKEN" \
  --output downloaded_file.txt
```

#### Test 8: Upload New Version (replace {id})
```bash
echo "Updated content v2" > test_v2.txt

curl -X POST http://localhost:8000/api/documents/documents/{id}/upload_version/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_v2.txt" \
  -F "changes_description=Updated content for version 2"
```

#### Test 9: List Document Versions (replace {id})
```bash
curl -X GET http://localhost:8000/api/documents/documents/{id}/versions/ \
  -H "Authorization: Bearer $TOKEN"
```

#### Test 10: Create Share Link (replace {id})
```bash
curl -X POST http://localhost:8000/api/documents/documents/{id}/share/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shared_with_email": "test@example.com",
    "expires_in_days": 7,
    "max_views": 10
  }'

# Save the share_token from response
export SHARE_TOKEN="token_from_response"
```

#### Test 11: Access Shared Document (PUBLIC - No Auth)
```bash
curl -X GET http://localhost:8000/api/documents/shares/$SHARE_TOKEN/
```

#### Test 12: Request Signature (replace {id})
```bash
curl -X POST http://localhost:8000/api/documents/documents/{id}/request_signature/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "signer_name": "John Doe",
    "signer_email": "john@example.com",
    "expires_in_days": 7,
    "notes": "Please review and sign this document"
  }'

# Save the request_token from response
export SIG_TOKEN="token_from_response"
```

#### Test 13: View Signature Request (PUBLIC - No Auth)
```bash
curl -X GET http://localhost:8000/api/documents/signatures/$SIG_TOKEN/
```

#### Test 14: Submit Signature (PUBLIC - No Auth)
```bash
curl -X POST http://localhost:8000/api/documents/signatures/$SIG_TOKEN/sign/ \
  -H "Content-Type: application/json" \
  -d '{
    "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  }'
```

#### Test 15: Search Documents
```bash
curl -X GET "http://localhost:8000/api/documents/documents/search/?query=test&status=active" \
  -H "Authorization: Bearer $TOKEN"
```

#### Test 16: Get Statistics
```bash
curl -X GET http://localhost:8000/api/documents/documents/stats/ \
  -H "Authorization: Bearer $TOKEN"
```

#### Test 17: Get Access Logs (replace {id})
```bash
curl -X GET http://localhost:8000/api/documents/documents/{id}/access_logs/ \
  -H "Authorization: Bearer $TOKEN"
```

---

### 🌐 Browser Testing (Swagger UI)

1. **Open Swagger UI**: http://localhost:8000/api/docs/

2. **Authorize**:
   - Click "Authorize" button (top right)
   - Enter: `Bearer your_token_here`
   - Click "Authorize"

3. **Test Endpoints**:
   - Expand any endpoint
   - Click "Try it out"
   - Fill in parameters
   - Click "Execute"
   - View response

4. **Test File Upload**:
   - Navigate to `POST /api/documents/documents/`
   - Click "Try it out"
   - Click "Choose File" for `file` parameter
   - Fill in required fields (title)
   - Click "Execute"

5. **Test Public Endpoints** (No Auth Required):
   - Share access: `GET /api/documents/shares/{token}/`
   - Signature view: `GET /api/documents/signatures/{token}/`
   - Submit signature: `POST /api/documents/signatures/{token}/sign/`

---

## Feature Testing Scenarios

### Scenario 1: Document Lifecycle
1. Upload document
2. View document (check access log)
3. Download document (check access log)
4. Upload new version
5. View version history
6. Restore old version
7. Check version count

### Scenario 2: Sharing Workflow
1. Upload document
2. Create share link with expiration
3. Copy share token
4. Access share link (public, no auth)
5. Download from share
6. Check view count increment
7. Verify expiration after max views

### Scenario 3: Sharing with Access Code
1. Create share with access_code
2. Try to access without code (should require code)
3. Verify with correct code
4. Access document

### Scenario 4: Signature Workflow
1. Upload document
2. Request signature
3. Copy signature token
4. Access signature page (public)
5. Submit signature with Base64 data
6. Verify signature status changed to "signed"
7. Check IP and user agent logged

### Scenario 5: Document Organization
1. Create category hierarchy:
   - Root: "Customer Documents"
   - Child: "Work Orders"
   - Child: "Invoices"
2. Upload documents to each category
3. View category tree
4. Filter documents by category

### Scenario 6: Search & Filter
1. Upload documents with various tags
2. Search by keyword
3. Filter by category
4. Filter by date range
5. Filter by tags
6. Combine multiple filters

### Scenario 7: Access Audit
1. Perform various actions (view, download, share)
2. Check access logs
3. Verify all actions logged
4. Check anonymous access from share links
5. Verify IP addresses captured

---

## Performance Testing

### Test Large File Upload
```bash
# Create a 40MB test file
dd if=/dev/zero of=large_test.bin bs=1M count=40

# Upload it
curl -X POST http://localhost:8000/api/documents/documents/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@large_test.bin" \
  -F "title=Large File Test"
```

### Test File Size Limit (Should Fail)
```bash
# Create a 60MB test file (over 50MB limit)
dd if=/dev/zero of=too_large.bin bs=1M count=60

# Try to upload (should get 400 error)
curl -X POST http://localhost:8000/api/documents/documents/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@too_large.bin" \
  -F "title=Should Fail"
```

### Test Concurrent Uploads
```bash
# Upload multiple files in parallel
for i in {1..5}; do
  echo "File content $i" > test_$i.txt
  curl -X POST http://localhost:8000/api/documents/documents/ \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@test_$i.txt" \
    -F "title=Concurrent Test $i" &
done
wait
```

---

## Error Handling Tests

### Test Invalid File Type
```bash
# Create an executable file (not in whitelist)
echo "#!/bin/bash" > test.sh

curl -X POST http://localhost:8000/api/documents/documents/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.sh" \
  -F "title=Should Fail"
# Expected: 400 Bad Request
```

### Test Expired Share Link
1. Create share with `expires_in_days: 0.001` (very short)
2. Wait a few minutes
3. Try to access share
4. Expected: 410 Gone

### Test Expired Signature Request
1. Create signature request with `expires_in_days: 0.001`
2. Wait a few minutes
3. Try to submit signature
4. Expected: 410 Gone

### Test Missing Required Fields
```bash
curl -X POST http://localhost:8000/api/documents/documents/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.txt"
# Missing title - Expected: 400 Bad Request
```

---

## Integration Testing

### Test with Work Order
1. Create work order (if exists in system)
2. Upload document linked to work order
3. Get documents by work order:
   ```bash
   curl -X GET "http://localhost:8000/api/documents/documents/by_work_order/?work_order_id=1" \
     -H "Authorization: Bearer $TOKEN"
   ```

### Test with Customer
1. Create customer (if exists)
2. Upload document linked to customer
3. Get documents by customer:
   ```bash
   curl -X GET "http://localhost:8000/api/documents/documents/by_customer/?customer_id=1" \
     -H "Authorization: Bearer $TOKEN"
   ```

### Test with Vehicle
1. Create vehicle (if exists)
2. Upload document linked to vehicle
3. Get documents by vehicle:
   ```bash
   curl -X GET "http://localhost:8000/api/documents/documents/by_vehicle/?vehicle_id=1" \
     -H "Authorization: Bearer $TOKEN"
   ```

---

## Database Verification

### Check Document Numbers
```bash
python3 manage.py shell
```
```python
from apps.documents.models import Document
docs = Document.objects.all()
for doc in docs:
    print(f"{doc.document_number} - {doc.title}")
```

### Check Thumbnails Generated
```python
from apps.documents.models import Document
images = Document.objects.filter(file_type__startswith='image/')
for img in images:
    print(f"{img.title}: Thumbnail = {bool(img.thumbnail)}")
```

### Check Version Tracking
```python
from apps.documents.models import Document
doc = Document.objects.first()
print(f"Current version: {doc.version_number}")
print(f"Version history: {doc.versions.count()} versions")
for v in doc.versions.all():
    print(f"  v{v.version_number}: {v.uploaded_at}")
```

### Check Access Logs
```python
from apps.documents.models import DocumentAccess
logs = DocumentAccess.objects.all()[:10]
for log in logs:
    print(f"{log.accessed_at}: {log.user or 'Anonymous'} - {log.action} - {log.document.title}")
```

---

## Success Criteria

### ✅ All Tests Pass If:
- [ ] Files upload successfully (various types)
- [ ] Document numbers auto-generated correctly
- [ ] Thumbnails created for images
- [ ] Versions tracked properly
- [ ] Share links work (public access)
- [ ] Share expiration enforced
- [ ] Access codes work
- [ ] Signature requests created
- [ ] Signatures submitted successfully
- [ ] All actions logged in access logs
- [ ] Search returns correct results
- [ ] Statistics accurate
- [ ] File size limit enforced (50MB)
- [ ] Invalid file types rejected
- [ ] Admin interface displays all data correctly
- [ ] API documentation loads in Swagger

---

## Troubleshooting

### Issue: File upload fails
- Check file size (max 50MB)
- Check file type (must be in whitelist)
- Check `MEDIA_ROOT` directory exists and is writable
- Check authentication token is valid

### Issue: Thumbnail not generated
- Verify Pillow is installed: `pip show Pillow`
- Check file is actually an image (JPEG, PNG, GIF)
- Check `MEDIA_ROOT/documents/thumbnails/` directory permissions

### Issue: Share link doesn't work
- Verify token is correct (64 characters)
- Check expiration date hasn't passed
- Check `is_active` is True
- Check view count hasn't exceeded `max_views`

### Issue: Signature submission fails
- Verify signature_data is Base64 data URL format
- Should start with: `data:image/png;base64,`
- Check signature request hasn't expired
- Check status is still "pending"

### Issue: Access logs not created
- Check database migrations applied
- Verify `log_document_access()` function called in views
- Check user permissions

---

## Next Steps After Testing

1. **If all tests pass**: Mark Phase 9 as complete ✅
2. **If issues found**: Debug and fix issues
3. **Enhancement ideas**:
   - Add email notifications for shares/signatures
   - Implement role-based permissions
   - Add document templates
   - Add OCR for scanned documents
   - Add document preview generation (PDF thumbnails)
   - Add bulk upload
   - Add document comparison/diff

---

## Support

For issues or questions:
1. Check Django logs for errors
2. Review API error responses (usually have helpful messages)
3. Check database for data integrity
4. Verify all migrations applied: `python3 manage.py showmigrations documents`
