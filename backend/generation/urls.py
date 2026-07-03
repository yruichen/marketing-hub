from django.urls import path

from generation.views import (
    AudioVoiceoverView,
    BrainstormView,
    ContentPackageView,
    ImageGenerateView,
    MarketingCopyView,
    StoryboardView,
    TaskDetailView,
    TaskQueueView,
    VideoGenerateView,
    WorkflowAiEditView,
    WorkflowNodeRetryView,
    WorkflowRunDetailView,
    WorkflowRunView,
)


urlpatterns = [
    path('brainstorm/', BrainstormView.as_view(), name='brainstorm'),
    path('generate/content-package/', ContentPackageView.as_view(), name='generate_content_package'),
    path('generate/copy/', MarketingCopyView.as_view(), name='generate_copy'),
    path('generate/image/', ImageGenerateView.as_view(), name='generate_image'),
    path('generate/storyboard/', StoryboardView.as_view(), name='generate_storyboard'),
    path('generate/audio/', AudioVoiceoverView.as_view(), name='generate_audio'),
    path('generate/video/', VideoGenerateView.as_view(), name='generate_video'),
    path('tasks/', TaskQueueView.as_view(), name='task_queue'),
    path('tasks/<int:pk>/', TaskDetailView.as_view(), name='task_detail'),
    path('workflow-runs/<int:pk>/', WorkflowRunDetailView.as_view(), name='workflow_run_detail'),
    path('drafts/<int:pk>/ai-edit/', WorkflowAiEditView.as_view(), name='workflow_ai_edit'),
    path('drafts/<int:pk>/run/', WorkflowRunView.as_view(), name='workflow_run'),
    path('drafts/<int:pk>/nodes/<str:node_id>/retry/', WorkflowNodeRetryView.as_view(), name='workflow_node_retry'),
]
