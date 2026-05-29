from django.urls import path
from .views import (
    MarketingCopyView, 
    ImageGenerateView, 
    StoryboardView, 
    AudioVoiceoverView,
    LoginView,
    AIConfigView,
    CommunityCreationView,
    LikeCreationView,
    RAGSearchView
)

urlpatterns = [
    # AIGC Workflow Generations
    path('generate/copy/', MarketingCopyView.as_view(), name='generate_copy'),
    path('generate/image/', ImageGenerateView.as_view(), name='generate_image'),
    path('generate/storyboard/', StoryboardView.as_view(), name='generate_storyboard'),
    path('generate/audio/', AudioVoiceoverView.as_view(), name='generate_audio'),
    
    # Auth Login
    path('auth/login/', LoginView.as_view(), name='auth_login'),
    
    # AI Configuration Keys
    path('ai/config/', AIConfigView.as_view(), name='ai_config'),
    
    # Community & Showcase Feed
    path('community/creations/', CommunityCreationView.as_view(), name='community_creations'),
    path('community/creations/<int:pk>/like/', LikeCreationView.as_view(), name='like_creation'),
    
    # RAG Semantic Retrieval Endpoint
    path('community/search/', RAGSearchView.as_view(), name='rag_search'),
]
