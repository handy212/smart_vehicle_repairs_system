from django.urls import include, path


urlpatterns = [
    path('api/diagnosis/', include('apps.diagnosis.urls')),
    path('api/workorders/', include(('apps.workorders.urls', 'api_workorders'))),
]
