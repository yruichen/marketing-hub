from django.urls import path

from ai_gateway.views import (
    AIConfigView,
    AssistantChatView,
    AssistantSessionDetailView,
    AssistantSessionListView,
    AssistantSessionMessagesView,
)


urlpatterns = [
    path('ai/config/', AIConfigView.as_view(), name='ai_config'),
    path('assistant/chat', AssistantChatView.as_view(), name='assistant_chat'),
    path(
        'assistant/sessions',
        AssistantSessionListView.as_view(),
        name='assistant_sessions',
    ),
    path(
        'assistant/sessions/<int:pk>',
        AssistantSessionDetailView.as_view(),
        name='assistant_session_detail',
    ),
    path(
        'assistant/sessions/<int:pk>/messages',
        AssistantSessionMessagesView.as_view(),
        name='assistant_session_messages',
    ),
]

