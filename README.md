# 🚗 Smart Vehicle Repairs Management System

A comprehensive Django-based vehicle repair and workshop management system with modern features for managing customers, vehicles, appointments, work orders, inventory, billing, inspections, and reporting.

## 📋 Features

### 🔐 Authentication & User Management
- Custom user model with role-based permissions
- JWT authentication for API
- Social authentication support (Google, Facebook, etc.)
- Role-based access control (Admin, Manager, Receptionist, Technician, Parts Manager, Customer)

### 🚘 Vehicle & Customer Management
- Customer profiles with complete service history
- Vehicle information (VIN, make, model, year, mileage, fuel type)
- CarAPI integration for vehicle data lookup
- Service history tracking

### 📅 Appointments & Scheduling
- Online booking system
- Technician scheduling and availability
- Visual calendar for job management
- Service reminders and follow-ups

### 🛠️ Work Order Management
- Job cards with task breakdown
- Status tracking (In Progress, Waiting for Parts, Completed, etc.)
- Time tracking and labor estimates
- Task assignment to technicians

### 📦 Inventory Management
- Real-time stock levels
- Supplier/vendor management
- Automated reorder alerts
- Parts request tracking

### 💳 Billing & Invoicing
- Estimate/quotation generation
- Invoice creation and payment tracking
- Multiple payment methods support
- Integration-ready for accounting systems

### 🔍 Inspections
- Digital inspection checklists
- Photo attachments
- Defect tracking
- Pre-service inspections

### 📊 Reporting & Analytics
- Dashboard with key KPIs
- Technician performance metrics
- Financial reports
- Work-in-progress reporting

### 🔔 Notifications
- Automated email/SMS notifications
- Service reminders
- Status update notifications
- Customer portal for tracking

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- PostgreSQL (or SQLite for development)
- Redis (for caching and Celery)
- pip and virtualenv

### Installation

1. **Clone the repository** (if from git)
```bash
cd /path/smart_vehicle_repairs_system
```

2. **Create and activate virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate  # On Linux/Mac
# or
venv\Scripts\activate  # On Windows
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env file with your configuration
```

5. **Run migrations**
```bash
python manage.py makemigrations
python manage.py migrate
```

6. **Create superuser**
```bash
python manage.py createsuperuser
```

7. **Run development server**
```bash
python manage.py runserver
```

8. **Access the application**
- Admin Panel: http://localhost:8000/admin/
- API Documentation: http://localhost:8000/api/docs/
- API Schema: http://localhost:8000/api/schema/

### Running Background Tasks (Optional)

**Start Celery Worker:**
```bash
celery -A config worker -l info
```

**Start Celery Beat (for scheduled tasks):**
```bash
celery -A config beat -l info
```

## 📁 Project Structure

```
smart_vehicle_repairs_system/
├── config/                  # Project configuration
│   ├── settings.py         # Django settings
│   ├── urls.py            # URL routing
│   ├── celery.py          # Celery configuration
│   └── roles.py           # Role permissions
├── apps/                   # Django applications
│   ├── accounts/          # User authentication & management
│   ├── customers/         # Customer management
│   ├── vehicles/          # Vehicle tracking
│   ├── appointments/      # Scheduling & appointments
│   ├── workorders/        # Work order management
│   ├── inventory/         # Parts & inventory
│   ├── billing/           # Invoicing & payments
│   ├── inspections/       # Vehicle inspections
│   ├── reporting/         # Analytics & reports
│   └── notifications_app/ # Notifications system
├── static/                # Static files (CSS, JS, images)
├── media/                 # User uploaded files
├── templates/             # HTML templates
├── logs/                  # Application logs
├── requirements.txt       # Python dependencies
├── manage.py             # Django management script
└── README.md             # This file
```

## 🔧 Configuration

### Database Setup (PostgreSQL)
```bash
# Create database
createdb vehicle_repairs_db

# Update .env file
DATABASE_URL=postgresql://username:password@localhost:5432/vehicle_repairs_db
```

### Redis Setup
```bash
# Install Redis (Ubuntu/Debian)
sudo apt-get install redis-server

# Start Redis
redis-server

# Update .env file
REDIS_URL=redis://localhost:6379/0
```

### Email Configuration
Update `.env` file with your SMTP settings:
```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
```

## 🧪 Running Tests
```bash
python manage.py test
```

## 📚 API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/api/docs/
- **ReDoc**: http://localhost:8000/api/redoc/

## 🔑 User Roles

The system supports the following roles:

1. **Admin**: Full system access
2. **Manager**: Workshop/branch management
3. **Receptionist**: Front desk operations
4. **Technician**: Workshop mechanics
5. **Parts Manager**: Inventory management
6. **Customer**: Customer portal access

## 🛣️ Roadmap

- [ ] Complete model implementations for all apps
- [ ] Build API endpoints with DRF
- [ ] Add comprehensive test coverage
- [ ] Implement frontend (React/Vue.js)
- [ ] Mobile app integration
- [ ] Payment gateway integration
- [ ] Advanced reporting with charts
- [ ] Multi-branch support
- [ ] Warranty tracking
- [ ] Predictive maintenance

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For support, email support@smartvehiclerepairs.com or open an issue in the repository.

---

**Built with ❤️ using Django, DRF, and modern Python packages**
