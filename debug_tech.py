from apps.technicians.serializers import TechnicianSerializer
from django.contrib.auth import get_user_model
User = get_user_model()

data = {
    'email': 'test_tech_debug@example.com',
    'first_name': 'Test',
    'last_name': 'Tech',
    'password': 'password123',
    'phone': '1234567890',
    'years_of_experience': 5,
    'bio': 'Test Bio',
    'skill_ids': []
}

serializer = TechnicianSerializer(data=data)
if serializer.is_valid():
    print("Serializer is valid!")
    try:
        tech = serializer.save()
        print(f"Technician created: {tech.id}")
        print(f"User created: {tech.user.email}")
    except Exception as e:
        print(f"Save failed: {e}")
else:
    print(f"Serializer errors: {serializer.errors}")
