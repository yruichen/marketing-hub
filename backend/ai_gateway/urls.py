from django.urls import path

from ai_gateway.views import (
    AIConfigView,
    AIConfigModelsView,
    AssistantChatView,
    AssistantSessionDetailView,
    AssistantSessionListView,
    AssistantSessionMessagesView,
    ImageStyleSkillsView,
)


urlpatterns = [
    path('ai/config/', AIConfigView.as_view(), name='ai_config'),
    path('ai/config/models/', AIConfigModelsView.as_view(), name='ai_config_models'),
    path('ai/image-style-skills/', ImageStyleSkillsView.as_view(), name='image_style_skills'),
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
