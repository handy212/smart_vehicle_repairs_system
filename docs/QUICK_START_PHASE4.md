# Phase 4: Inventory Management - Quick Start Guide

Complete testing guide for Phase 4: Inventory Management API

**Server:** http://localhost:8080/  
**Base API:** `/api/inventory/`

---

## 🔐 Authentication

All requests require JWT authentication. Get your token first:

```bash
# Get JWT token
curl -X POST http://localhost:8080/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@admin.com",
    "password": "danewcash54899"
  }'

# Response:
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}

# Use the access token in all subsequent requests:
# -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Token expires in 60 minutes.** Refresh using:
```bash
curl -X POST http://localhost:8080/api/auth/token/refresh/ \
  -H "Content-Type: application/json" \
  -d '{"refresh": "YOUR_REFRESH_TOKEN"}'
```

---

## 📦 Part Categories

### Create Root Categories

```bash
# Create "Engine" category
curl -X POST http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engine",
    "description": "Engine components and parts",
    "is_active": true
  }'

# Create "Brakes" category
curl -X POST http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Brakes",
    "description": "Brake system components",
    "is_active": true
  }'

# Create "Electrical" category
curl -X POST http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Electrical",
    "description": "Electrical system parts",
    "is_active": true
  }'

# Create "Filters" category
curl -X POST http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Filters",
    "description": "Oil, air, and fuel filters",
    "is_active": true
  }'

# Create "Fluids" category
curl -X POST http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fluids",
    "description": "Motor oil, coolant, brake fluid, etc.",
    "is_active": true
  }'
```

### Create Subcategories

```bash
# Create "Cooling System" subcategory under "Engine" (assuming Engine has id=1)
curl -X POST http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cooling System",
    "description": "Radiators, thermostats, water pumps",
    "parent": 1,
    "is_active": true
  }'

# Create "Ignition" subcategory under "Engine"
curl -X POST http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ignition",
    "description": "Spark plugs, coils, ignition wires",
    "parent": 1,
    "is_active": true
  }'

# Create "Brake Pads" subcategory under "Brakes" (assuming Brakes has id=2)
curl -X POST http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Brake Pads",
    "description": "Disc brake pads for all vehicle types",
    "parent": 2,
    "is_active": true
  }'
```

### List Categories

```bash
# Get all categories
curl http://localhost:8080/api/inventory/categories/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get only root categories (no parent)
curl http://localhost:8080/api/inventory/categories/root_categories/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get subcategories of a category (e.g., Engine with id=1)
curl http://localhost:8080/api/inventory/categories/1/subcategories/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter active categories
curl "http://localhost:8080/api/inventory/categories/?is_active=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search categories
curl "http://localhost:8080/api/inventory/categories/?search=engine" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🏭 Suppliers

### Create Suppliers

```bash
# Create manufacturer supplier
curl -X POST http://localhost:8080/api/inventory/suppliers/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ACDelco Manufacturing",
    "supplier_type": "manufacturer",
    "contact_person": "John Smith",
    "email": "sales@acdelco.com",
    "phone": "1-800-555-0100",
    "website": "https://www.acdelco.com",
    "address_line1": "123 Auto Parts Blvd",
    "city": "Detroit",
    "state": "MI",
    "postal_code": "48201",
    "country": "USA",
    "payment_terms": "Net 30",
    "credit_limit": "50000.00",
    "is_active": true,
    "is_preferred": true,
    "notes": "Primary OEM parts supplier"
  }'

# Create distributor supplier
curl -X POST http://localhost:8080/api/inventory/suppliers/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "National Auto Parts Distributors",
    "supplier_type": "distributor",
    "contact_person": "Sarah Johnson",
    "email": "orders@napd.com",
    "phone": "1-888-555-0200",
    "website": "https://www.napd.com",
    "address_line1": "456 Distribution Way",
    "city": "Chicago",
    "state": "IL",
    "postal_code": "60601",
    "country": "USA",
    "payment_terms": "Net 15",
    "credit_limit": "25000.00",
    "is_active": true,
    "is_preferred": false,
    "notes": "Fast delivery, good prices"
  }'

# Create local wholesaler
curl -X POST http://localhost:8080/api/inventory/suppliers/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "City Auto Wholesale",
    "supplier_type": "wholesaler",
    "contact_person": "Mike Brown",
    "email": "mike@cityautowholesale.com",
    "phone": "555-0150",
    "address_line1": "789 Warehouse Dr",
    "city": "Local City",
    "state": "CA",
    "postal_code": "90001",
    "country": "USA",
    "payment_terms": "Net 7",
    "credit_limit": "10000.00",
    "is_active": true,
    "is_preferred": false,
    "notes": "Local pickup available"
  }'
```

