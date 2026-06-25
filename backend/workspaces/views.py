"""Compatibility facade for workspace API views.

View classes are grouped under ``workspaces.view_modules`` to reduce merge
conflicts and keep each resource area independently maintainable.
"""

from workspaces.view_modules.analytics import AnalyticsDashboardView
from workspaces.view_modules.assets import WorkspaceAssetDetailView, WorkspaceAssetsView
from workspaces.view_modules.campaigns import (
    CampaignCollectionView,
    CampaignDetailView,
    WorkflowTemplateCollectionView,
    WorkflowTemplateForkView,
    WorkspaceDraftCollectionView,
    WorkspaceDraftDetailView,
)
from workspaces.view_modules.projects import (
    FolderCollectionView,
    FolderDetailView,
    ProjectCollectionView,
    ProjectDetailView,
)
from workspaces.view_modules.workspace import WorkspaceBootstrapView, WorkspaceView

__all__ = [
    'AnalyticsDashboardView',
    'CampaignCollectionView',
    'CampaignDetailView',
    'FolderCollectionView',
    'FolderDetailView',
    'ProjectCollectionView',
    'ProjectDetailView',
    'WorkflowTemplateCollectionView',
    'WorkflowTemplateForkView',
    'WorkspaceAssetDetailView',
    'WorkspaceAssetsView',
    'WorkspaceBootstrapView',
    'WorkspaceDraftCollectionView',
    'WorkspaceDraftDetailView',
    'WorkspaceView',
]
