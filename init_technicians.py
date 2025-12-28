#!/usr/bin/env python
"""
Script to create predefined skills and auto-create Technician profiles
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.technicians.models import Skill, Technician
from apps.accounts.models import User

# Create predefined skills
skills_data = [
    ("ASE Certified Technician", "Automotive Service Excellence Certification"),
    ("Diesel Engine Repair", "Specialized in diesel engine diagnostics and repair"),
    ("Hybrid/Electric Vehicle", "Certified for hybrid and electric vehicle systems"),
    ("Brake Systems", "Expert in brake system repair and maintenance"),
    ("Transmission Repair", "Automatic and manual transmission specialist"),
    ("HVAC Systems", "Heating, ventilation, and air conditioning expert"),
    ("Engine Diagnostics", "Advanced engine diagnostic capabilities"),
    ("Electrical Systems", "Automotive electrical systems specialist"),
    ("Suspension & Steering", "Suspension and steering systems expert"),
    ("Tire & Wheel Services", "Tire installation, balancing, and alignment"),
]

print("Creating predefined skills...")
for name, desc in skills_data:
    skill, created = Skill.objects.get_or_create(
        name=name, 
        defaults={'description': desc, 'is_active': True}
    )
    if created:
        print(f"  ✓ Created: {name}")
    else:
        print(f"  - Exists: {name}")

print(f"\nTotal skills: {Skill.objects.count()}")

# Auto-create Technician profiles for users with role='technician'
print("\nAuto-creating Technician profiles...")
tech_users = User.objects.filter(role='technician')
created_count = 0

for user in tech_users:
    if not hasattr(user, 'technician_profile'):
        Technician.objects.create(user=user, years_of_experience=0)
        created_count += 1
        print(f"  ✓ Created profile for: {user.email}")
    else:
        print(f"  - Profile exists for: {user.email}")

print(f"\n✓ Created {created_count} new technician profiles")
print(f"✓ Total technician profiles: {Technician.objects.count()}")
print(f"✓ Total users with technician role: {tech_users.count()}")