### List Suppliers

```bash
# Get all suppliers
curl http://localhost:8080/api/inventory/suppliers/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get preferred suppliers only
curl http://localhost:8080/api/inventory/suppliers/preferred/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by type
curl "http://localhost:8080/api/inventory/suppliers/?supplier_type=manufacturer" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter active suppliers
curl "http://localhost:8080/api/inventory/suppliers/?is_active=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search suppliers
curl "http://localhost:8080/api/inventory/suppliers/?search=acdelco" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Activate/Deactivate Supplier

```bash
# Deactivate supplier (id=2)
curl -X POST http://localhost:8080/api/inventory/suppliers/2/deactivate/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Activate supplier (id=2)
curl -X POST http://localhost:8080/api/inventory/suppliers/2/activate/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔧 Parts

### Create Parts

```bash
# Create oil filter (with markup calculation)
curl -X POST http://localhost:8080/api/inventory/parts/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": "OF-12345",
    "name": "Premium Oil Filter",
    "description": "High-performance synthetic oil filter",
    "category": 4,
    "manufacturer": "ACDelco",
    "manufacturer_part_number": "PF52",
    "quantity_in_stock": 45,
    "reorder_point": 20,
    "reorder_quantity": 50,
    "minimum_stock": 10,
    "maximum_stock": 100,
    "unit": "piece",
    "cost_price": "8.50",
    "markup_percentage": "50",
    "list_price": "15.99",
    "bin_location": "A-12-3",
    "shelf": "Top",
    "compatible_makes": "Toyota, Honda, Nissan",
    "compatible_models": "Camry, Accord, Altima",
    "compatible_years": "2015-2024",
    "warranty_months": 12,
    "is_active": true,
    "is_taxable": true,
    "preferred_supplier": 1,
    "suppliers": [1, 2]
  }'

# Create brake pads (low stock example)
curl -X POST http://localhost:8080/api/inventory/parts/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": "BP-67890",
    "name": "Ceramic Brake Pads - Front",
    "description": "Premium ceramic brake pads for front axle",
    "category": 8,
    "manufacturer": "Brembo",
    "manufacturer_part_number": "P85020",
    "quantity_in_stock": 8,
    "reorder_point": 10,
    "reorder_quantity": 24,
    "minimum_stock": 6,
    "maximum_stock": 48,
    "unit": "set",
    "cost_price": "45.00",
    "markup_percentage": "60",
    "list_price": "89.99",
    "bin_location": "B-05-2",
    "shelf": "Middle",
    "weight": "2.5",
    "compatible_makes": "Ford, Chevrolet",
    "compatible_models": "F-150, Silverado",
    "compatible_years": "2018-2024",
    "warranty_months": 24,
    "is_active": true,
    "is_taxable": true,
    "preferred_supplier": 1,
    "suppliers": [1, 2, 3]
  }'

# Create spark plugs (out of stock example)
curl -X POST http://localhost:8080/api/inventory/parts/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": "SP-11111",
    "name": "Iridium Spark Plugs (4-pack)",
    "description": "Long-life iridium spark plugs",
    "category": 7,
    "manufacturer": "NGK",
    "manufacturer_part_number": "IFR6T11",
    "quantity_in_stock": 0,
    "reorder_point": 12,
    "reorder_quantity": 48,
    "minimum_stock": 8,
    "maximum_stock": 96,
    "unit": "set",
    "cost_price": "32.00",
    "selling_price": "54.99",
    "list_price": "64.99",
    "bin_location": "C-08-1",
    "compatible_makes": "Toyota, Lexus",
    "compatible_models": "Camry, ES350",
    "compatible_years": "2020-2024",
    "warranty_months": 36,
    "is_active": true,
    "is_taxable": true,
    "preferred_supplier": 1,
    "suppliers": [1, 2]
  }'

# Create motor oil (fluid example)
curl -X POST http://localhost:8080/api/inventory/parts/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": "OIL-5W30-SYN",
    "name": "5W-30 Full Synthetic Motor Oil",
    "description": "Premium full synthetic engine oil",
    "category": 5,
    "manufacturer": "Mobil 1",
    "manufacturer_part_number": "120766",
    "quantity_in_stock": 120,
    "reorder_point": 50,
    "reorder_quantity": 100,
    "minimum_stock": 30,
    "maximum_stock": 200,
    "unit": "quart",
    "cost_price": "6.25",
    "markup_percentage": "45",
    "list_price": "11.99",
    "bin_location": "D-01-1",
    "shelf": "Floor",
    "weight": "2.0",
    "warranty_months": 0,
    "is_active": true,
    "is_taxable": true,
    "preferred_supplier": 2,
    "suppliers": [2, 3]
  }'

# Create air filter
curl -X POST http://localhost:8080/api/inventory/parts/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": "AF-99999",
    "name": "Engine Air Filter",
    "description": "High-flow engine air filter",
    "category": 4,
    "manufacturer": "K&N",
    "manufacturer_part_number": "33-2304",
    "quantity_in_stock": 28,
    "reorder_point": 15,
    "reorder_quantity": 30,
    "minimum_stock": 10,
    "maximum_stock": 60,
    "unit": "piece",
    "cost_price": "22.50",
    "markup_percentage": "55",
    "list_price": "44.99",
    "bin_location": "A-15-2",
    "compatible_makes": "Toyota, Honda, Nissan, Ford",
    "compatible_models": "Various",
    "compatible_years": "2010-2024",
    "warranty_months": 12,
    "is_active": true,
    "is_taxable": true,
    "preferred_supplier": 1,
    "suppliers": [1, 2, 3]
  }'
```

