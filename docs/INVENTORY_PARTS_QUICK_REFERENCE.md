# Inventory Parts - Quick Reference Guide

## 📋 Table of Contents
1. [Viewing Parts](#viewing-parts)
2. [Pagination](#pagination)
3. [Exporting Data](#exporting-data)
4. [Importing Data](#importing-data)
5. [Troubleshooting](#troubleshooting)

---

## 📊 Viewing Parts

### Table Columns
The parts list shows 9 essential columns:

| Column | Description |
|--------|-------------|
| **Image** | Product photo or default icon |
| **Part #** | Unique part number (clickable) |
| **Name** | Part name with description preview |
| **Category** | Part category badge |
| **Supplier** | Preferred supplier name |
| **In Stock** | Current quantity with unit |
| **Price** | Selling price |
| **Status** | Stock status badge |
| **Actions** | View, Edit, Delete buttons |

### Status Badges
- 🟢 **In Stock** - Normal stock level
- 🟡 **Low Stock** - Below reorder point
- 🔴 **Critical** - At or below minimum stock
- ⚫ **Out of Stock** - Zero quantity
- ⚪ **Inactive** - Part is disabled

### Filters
- **Search** - Part number, name, manufacturer, description
- **Category** - Filter by part category
- **Supplier** - Filter by supplier
- **Stock Level** - In Stock, Low, Out of Stock
- **Status** - Active Only (default), All Status, Inactive Only

---

## 📄 Pagination

### Per-Page Options
Choose how many parts to display:
- **20 per page** (default) - Faster loading
- **40 per page** - Fewer page changes

### Location
Bottom right of the table, next to page numbers.

### How It Works
1. Select desired items per page from dropdown
2. Page automatically refreshes
3. Resets to page 1
4. All filters are preserved

---

## 📤 Exporting Data

### CSV Export

**When to Use:**
- Need data in spreadsheet format
- Want to edit data in Excel
- Need all records (no limit)

**Steps:**
1. Apply any filters you want (optional)
2. Click "Export" dropdown
3. Select "Export CSV"
4. File downloads automatically
5. Open in Excel, Google Sheets, etc.

**Filename Format:** `parts_export_20251005_143045.csv`

**Columns Exported:**
- Part Number
- Name
- Category
- Supplier
- In Stock
- Unit
- Price
- Status

### PDF Export

**When to Use:**
- Need printable report
- Want formatted document
- Sharing with non-technical users

**Steps:**
1. Apply any filters you want (optional)
2. Click "Export" dropdown
3. Select "Export PDF"
4. File downloads automatically
5. Open in PDF viewer

**Filename Format:** `parts_export_20251005_143045.pdf`

**Notes:**
- Landscape orientation for readability
- Limited to first 100 items
- Includes export date in header

---

## 📥 Importing Data

### Supported Formats
- ✅ CSV (.csv)
- ✅ Excel (.xlsx, .xls)

### Step-by-Step Guide

#### 1. Download Template
1. Click "Import" button (green)
2. Click "Download CSV Template"
3. Save file: `parts_import_template.csv`

#### 2. Prepare Your Data
1. Open template in Excel or Google Sheets
2. Fill in your part data
3. Follow the format exactly

**Required Columns:**
- `part_number` - Unique identifier (e.g., "BRK-001")
- `name` - Part name (e.g., "Brake Pads")

**Optional Columns:**
- `description` - Detailed description
- `category` - Category name (auto-creates if new)
- `supplier` - Supplier name (auto-creates if new)
- `manufacturer` - Manufacturer name
- `manufacturer_part_number` - Mfg part number
- `quantity_in_stock` - Current quantity (number)
- `minimum_stock` - Min stock level (number)
- `reorder_point` - Reorder threshold (number)
- `reorder_quantity` - Order quantity (number)
- `cost_price` - Cost price (decimal, e.g., 12.50)
- `selling_price` - Selling price (decimal, e.g., 29.99)
- `bin_location` - Bin/location code (e.g., "A-12")
- `shelf` - Shelf location (e.g., "Shelf 3")
- `unit` - Unit type (unit, box, case, piece, set, etc.)
- `is_active` - Active status (true/false)

#### 3. Save Your File
- Save as CSV (.csv) or Excel (.xlsx)
- Make sure all data is properly formatted

#### 4. Upload File
1. Go to Parts List
2. Click "Import" button
3. Click "Select CSV or Excel File"
4. Choose your file
5. Click "Upload and Import"

#### 5. Review Results
The system will show:
- ✅ Number of parts imported (new)
- ℹ️ Number of parts updated (existing)
- ⚠️ Number of errors (if any)

### Import Behavior

**New Parts:**
- If `part_number` doesn't exist → creates new part

**Existing Parts:**
- If `part_number` exists → updates that part

**Categories & Suppliers:**
- If category/supplier doesn't exist → creates it automatically
- If exists → uses existing one

**Error Handling:**
- Bad rows are skipped
- Good rows are still imported
- Up to 50 error messages shown

### Example Import Data

```csv
part_number,name,description,category,supplier,quantity_in_stock,cost_price,selling_price,unit,is_active
BRK-001,Front Brake Pads,Ceramic brake pads,Brakes,AutoZone,25,35.00,89.99,set,true
OIL-001,Oil Filter,Premium oil filter,Filters,NAPA,50,5.50,12.99,unit,true
BLT-001,Serpentine Belt,Replacement belt,Belts,O'Reilly,15,12.00,34.99,piece,true
```

---

## 🔧 Troubleshooting

### Export Issues

**Problem:** Export dropdown not visible
- **Solution:** Check your user role (need admin, manager, or parts_manager)

**Problem:** CSV opens with weird characters
- **Solution:** File is UTF-8 encoded. In Excel: Data → From Text/CSV → UTF-8

**Problem:** PDF only shows 100 items
- **Solution:** This is intentional (performance). Use CSV for complete data.

### Import Issues

**Problem:** "Missing part_number or name"
- **Solution:** These fields are required. Check rows have both filled in.

**Problem:** Import button not visible
- **Solution:** Check your user role (need admin, manager, or parts_manager)

**Problem:** Numbers showing as text
- **Solution:** Make sure numeric fields don't have extra spaces or characters

**Problem:** Categories not matching
- **Solution:** Category names are case-sensitive. Use exact names.

**Problem:** "Row X: Error message"
- **Solution:** Fix that specific row in your file and re-upload

**Problem:** File upload fails
- **Solution:** 
  - Check file format (.csv, .xlsx, .xls only)
  - Make sure file isn't corrupted
  - Try saving as CSV if Excel file fails

### Pagination Issues

**Problem:** Per-page selector not working
- **Solution:** 
  - Clear browser cache
  - Make sure JavaScript is enabled
  - Try refreshing the page

**Problem:** Page numbers not showing
- **Solution:** Need more than 20 items for pagination to appear

### Display Issues

**Problem:** Supplier column shows "-"
- **Solution:** Part has no preferred supplier assigned. Edit part to add one.

**Problem:** Table too wide on mobile
- **Solution:** Table is responsive. Scroll horizontally or use tablet/desktop.

---

## 💡 Tips & Best Practices

### For Exporting:
1. **Apply filters first** - Export only what you need
2. **Use CSV for data** - Better for data manipulation
3. **Use PDF for reports** - Better for printing/sharing

### For Importing:
1. **Start small** - Test with 5-10 parts first
2. **Use template** - Don't create from scratch
3. **Backup first** - Export current data before importing
4. **Check errors** - Read error messages carefully
5. **Use Excel formulas** - Auto-fill repetitive data
6. **Consistent naming** - Use same names for categories/suppliers
7. **Plan part numbers** - Use consistent format (e.g., BRK-001, BRK-002)

### For Bulk Operations:
1. **Export existing data** - Use as baseline
2. **Modify in Excel** - Make changes
3. **Import back** - System updates matching parts

---

## 📞 Need Help?

### Common Questions

**Q: Can I import parts with images?**
A: No, images must be added individually through the edit form. Import handles text data only.

**Q: What happens to parts not in the import file?**
A: Nothing. Import only creates/updates parts in the file. Existing parts are untouched.

**Q: Can I import thousands of parts?**
A: Yes, but consider breaking into smaller batches (500-1000 at a time) for better error handling.

**Q: How do I update just the prices?**
A: Export current data, modify price columns, import back. System matches by part_number.

**Q: Can I undo an import?**
A: No built-in undo. Best practice: Export current data first as backup.

**Q: Why is my decimal price showing as integer?**
A: Use decimal format (12.50 not 12,50). Check your Excel region settings.

---

## 🎯 Quick Actions

| What I Want | How To Do It |
|-------------|--------------|
| See 40 parts per page | Select "40 per page" in dropdown (bottom right) |
| Export all active parts | Don't select any filters → Export → CSV |
| Export only low stock | Filter: Stock Level = "Low Stock" → Export |
| Import 50 new parts | Import → Download template → Fill data → Upload |
| Update prices for all parts | Export → Edit prices in Excel → Import |
| Print parts list | Export → PDF |
| See supplier for each part | Look at "Supplier" column (5th column) |
| Hide inactive parts | Filter: Status = "Active Only" (default) |

---

## ✅ Checklist

### Before Importing:
- [ ] Downloaded template
- [ ] Filled required fields (part_number, name)
- [ ] Used consistent category/supplier names
- [ ] Checked number formats (no commas)
- [ ] Saved as CSV or Excel
- [ ] Tested with small sample first

### After Importing:
- [ ] Checked success message
- [ ] Reviewed error messages (if any)
- [ ] Verified parts in list
- [ ] Checked stock quantities
- [ ] Confirmed prices are correct
- [ ] Verified suppliers assigned

---

*Last Updated: October 5, 2025*
*Version: 2.0*
