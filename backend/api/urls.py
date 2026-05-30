from django.urls import include, path

urlpatterns = [
    path('', include('accounts.urls')),
    path('', include('workspaces.urls')),
    path('', include('generation.urls')),
    path('', include('community.urls')),
    path('', include('ai_gateway.urls')),
    path('', include('billing.urls')),
]