### List Parts

```bash
# Get all parts (paginated)
curl http://localhost:8080/api/inventory/parts/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by category
curl "http://localhost:8080/api/inventory/parts/?category=4" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter active parts only
curl "http://localhost:8080/api/inventory/parts/?is_active=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by manufacturer
curl "http://localhost:8080/api/inventory/parts/?manufacturer=ACDelco" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search parts
curl "http://localhost:8080/api/inventory/parts/?search=oil" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search by part number
curl "http://localhost:8080/api/inventory/parts/?search=BP-67890" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Order by stock level (ascending - lowest first)
curl "http://localhost:8080/api/inventory/parts/?ordering=quantity_in_stock" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Order by price (descending - highest first)
curl "http://localhost:8080/api/inventory/parts/?ordering=-selling_price" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Stock Status Queries

```bash
# Get LOW STOCK parts (quantity <= reorder_point)
curl http://localhost:8080/api/inventory/parts/low_stock/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get OUT OF STOCK parts (quantity = 0)
curl http://localhost:8080/api/inventory/parts/out_of_stock/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get parts that NEED REORDER (low but not zero)
curl http://localhost:8080/api/inventory/parts/needs_reorder/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Alternative: Use query parameter filters
curl "http://localhost:8080/api/inventory/parts/?low_stock=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

curl "http://localhost:8080/api/inventory/parts/?out_of_stock=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

curl "http://localhost:8080/api/inventory/parts/?needs_reorder=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Stock Adjustments

```bash
# Manual stock adjustment - ADD quantity (part id=1)
curl -X POST http://localhost:8080/api/inventory/parts/1/adjust_stock/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 25,
    "reason": "Physical inventory count adjustment",
    "notes": "Found additional units during monthly count"
  }'

# Manual stock adjustment - REMOVE quantity (negative number)
curl -X POST http://localhost:8080/api/inventory/parts/2/adjust_stock/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": -3,
    "reason": "Damaged inventory",
    "notes": "3 units damaged during receiving, cannot be sold"
  }'

# Response example:
{
  "message": "Stock adjusted successfully",
  "part_id": 1,
  "part_number": "OF-12345",
  "old_quantity": 45,
  "adjustment": 25,
  "new_quantity": 70,
  "transaction_id": 15
}
```

### Stock Reservations (for Work Orders)

```bash
# Reserve parts for work order (part id=1)
curl -X POST http://localhost:8080/api/inventory/parts/1/reserve/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 5
  }'

# Response:
{
  "message": "Parts reserved successfully",
  "part_id": 1,
  "part_number": "OF-12345",
  "reserved": 5,
  "total_reserved": 5,
  "available": 40
}

# Release reservation
curl -X POST http://localhost:8080/api/inventory/parts/1/release_reservation/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 5
  }'
```

### Transaction History

