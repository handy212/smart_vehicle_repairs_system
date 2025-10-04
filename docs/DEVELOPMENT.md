# Development Guide

## 🎯 Quick Start Development Workflow

### Using Django Commands (Fastest Method!)

Yes, you're absolutely right! Django commands are the fastest way to scaffold your application. Here's how to use them effectively:

### Creating New Apps
```bash
# Activate virtual environment
source venv/bin/activate

# Create a new app
python manage.py startapp app_name apps/app_name

# Don't forget to add it to INSTALLED_APPS in config/settings.py
```

### Useful Django Management Commands

```bash
# Database operations
python manage.py makemigrations              # Create migration files
python manage.py migrate                     # Apply migrations
python manage.py showmigrations              # Show migration status
python manage.py sqlmigrate app_name 0001    # Show SQL for migration

# User management
python manage.py createsuperuser             # Create admin user
python manage.py changepassword username     # Change user password

# Development server
python manage.py runserver                   # Start dev server
python manage.py runserver 0.0.0.0:8000     # Make accessible on network

# Shell and testing
python manage.py shell                       # Interactive Python shell
python manage.py shell_plus                  # Enhanced shell (django-extensions)
python manage.py test                        # Run tests
python manage.py test apps.customers         # Run tests for specific app

# Static files
python manage.py collectstatic               # Collect static files
python manage.py findstatic filename.css     # Find static file location

# Database
python manage.py dbshell                     # Open database shell
python manage.py dumpdata > backup.json      # Backup database
python manage.py loaddata backup.json        # Restore database

# Utilities
python manage.py check                       # Check for project issues
python manage.py showurls                    # List all URLs (django-extensions)
python manage.py graph_models -a -o models.png  # Generate model diagram

# Custom management commands (create in app/management/commands/)
python manage.py your_custom_command
```

## 🏗️ App Development Pattern

### 1. Models First (models.py)
```python
from django.db import models

class Customer(models.Model):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Customer'
        verbose_name_plural = 'Customers'

    def __str__(self):
        return f"{self.first_name} {self.last_name}"
```

### 2. Admin Registration (admin.py)
```python
from django.contrib import admin
from .models import Customer

@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'email', 'phone', 'created_at']
    list_filter = ['created_at']
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    date_hierarchy = 'created_at'
```

### 3. Serializers (serializers.py)
```python
from rest_framework import serializers
from .models import Customer

class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
```

### 4. Views (views.py)
```python
from rest_framework import viewsets
from .models import Customer
from .serializers import CustomerSerializer

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    filterset_fields = ['email', 'phone']
    search_fields = ['first_name', 'last_name', 'email']
    ordering_fields = ['created_at', 'last_name']
```

### 5. URLs (urls.py)
```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet

router = DefaultRouter()
router.register(r'', CustomerViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
```

## 🔄 Development Workflow

### Step-by-step process for each feature:

1. **Define Models**
   ```bash
   # Edit apps/app_name/models.py
   python manage.py makemigrations
   python manage.py migrate
   ```

2. **Register in Admin**
   ```bash
   # Edit apps/app_name/admin.py
   # Check at http://localhost:8000/admin/
   ```

3. **Create Serializers**
   ```bash
   # Edit apps/app_name/serializers.py
   ```

4. **Create Views/ViewSets**
   ```bash
   # Edit apps/app_name/views.py
   ```

5. **Configure URLs**
   ```bash
   # Edit apps/app_name/urls.py
   # Update config/urls.py to include app urls
   ```

6. **Test**
   ```bash
   python manage.py test apps.app_name
   ```

## 🧪 Testing Best Practices

### Create tests in tests.py
```python
from django.test import TestCase
from rest_framework.test import APITestCase
from .models import Customer

class CustomerModelTest(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(
            first_name="John",
            last_name="Doe",
            email="john@example.com",
            phone="1234567890"
        )

    def test_customer_creation(self):
        self.assertEqual(self.customer.first_name, "John")
        self.assertEqual(str(self.customer), "John Doe")

class CustomerAPITest(APITestCase):
    def test_create_customer(self):
        data = {
            'first_name': 'Jane',
            'last_name': 'Doe',
            'email': 'jane@example.com',
            'phone': '0987654321'
        }
        response = self.client.post('/api/customers/', data)
        self.assertEqual(response.status_code, 201)
```

## 📝 Custom Management Commands

Create custom commands in `apps/app_name/management/commands/`:

```python
# apps/customers/management/commands/import_customers.py
from django.core.management.base import BaseCommand
from apps.customers.models import Customer

class Command(BaseCommand):
    help = 'Import customers from CSV'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str)

    def handle(self, *args, **options):
        csv_file = options['csv_file']
        # Import logic here
        self.stdout.write(self.style.SUCCESS('Successfully imported customers'))
```

Run it:
```bash
python manage.py import_customers data.csv
```

## 🚀 Performance Tips

### Database Optimization
```python
# Use select_related for foreign keys
customers = Customer.objects.select_related('user')

# Use prefetch_related for many-to-many
customers = Customer.objects.prefetch_related('vehicles')

# Use only() to fetch specific fields
customers = Customer.objects.only('first_name', 'email')

# Use defer() to exclude fields
customers = Customer.objects.defer('bio', 'notes')

# Bulk operations
Customer.objects.bulk_create([...])
Customer.objects.bulk_update([...], fields=['...'])
```

### Caching
```python
from django.core.cache import cache

# Set cache
cache.set('key', value, timeout=300)

# Get cache
value = cache.get('key')

# Delete cache
cache.delete('key')
```

### Celery Tasks
```python
# apps/app_name/tasks.py
from celery import shared_task

@shared_task
def send_reminder_email(customer_id):
    customer = Customer.objects.get(id=customer_id)
    # Send email logic
    return f"Email sent to {customer.email}"
```

## 🐛 Debugging Tools

### Django Debug Toolbar
Already installed! Access at http://localhost:8000/__debug__/

### Shell Plus
```bash
python manage.py shell_plus --print-sql
```

### Print SQL Queries
```python
from django.db import connection
print(connection.queries)
```

## 📚 Useful Packages Already Included

- **django-extensions**: Enhanced management commands
- **django-debug-toolbar**: Debug panel
- **django-filter**: Advanced filtering
- **django-import-export**: Import/export data
- **djangorestframework**: API development
- **drf-spectacular**: API documentation

## 🎨 Next Steps

1. **Start with the User/Accounts app**
   - Custom user model
   - Authentication endpoints
   - Role management

2. **Build Core Models**
   - Customer model
   - Vehicle model
   - Appointment model
   - WorkOrder model

3. **Create API Endpoints**
   - ViewSets for each model
   - Custom actions
   - Permissions

4. **Add Business Logic**
   - Signals for automation
   - Celery tasks for background jobs
   - Custom validators

5. **Testing**
   - Model tests
   - API tests
   - Integration tests

Would you like me to implement any specific app first? I can generate complete models, serializers, views, and tests for any feature you want to start with!
