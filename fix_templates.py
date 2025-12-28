import os

BASE_DIR = '/home/dev/smart_vehicle_repairs_system'

files = {
    'templates/printing/base/components/financial_summary.html': """<div class="financial-summary">
    <!-- Subtotal -->
    <div class="summary-row">
        <div class="summary-label">Subtotal:</div>
        <div class="summary-value">${{ document.subtotal|floatformat:2|default:"0.00" }}</div>
    </div>

    <!-- Discount -->
    {% if document.discount_amount and document.discount_amount > 0 %}
    <div class="summary-row" style="color: #dc2626;">
        <div class="summary-label">
            Discount
            {% if document.discount_percentage %}({{ document.discount_percentage }}%){% endif %}:
        </div>
        <div class="summary-value">-${{ document.discount_amount|floatformat:2 }}</div>
    </div>
    {% endif %}

    <!-- Tax Breakdown -->
    {% if document.tax_nhil_amount or document.tax_getfund_amount or document.tax_hrl_amount or document.tax_vat_amount %}
        {% if document.tax_nhil_amount and document.tax_nhil_amount > 0 %}
        <div class="summary-row">
            <div class="summary-label">NHIL (2.5%):</div>
            <div class="summary-value">${{ document.tax_nhil_amount|floatformat:2 }}</div>
        </div>
        {% endif %}

        {% if document.tax_getfund_amount and document.tax_getfund_amount > 0 %}
        <div class="summary-row">
            <div class="summary-label">GETFund (2.5%):</div>
            <div class="summary-value">${{ document.tax_getfund_amount|floatformat:2 }}</div>
        </div>
        {% endif %}

        {% if document.tax_hrl_amount and document.tax_hrl_amount > 0 %}
        <div class="summary-row">
            <div class="summary-label">COVID-19 HRL (1%):</div>
            <div class="summary-value">${{ document.tax_hrl_amount|floatformat:2 }}</div>
        </div>
        {% endif %}

        {% if document.tax_vat_amount and document.tax_vat_amount > 0 %}
        <div class="summary-row">
            <div class="summary-label">VAT (15%):</div>
            <div class="summary-value">${{ document.tax_vat_amount|floatformat:2 }}</div>
        </div>
        {% endif %}

        <div class="summary-row subtotal">
            <div class="summary-label font-semibold">Total Tax:</div>
            <div class="summary-value font-semibold">${{ document.tax_amount|floatformat:2|default:"0.00" }}</div>
        </div>
    {% elif document.tax_amount and document.tax_amount > 0 %}
        <div class="summary-row">
            <div class="summary-label">Tax:</div>
            <div class="summary-value">${{ document.tax_amount|floatformat:2 }}</div>
        </div>
    {% endif %}

    <!-- Total -->
    <div class="summary-row total">
        <div class="summary-label">TOTAL:</div>
        <div class="summary-value">${{ document.total|floatformat:2|default:"0.00" }}</div>
    </div>

    <!-- Amount Paid (if applicable) -->
    {% if document.amount_paid and document.amount_paid > 0 %}
    <div class="summary-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #d1d5db;">
        <div class="summary-label">Amount Paid:</div>
        <div class="summary-value" style="color: #10b981;">${{ document.amount_paid|floatformat:2 }}</div>
    </div>

    <div class="summary-row">
        <div class="summary-label font-bold">Balance Due:</div>
        <div class="summary-value font-bold" style="color: #dc2626;">${{ document.amount_due|floatformat:2|default:"0.00" }}</div>
    </div>
    {% endif %}
</div>

<div style="clear: both;"></div>
""",

'templates/printing/base/document_base.html': """<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}Document{% endblock %} - Smart Vehicle Repairs</title>

    <style>
        /* Modern, Professional Styling */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 10pt;
            line-height: 1.6;
            color: #1f2937;
            background: #ffffff;
        }

        /* Page Setup */
        @page {
            size: A4;
            margin: 15mm;
        }

        /* Watermark Base */
        .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 100pt;
            font-weight: 900;
            opacity: 0.05;
            z-index: -1;
            pointer-events: none;
            user-select: none;
        }

        /* Header */
        .document-header {
            display: table;
            width: 100%;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 3px solid #2563eb;
        }

        .header-left {
            display: table-cell;
            width: 60%;
            vertical-align: top;
        }

        .header-right {
            display: table-cell;
            width: 40%;
            vertical-align: top;
            text-align: right;
        }

        .company-name {
            font-size: 22pt;
            font-weight: 700;
            color: #111827;
            margin-bottom: 8px;
        }

        .company-info {
            font-size: 9pt;
            color: #6b7280;
            line-height: 1.5;
        }

        .document-type {
            font-size: 20pt;
            font-weight: 700;
            color: #2563eb;
            margin-bottom: 5px;
            text-transform: uppercase;
        }

        .document-number {
            font-size: 11pt;
            font-weight: 600;
            color: #374151;
        }

        .document-meta {
            font-size: 9pt;
            color: #6b7280;
            margin-top: 5px;
        }

        /* Content Sections */
        .section {
            margin: 20px 0;
        }

        .section-title {
            font-size: 12pt;
            font-weight: 600;
            color: #111827;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid #e5e7eb;
        }

        /* Info Boxes */
        .info-box {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 12px;
            margin: 10px 0;
        }

        .info-row {
            display: table;
            width: 100%;
            margin-bottom: 8px;
        }

        .info-row:last-child {
            margin-bottom: 0;
        }

        .info-label {
            display: table-cell;
            width: 30%;
            font-weight: 600;
            color: #374151;
            font-size: 9pt;
        }

        .info-value {
            display: table-cell;
            width: 70%;
            color: #1f2937;
            font-size: 9pt;
        }

        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }

        thead th {
            background: #f3f4f6;
            font-weight: 600;
            text-align: left;
            padding: 10px 8px;
            border-bottom: 2px solid #d1d5db;
            font-size: 9pt;
            color: #374151;
        }

        tbody td {
            padding: 8px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 9pt;
        }

        tbody tr:last-child td {
            border-bottom: none;
        }

        .text-right {
            text-align: right;
        }

        .text-center {
            text-align: center;
        }

        .font-medium {
            font-weight: 500;
        }

        .font-semibold {
            font-weight: 600;
        }

        .font-bold {
            font-weight: 700;
        }

        /* Financial Summary */
        .financial-summary {
            margin-top: 30px;
            float: right;
            width: 320px;
            clear: both;
        }

        .summary-row {
            display: table;
            width: 100%;
            padding: 6px 0;
        }

        .summary-label {
            display: table-cell;
            text-align: left;
            color: #374151;
            font-size: 10pt;
        }

        .summary-value {
            display: table-cell;
            text-align: right;
            color: #1f2937;
            font-size: 10pt;
            font-weight: 500;
        }

        .summary-row.subtotal {
            border-top: 1px solid #d1d5db;
            padding-top: 8px;
            margin-top: 4px;
        }

        .summary-row.total {
            font-size: 13pt;
            font-weight: 700;
            border-top: 2px solid #111827;
            padding-top: 12px;
            margin-top: 8px;
        }

        .summary-row.total .summary-label {
            color: #111827;
        }

        .summary-row.total .summary-value {
            color: #2563eb;
        }

        /* Footer */
        .document-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 10px 15mm;
            font-size: 8pt;
            color: #9ca3af;
            text-align: center;
            border-top: 1px solid #e5e7eb;
            background: #ffffff;
        }

        /* Notes */
        .notes-section {
            background: #fffbeb;
            border-left: 3px solid #f59e0b;
            padding: 12px;
            margin: 15px 0;
            font-size: 9pt;
            color: #78350f;
        }

        /* Print Specific */
        @media print {
            .no-print {
                display: none !important;
            }

            body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
            }

            .page-break {
                page-break-before: always;
            }
        }
    </style>

    {% if watermark %}
    <style>
        .watermark {
            color: {{ watermark.color }};
        }
    </style>
    {% endif %}

    {% block extra_styles %}{% endblock %}
</head>

<body>
    {% if watermark %}
    <div class="watermark">{{ watermark.text }}</div>
    {% endif %}

    <!-- Header -->
    <div class="document-header">
        {% include 'printing/base/components/header.html' %}
    </div>

    <!-- Main Content -->
    {% block content %}{% endblock %}

    <!-- Footer -->
    <div class="document-footer">
        {% include 'printing/base/components/footer.html' %}
    </div>
</body>

</html>
""",

'templates/printing/documents/estimate.html': """{% extends 'printing/base/document_base.html' %}

{% block title %}Estimate {{ document.estimate_number }}{% endblock %}

{% block document_type %}Estimate{% endblock %}
{% block document_number %}{{ document.estimate_number }}{% endblock %}
{% block document_meta %}
Date: {{ document.estimate_date|date:"F d, Y" }}<br>
Valid Until: {{ document.valid_until|date:"F d, Y" }}<br>
Status: <strong>{{ document.get_status_display }}</strong>
{% endblock %}

{% block content %}
<div class="section">
    <div style="display: table; width: 100%; margin-bottom: 20px;">
        <!-- Customer Info -->
        <div style="display: table-cell; width: 48%; vertical-align: top;">
            <div class="section-title">Estimate For</div>
            {% with customer=document.customer %}
            {% include 'printing/base/components/customer_info.html' %}
            {% endwith %}
        </div>

        <!-- Vehicle Info -->
        <div style="display: table-cell; width: 4%;"></div>
        <div style="display: table-cell; width: 48%; vertical-align: top;">
            {% if document.vehicle %}
            <div class="section-title">Vehicle Information</div>
            <div class="info-box">
                <div class="info-row">
                    <div class="info-label">Vehicle:</div>
                    <div class="info-value">
                        <strong>{{ document.vehicle.year }} {{ document.vehicle.make }} {{ document.vehicle.model }}</strong>
                    </div>
                </div>
                {% if document.vehicle.vin %}
                <div class="info-row">
                    <div class="info-label">VIN:</div>
                    <div class="info-value">{{ document.vehicle.vin }}</div>
                </div>
                {% endif %}
                {% if document.vehicle.license_plate %}
                <div class="info-row">
                    <div class="info-label">License:</div>
                    <div class="info-value">{{ document.vehicle.license_plate }}</div>
                </div>
                {% endif %}
            </div>
            {% endif %}
        </div>
    </div>
</div>

<!-- Description -->
{% if document.description %}
<div class="section">
    <div class="section-title">Estimated Work</div>
    <p style="font-size: 9pt; color: #374151; line-height: 1.6;">{{ document.description|linebreaks }}</p>
</div>
{% endif %}

<!-- Line Items -->
<div class="section">
    <div class="section-title">Breakdown of Costs</div>

    <table>
        <thead>
            <tr>
                <th style="width: 10%;">Type</th>
                <th style="width: 45%;">Description</th>
                <th style="width: 12%; text-align: center;">Qty</th>
                <th style="width: 15%; text-align: right;">Unit Price</th>
                <th style="width: 18%; text-align: right;">Total</th>
            </tr>
        </thead>
        <tbody>
            {% if document.line_items.all %}
            {% for item in document.line_items.all %}
            <tr>
                <td style="text-transform: capitalize;">{{ item.item_type|title }}</td>
                <td>
                    <div style="font-weight: 500; color: #111827;">{{ item.description }}</div>
                    {% if item.part_name %}
                    <div style="font-size: 8pt; color: #6b7280; margin-top: 2px;">Part: {{ item.part_name }}</div>
                    {% endif %}
                    {% if item.part_number %}
                    <div style="font-size: 8pt; color: #6b7280;">Part #: {{ item.part_number }}</div>
                    {% endif %}
                    {% if item.notes %}
                    <div style="font-size: 8pt; color: #6b7280; margin-top: 2px; font-style: italic;">{{ item.notes }}
                    </div>
                    {% endif %}
                </td>
                <td class="text-center">
                    {% if item.item_type == 'labor' and item.labor_hours %}
                    {{ item.labor_hours|floatformat:1 }} hrs
                    {% else %}
                    {{ item.quantity|floatformat:2 }}
                    {% endif %}
                </td>
                <td class="text-right">
                    {% if item.item_type == 'labor' and item.labor_rate %}
                    ${{ item.labor_rate|floatformat:2 }}/hr
                    {% else %}
                    ${{ item.unit_price|floatformat:2 }}
                    {% endif %}
                </td>
                <td class="text-right font-medium">${{ item.total|floatformat:2 }}</td>
            </tr>
            {% endfor %}
            {% else %}
            <tr>
                <td colspan="5" style="text-align: center; color: #9ca3af; padding: 20px;">
                    No line items
                </td>
            </tr>
            {% endif %}
        </tbody>
    </table>
</div>

<!-- Financial Summary -->
{% include 'printing/base/components/financial_summary.html' %}

<!-- Notes -->
{% if document.customer_notes %}
<div class="section">
    <div class="notes-section">
        <strong style="display: block; margin-bottom: 5px;">Notes:</strong>
        {{ document.customer_notes|linebreaks }}
    </div>
</div>
{% endif %}

<!-- Important Notice -->
<div class="section">
    <div style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; font-size: 9pt;">
        <strong>Important:</strong> This estimate is valid until {{ document.valid_until|date:"F d, Y" }}.
        Prices are subject to change after this date. Final charges may vary based on additional findings during
        service.
    </div>
</div>
{% endblock %}
""",

'templates/printing/base/components/customer_info.html': """<div class="info-box">
    <div class="info-row">
        <div class="info-label">Customer:</div>
        <div class="info-value">
            <strong>
                {% if customer.company_name %}
                {{ customer.company_name }}
                {% else %}
                {{ customer.first_name }} {{ customer.last_name }}
                {% endif %}
            </strong>
        </div>
    </div>

    {% if customer.email %}
    <div class="info-row">
        <div class="info-label">Email:</div>
        <div class="info-value">{{ customer.email }}</div>
    </div>
    {% endif %}

    {% if customer.phone %}
    <div class="info-row">
        <div class="info-label">Phone:</div>
        <div class="info-value">{{ customer.phone }}</div>
    </div>
    {% endif %}

    {% if customer.service_address or customer.service_city %}
    <div class="info-row">
        <div class="info-label">Address:</div>
        <div class="info-value">
            {% if customer.service_address %}{{ customer.service_address }}<br>{% endif %}
            {% if customer.service_city %}{{ customer.service_city }}{% if customer.service_state %}, {{ customer.service_state }}{% endif %} {{ customer.service_zip_code|default:"" }}{% endif %}
        </div>
    </div>
    {% endif %}
</div>
"""
}

for rel_path, content in files.items():
    abs_path = os.path.join(BASE_DIR, rel_path)
    print(f"Writing to {abs_path}...")
    with open(abs_path, 'w') as f:
        f.write(content.strip())
    print("Done.")

print("All templates updated successfully.")