```bash
# Get transaction history for a part (id=1)
curl http://localhost:8080/api/inventory/parts/1/transaction_history/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response shows last 50 transactions:
{
  "part_id": 1,
  "part_number": "OF-12345",
  "transactions": [
    {
      "id": 15,
      "transaction_type": "adjustment",
      "quantity": 25,
      "balance_after": 70,
      "unit_cost": "8.50",
      "total_cost": "212.50",
      "reason": "Physical inventory count adjustment",
      "notes": "Found additional units during monthly count",
      "transaction_date": "2025-10-02T14:30:00Z",
      "created_by": "Admin User"
    }
  ]
}
```

### Reports

```bash
# Low Stock Report (comprehensive)
curl http://localhost:8080/api/inventory/parts/low_stock_report/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response includes all low stock parts with details:
[
  {
    "part_id": 2,
    "part_number": "BP-67890",
    "part_name": "Ceramic Brake Pads - Front",
    "category_name": "Brake Pads",
    "quantity_in_stock": 8,
    "reorder_point": 10,
    "reorder_quantity": 24,
    "needs_reorder": true,
    "preferred_supplier_name": "ACDelco Manufacturing"
  },
  {
    "part_id": 3,
    "part_number": "SP-11111",
    "part_name": "Iridium Spark Plugs (4-pack)",
    "category_name": "Ignition",
    "quantity_in_stock": 0,
    "reorder_point": 12,
    "reorder_quantity": 48,
    "needs_reorder": false,
    "preferred_supplier_name": "ACDelco Manufacturing"
  }
]

# Inventory Value Report
curl http://localhost:8080/api/inventory/parts/inventory_value/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "total_parts": 5,
  "total_quantity": 201,
  "total_value": "2847.50",
  "by_category": [
    {
      "category_name": "Filters",
      "parts_count": 2,
      "total_quantity": 73,
      "total_value": "1013.00"
    },
    {
      "category_name": "Brakes",
      "parts_count": 1,
      "total_quantity": 8,
      "total_value": "360.00"
    },
    {
      "category_name": "Fluids",
      "parts_count": 1,
      "total_quantity": 120,
      "total_value": "750.00"
    }
  ]
}
```

---

## 📋 Purchase Orders

### Create Purchase Order

```bash
# Create PO with multiple items
curl -X POST http://localhost:8080/api/inventory/purchase-orders/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "supplier": 1,
    "order_date": "2025-10-02",
    "expected_delivery_date": "2025-10-09",
    "shipping_cost": "25.00",
    "tax_amount": "15.60",
    "notes": "Rush order - need by Friday",
    "items": [
      {
        "part": 3,
        "quantity": 48,
        "unit_cost": "32.00"
      },
      {
        "part": 2,
        "quantity": 24,
        "unit_cost": "45.00"
      }
    ]
  }'

# Response includes auto-generated PO number:
{
  "id": 1,
  "po_number": "PO000001",
  "supplier": {
    "id": 1,
    "name": "ACDelco Manufacturing",
    "supplier_code": "SUPP000001"
  },
  "status": "draft",
  "order_date": "2025-10-02",
  "expected_delivery_date": "2025-10-09",
  "subtotal": "2616.00",
  "tax_amount": "15.60",
  "shipping_cost": "25.00",
  "total": "2656.60",
  "items": [
    {
      "id": 1,
      "part": 3,
      "part_number": "SP-11111",
      "part_name": "Iridium Spark Plugs (4-pack)",
      "quantity": 48,
      "quantity_received": 0,
      "unit_cost": "32.00",
      "total": "1536.00",
      "is_fully_received": false,
      "remaining_quantity": 48
    },
    {
      "id": 2,
      "part": 2,
      "part_number": "BP-67890",
      "part_name": "Ceramic Brake Pads - Front",
      "quantity": 24,
      "quantity_received": 0,
      "unit_cost": "45.00",
      "total": "1080.00",
      "is_fully_received": false,
      "remaining_quantity": 24
    }
  ]
}
```

### List Purchase Orders

```bash
# Get all purchase orders
curl http://localhost:8080/api/inventory/purchase-orders/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by status
curl "http://localhost:8080/api/inventory/purchase-orders/?status=draft" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by supplier
curl "http://localhost:8080/api/inventory/purchase-orders/?supplier=1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get pending POs (submitted or confirmed)
curl http://localhost:8080/api/inventory/purchase-orders/pending/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get overdue POs
curl http://localhost:8080/api/inventory/purchase-orders/overdue/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search POs
curl "http://localhost:8080/api/inventory/purchase-orders/?search=PO000001" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Order by date
curl "http://localhost:8080/api/inventory/purchase-orders/?ordering=-order_date" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Purchase Order Workflow

```bash
# 1. SUBMIT PO to supplier (draft → submitted)
curl -X POST http://localhost:8080/api/inventory/purchase-orders/1/submit/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "message": "Purchase order submitted successfully",
  "po_number": "PO000001",
  "status": "submitted",
  "submitted_by": "Admin User",
  "submitted_at": "2025-10-02T10:15:00Z"
}

