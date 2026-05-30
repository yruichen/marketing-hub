"""Compatibility imports for legacy code that imports views from api.views.

New endpoint ownership lives in the domain apps:
accounts, workspaces, generation, community, ai_gateway, and billing.
"""

from accounts.views import LoginView
from ai_gateway.views import AIConfigView
from billing.views import BillingPlansView
from community.views import CommunityCreationView, LikeCreationView, RAGSearchView
from generation.views import (
    AudioVoiceoverView,
    ImageGenerateView,
    MarketingCopyView,
    StoryboardView,
    TaskDetailView,
    TaskQueueView,
    WorkflowNodeRetryView,
    WorkflowRunView,
)
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
    WorkspaceBootstrapView,
    WorkspaceDraftCollectionView,
    WorkspaceDraftDetailView,
    WorkspaceView,
)

__all__ = [
    'AIConfigView',
    'AnalyticsDashboardView',
    'AudioVoiceoverView',
    'BillingPlansView',
    'CampaignCollectionView',
    'CampaignDetailView',
    'FolderCollectionView',
    'FolderDetailView',
    'CommunityCreationView',
    'ImageGenerateView',
    'LikeCreationView',
    'LoginView',
    'MarketingCopyView',
    'ProjectCollectionView',
    'ProjectDetailView',
    'RAGSearchView',
    'StoryboardView',
    'TaskDetailView',
    'TaskQueueView',
    'WorkflowNodeRetryView',
    'WorkflowRunView',
    'WorkflowTemplateCollectionView',
    'WorkflowTemplateForkView',
    'WorkspaceBootstrapView',
    'WorkspaceDraftCollectionView',
    'WorkspaceDraftDetailView',
    'WorkspaceView',
]
