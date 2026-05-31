from django.urls import include, path
from rest_framework.schemas import get_schema_view

urlpatterns = [
    path('schema/', get_schema_view(title='Marketing Hub API', version='1.0.0'), name='openapi_schema'),
    path('', include('accounts.urls')),
    path('', include('workspaces.urls')),
    path('', include('generation.urls')),
    path('', include('community.urls')),
    path('', include('ai_gateway.urls')),
    path('', include('billing.urls')),
]
