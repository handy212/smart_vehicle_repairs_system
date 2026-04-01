from django.urls import include, path


urlpatterns = [
    path('api/diagnosis/', include('apps.diagnosis.urls')),
]