# 2. CONFIRM PO from supplier (submitted → confirmed)
curl -X POST http://localhost:8080/api/inventory/purchase-orders/1/confirm/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "message": "Purchase order confirmed successfully",
  "po_number": "PO000001",
  "status": "confirmed"
}

# 3. CANCEL PO (if needed, before receiving)
curl -X POST http://localhost:8080/api/inventory/purchase-orders/1/cancel/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "message": "Purchase order cancelled successfully",
  "po_number": "PO000001",
  "status": "cancelled"
}
```

### Add Item to Draft PO

```bash
# Add item to existing draft PO (id=1)
curl -X POST http://localhost:8080/api/inventory/purchase-orders/1/add_item/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part": 4,
    "quantity": 100,
    "unit_cost": "6.25",
    "notes": "Additional item for customer request"
  }'

# Response:
{
  "message": "Item added successfully",
  "po_number": "PO000001",
  "item": {
    "id": 3,
    "part": 4,
    "part_number": "OIL-5W30-SYN",
    "quantity": 100,
    "unit_cost": "6.25",
    "total": "625.00"
  },
  "new_po_total": "3281.60"
}
```

---

## 📦 Receiving Purchase Orders

### Receive Items (Full Receipt)

```bash
# Receive FULL quantity for item (item id=1, ordered 48, receiving 48)
curl -X POST http://localhost:8080/api/inventory/po-items/1/receive/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity_received": 48,
    "notes": "All items received in good condition"
  }'

# Response:
{
  "message": "Items received successfully",
  "status": "success",
  "item_id": 1,
  "part_number": "SP-11111",
  "quantity_received": 48,
  "total_received": 48,
  "remaining": 0,
  "is_fully_received": true,
  "transaction_id": 20
}

# Effects:
# - item.quantity_received updated to 48
# - InventoryTransaction created (type=purchase, quantity=+48)
# - part.quantity_in_stock increased by 48 (0 → 48)
# - part.quantity_on_order decreased by 48
# - PO status updated to "partially_received" (if other items not received)
```

### Receive Items (Partial Receipt)

```bash
# Receive PARTIAL quantity for item (item id=2, ordered 24, receiving 12)
curl -X POST http://localhost:8080/api/inventory/po-items/2/receive/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity_received": 12,
    "notes": "First shipment - remaining 12 units to follow"
  }'

# Response:
{
  "message": "Items received successfully",
  "status": "success",
  "item_id": 2,
  "part_number": "BP-67890",
  "quantity_received": 12,
  "total_received": 12,
  "remaining": 12,
  "is_fully_received": false,
  "transaction_id": 21
}

# Effects:
# - item.quantity_received updated to 12
# - InventoryTransaction created (type=purchase, quantity=+12)
# - part.quantity_in_stock increased by 12 (8 → 20)
# - part.quantity_on_order decreased by 12
# - PO status stays "partially_received"

# Receive REMAINING quantity (item id=2, receiving remaining 12)
curl -X POST http://localhost:8080/api/inventory/po-items/2/receive/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity_received": 12,
    "notes": "Final shipment - order complete"
  }'

# Response:
{
  "message": "Items received successfully",
  "status": "success",
  "item_id": 2,
  "part_number": "BP-67890",
  "quantity_received": 12,
  "total_received": 24,
  "remaining": 0,
  "is_fully_received": true,
  "transaction_id": 22
}

