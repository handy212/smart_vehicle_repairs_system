# Django Ledger Custom Templates - Quick Reference

## 🎨 Custom Templates Created

### Core Templates
| Template | Purpose | Key Features |
|----------|---------|--------------|
| `layouts/base.html` | Base layout | Tailwind CSS, Lucide icons, gradient header |
| `includes/nav.html` | Navigation bar | App branding, quick links, user menu |
| `entity/entity_dashboard.html` | Main dashboard | Financial cards, charts, receivables/payables |
| `ledger/ledger_list.html` | Ledger listing | Table view, filters, pagination |
| `ledger/ledger_create.html` | Create ledger | Form with validation |
| `ledger/ledger_update.html` | Edit ledger | Form with delete option |
| `ledger/ledger_delete.html` | Delete ledger | Confirmation with warnings |

## 🎯 How to Access

1. **Navigate to ledger**: http://localhost:8001/ledger/
2. **Select or create entity**: You'll need an entity slug
3. **Access dashboard**: `/ledger/{entity-slug}/dashboard/`
4. **View ledgers**: `/ledger/{entity-slug}/ledger/list/`

## 🚀 Quick Test

```bash
# Visit the ledger interface
open http://localhost:8001/ledger/

# Or from your frontend redirect
open http://localhost:3001/accounting/ledger
```

## 📋 Template Inheritance Tree

```
base.html (Custom)
├── entity_dashboard.html (Custom)
├── ledger_list.html (Custom)
├── ledger_create.html (Custom)
├── ledger_update.html (Custom)
└── ledger_delete.html (Custom)
```

## 🎨 Design System

### Colors
- **Primary**: Purple/Indigo gradient (`#667eea` → `#764ba2`)
- **Success**: Green shades
- **Warning**: Yellow/Amber shades
- **Danger**: Red shades
- **Info**: Blue shades

### Components
- `.gradient-bg` - Primary gradient background
- `.card-hover` - Hover animation for cards
- `.stat-card` - Financial stat card with gradient
- `.btn-primary` - Primary button with gradient

### Icons
All templates use **Lucide Icons**:
```html
<i data-lucide="icon-name" class="h-5 w-5"></i>
```

Common icons used:
- `layout-dashboard` - Dashboard
- `book-open` - Ledgers
- `file-text` - Invoices
- `receipt` - Bills
- `plus` - Create actions
- `edit-2` - Edit
- `trash-2` - Delete

## 🔧 Customization

### Change Colors
In any template, modify the gradient:
```css
.gradient-bg {
    background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
}
```

### Add Custom CSS
Create: `static/django_ledger/css/custom.css`
Include in `base.html`:
```django
{% block header_extra_css %}
    <link rel="stylesheet" href="{% static 'django_ledger/css/custom.css' %}">
{% endblock %}
```

### Override More Templates
Copy structure from:
```
venv-dev/lib/python3.12/site-packages/django_ledger/templates/django_ledger/
```
To:
```
templates/django_ledger/
```

## ✅ Verification Checklist

- [ ] Templates created in `templates/django_ledger/`
- [ ] Static files collected (`python manage.py collectstatic`)
- [ ] Development server running
- [ ] Navigate to `/ledger/` URL
- [ ] Check if custom styling appears
- [ ] Test create/edit/delete ledgers
- [ ] Verify responsive design on mobile

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Templates not loading | Check `TEMPLATES['DIRS']` in settings |
| Styles not applied | Verify Tailwind CDN is loading |
| Icons not showing | Check Lucide script is loaded |
| Forms not styled | Ensure `widget_tweaks` is installed |
| Charts not rendering | Verify django-ledger JS is loaded |

## 📦 Dependencies

All dependencies are already in your `requirements.txt`:
- ✅ django-ledger
- ✅ django-widget-tweaks
- ✅ django

External CDNs (auto-loaded):
- Tailwind CSS
- Lucide Icons

## 🔄 Next Templates to Create

Consider creating custom templates for:
1. **Chart of Accounts**: `templates/django_ledger/account/account_list.html`
2. **Journal Entries**: `templates/django_ledger/journal_entry/journal_entry_list.html`
3. **Invoices**: `templates/django_ledger/invoice/invoice_list.html`
4. **Bills**: `templates/django_ledger/bills/bill_list.html`
5. **Financial Reports**: `templates/django_ledger/financial_statements/`

## 📞 Support Resources

- **Django Ledger Docs**: https://django-ledger.readthedocs.io/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Lucide Icons**: https://lucide.dev/icons/
- **Django Templates**: https://docs.djangoproject.com/en/stable/topics/templates/
