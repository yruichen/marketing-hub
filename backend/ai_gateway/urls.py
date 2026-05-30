from django.urls import path

from ai_gateway.views import AIConfigView


urlpatterns = [
    path('ai/config/', AIConfigView.as_view(), name='ai_config'),
]