# Effects:
# - item.quantity_received updated to 24 (12 + 12)
# - InventoryTransaction created (type=purchase, quantity=+12)
# - part.quantity_in_stock increased by 12 (20 → 32)
# - part.quantity_on_order decreased by 12
# - PO status updated to "received" (all items now fully received)
# - PO.received_date and PO.received_by set automatically
```

### Check PO Receipt Status

```bash
# Get PO details to see receipt status
curl http://localhost:8080/api/inventory/purchase-orders/1/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response shows receipt progress:
{
  "id": 1,
  "po_number": "PO000001",
  "status": "received",
  "total_items": 2,
  "total_quantity": 72,
  "received_quantity": 72,
  "is_fully_received": true,
  "is_partially_received": false,
  "received_date": "2025-10-02T15:45:00Z",
  "received_by": "Admin User",
  "items": [
    {
      "id": 1,
      "part_number": "SP-11111",
      "quantity": 48,
      "quantity_received": 48,
      "is_fully_received": true,
      "remaining_quantity": 0
    },
    {
      "id": 2,
      "part_number": "BP-67890",
      "quantity": 24,
      "quantity_received": 24,
      "is_fully_received": true,
      "remaining_quantity": 0
    }
  ]
}
```

---

## 📊 Inventory Transactions

### List All Transactions

```bash
# Get all transactions
curl http://localhost:8080/api/inventory/transactions/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get recent transactions (last 100)
curl http://localhost:8080/api/inventory/transactions/recent/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by transaction type
curl "http://localhost:8080/api/inventory/transactions/?transaction_type=purchase" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by part
curl "http://localhost:8080/api/inventory/transactions/?part=1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by purchase order
curl "http://localhost:8080/api/inventory/transactions/?purchase_order=1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get transactions by date range
curl "http://localhost:8080/api/inventory/transactions/by_date_range/?start_date=2025-10-01&end_date=2025-10-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Transaction Types

```
purchase      - Received from purchase order
sale          - Used in work order
adjustment    - Manual stock adjustment
return        - Returned to supplier
damage        - Damaged/lost inventory
transfer      - Transferred between locations
count         - Physical inventory count
```

---

## 🎨 Admin Interface

Access the Django admin at: http://localhost:8080/admin/

Login with:
- **Email:** admin@admin.com
- **Password:** danewcash54899

### Features:
- **Color-coded badges** for stock status and PO status
- **Inline editing** for PO items
- **Advanced filtering** by category, supplier, status
- **Search** across all models
- **Bulk actions** for common operations
- **Date hierarchy** for transactions
- **Filter horizontal** for M2M relationships (suppliers)

---

## 🔍 Common Workflows

### Workflow 1: Complete PO Cycle

```bash
# 1. Create PO
curl -X POST http://localhost:8080/api/inventory/purchase-orders/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "supplier": 1,
    "order_date": "2025-10-02",
    "expected_delivery_date": "2025-10-09",
    "items": [{"part": 3, "quantity": 48, "unit_cost": "32.00"}]
  }'

# 2. Submit to supplier
curl -X POST http://localhost:8080/api/inventory/purchase-orders/1/submit/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Confirm from supplier
curl -X POST http://localhost:8080/api/inventory/purchase-orders/1/confirm/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Receive items when they arrive
curl -X POST http://localhost:8080/api/inventory/po-items/1/receive/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity_received": 48, "notes": "All received"}'

# Done! Stock updated, transaction logged, PO marked as received
```

### Workflow 2: Stock Management

```bash
# 1. Check low stock parts
curl http://localhost:8080/api/inventory/parts/low_stock_report/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Create PO for low stock items
curl -X POST http://localhost:8080/api/inventory/purchase-orders/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "supplier": 1,
    "items": [{"part": 2, "quantity": 24, "unit_cost": "45.00"}]
  }'

# 3. Manual adjustment if needed
curl -X POST http://localhost:8080/api/inventory/parts/2/adjust_stock/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5, "reason": "Found in back room"}'

# 4. Check inventory value
curl http://localhost:8080/api/inventory/parts/inventory_value/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Workflow 3: Part Usage in Work Order

```bash
# 1. Reserve parts for work order
curl -X POST http://localhost:8080/api/inventory/parts/1/reserve/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 2}'

# 2. When work order complete, transaction is logged automatically
# (This happens in Phase 3 WorkOrder API)

# 3. View transaction history
curl http://localhost:8080/api/inventory/parts/1/transaction_history/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🚀 Next Steps

1. **Create sample data** using the examples above
2. **Test all workflows** (PO creation, receiving, stock adjustments)
3. **Explore admin interface** at http://localhost:8080/admin/
4. **Generate reports** (low stock, inventory value)
5. **Test integration with Phase 3** (work orders using parts)
6. **Move to Phase 5** (Billing & Payments)

---

## 📞 Support

For issues or questions:
- Check **PHASE4_COMPLETE.md** for detailed documentation
- Review **PROJECT_STATUS.md** for overall project status
- Check **ROADMAP.md** for upcoming features

---

**Generated:** October 2, 2025  
**Server:** http://localhost:8080/  
**Phase 4 Status:** ✅ COMPLETE AND OPERATIONAL
