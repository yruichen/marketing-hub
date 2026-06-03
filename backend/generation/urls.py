from django.urls import path

from generation.views import (
    AudioVoiceoverView,
    ContentPackageView,
    ImageGenerateView,
    MarketingCopyView,
    StoryboardView,
    TaskDetailView,
    TaskQueueView,
    WorkflowNodeRetryView,
    WorkflowRunView,
)


urlpatterns = [
    path('generate/content-package/', ContentPackageView.as_view(), name='generate_content_package'),
    path('generate/copy/', MarketingCopyView.as_view(), name='generate_copy'),
    path('generate/image/', ImageGenerateView.as_view(), name='generate_image'),
    path('generate/storyboard/', StoryboardView.as_view(), name='generate_storyboard'),
    path('generate/audio/', AudioVoiceoverView.as_view(), name='generate_audio'),
    path('tasks/', TaskQueueView.as_view(), name='task_queue'),
    path('tasks/<int:pk>/', TaskDetailView.as_view(), name='task_detail'),
    path('drafts/<int:pk>/run/', WorkflowRunView.as_view(), name='workflow_run'),
    path('drafts/<int:pk>/nodes/<str:node_id>/retry/', WorkflowNodeRetryView.as_view(), name='workflow_node_retry'),
]

