from django.urls import path
from .views import (
    AnalyticsDashboardView,
    MarketingCopyView, 
    ImageGenerateView, 
    StoryboardView, 
    AudioVoiceoverView,
    LoginView,
    AIConfigView,
    CampaignCollectionView,
    CampaignDetailView,
    CommunityCreationView,
    LikeCreationView,
    RAGSearchView,
    ProjectCollectionView,
    ProjectDetailView,
    WorkspaceBootstrapView,
    WorkspaceView,
    WorkflowNodeRetryView,
    WorkflowRunView,
    WorkflowTemplateCollectionView,
    WorkflowTemplateForkView,
    WorkspaceDraftCollectionView,
    WorkspaceDraftDetailView,
    TaskQueueView,
    TaskDetailView,
)

urlpatterns = [
    # AIGC Workflow Generations
    path('generate/copy/', MarketingCopyView.as_view(), name='generate_copy'),
    path('generate/image/', ImageGenerateView.as_view(), name='generate_image'),
    path('generate/storyboard/', StoryboardView.as_view(), name='generate_storyboard'),
    path('generate/audio/', AudioVoiceoverView.as_view(), name='generate_audio'),
    
    # Auth Login
    path('auth/login/', LoginView.as_view(), name='auth_login'),

    # Workspace / Project / Campaign
    path('workspace/bootstrap/', WorkspaceBootstrapView.as_view(), name='workspace_bootstrap'),
    path('workspace/', WorkspaceView.as_view(), name='workspace'),
    path('projects/', ProjectCollectionView.as_view(), name='project_collection'),
    path('projects/<int:pk>/', ProjectDetailView.as_view(), name='project_detail'),
    path('campaigns/', CampaignCollectionView.as_view(), name='campaign_collection'),
    path('campaigns/<int:pk>/', CampaignDetailView.as_view(), name='campaign_detail'),
    path('drafts/', WorkspaceDraftCollectionView.as_view(), name='workspace_draft_collection'),
    path('drafts/<int:pk>/', WorkspaceDraftDetailView.as_view(), name='workspace_draft_detail'),
    path('drafts/<int:pk>/run/', WorkflowRunView.as_view(), name='workflow_run'),
    path('drafts/<int:pk>/nodes/<str:node_id>/retry/', WorkflowNodeRetryView.as_view(), name='workflow_node_retry'),
    path('templates/', WorkflowTemplateCollectionView.as_view(), name='workflow_template_collection'),
    path('templates/<int:pk>/fork/', WorkflowTemplateForkView.as_view(), name='workflow_template_fork'),
    path('dashboard/', AnalyticsDashboardView.as_view(), name='dashboard'),

    # AI Configuration Keys
    path('ai/config/', AIConfigView.as_view(), name='ai_config'),
    
    # Community & Showcase Feed
    path('community/creations/', CommunityCreationView.as_view(), name='community_creations'),
    path('community/creations/<int:pk>/like/', LikeCreationView.as_view(), name='like_creation'),
    
    # RAG Semantic Retrieval Endpoint
    path('community/search/', RAGSearchView.as_view(), name='rag_search'),

    # Async-style task queue ledger
    path('tasks/', TaskQueueView.as_view(), name='task_queue'),
    path('tasks/<int:pk>/', TaskDetailView.as_view(), name='task_detail'),
]
