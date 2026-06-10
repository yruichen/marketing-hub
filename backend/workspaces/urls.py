from django.urls import path

from workspaces.views import (
    AnalyticsDashboardView,
    CampaignCollectionView,
    CampaignDetailView,
    FolderCollectionView,
    FolderDetailView,
    ProjectCollectionView,
    ProjectDetailView,
    WorkflowTemplateCollectionView,
    WorkflowTemplateForkView,
    WorkspaceAssetDetailView,
    WorkspaceAssetsView,
    WorkspaceBootstrapView,
    WorkspaceDraftCollectionView,
    WorkspaceDraftDetailView,
    WorkspaceView,
)


urlpatterns = [
    path('workspace/bootstrap/', WorkspaceBootstrapView.as_view(), name='workspace_bootstrap'),
    path('workspace/', WorkspaceView.as_view(), name='workspace'),
    path('folders/', FolderCollectionView.as_view(), name='folder_collection'),
    path('folders/<int:pk>/', FolderDetailView.as_view(), name='folder_detail'),
    path('projects/', ProjectCollectionView.as_view(), name='project_collection'),
    path('projects/<int:pk>/', ProjectDetailView.as_view(), name='project_detail'),
    path('campaigns/', CampaignCollectionView.as_view(), name='campaign_collection'),
    path('campaigns/<int:pk>/', CampaignDetailView.as_view(), name='campaign_detail'),
    path('drafts/', WorkspaceDraftCollectionView.as_view(), name='workspace_draft_collection'),
    path('drafts/<int:pk>/', WorkspaceDraftDetailView.as_view(), name='workspace_draft_detail'),
    path('templates/', WorkflowTemplateCollectionView.as_view(), name='workflow_template_collection'),
    path('templates/<int:pk>/fork/', WorkflowTemplateForkView.as_view(), name='workflow_template_fork'),
    path('dashboard/', AnalyticsDashboardView.as_view(), name='dashboard'),
    path('workspace/assets/', WorkspaceAssetsView.as_view(), name='workspace_assets'),
    path('workspace/assets/<int:pk>/', WorkspaceAssetDetailView.as_view(), name='workspace_asset_detail'),
]
