from django.urls import include, path
from rest_framework.schemas import get_schema_view

from api.admin_console import (
    AdminAuditLogListView,
    AdminCreditGrantView,
    AdminInviteListCreateView,
    AdminOrganizationDetailView,
    AdminOrganizationListView,
    AdminSecurityEventListView,
    AdminSummaryView,
    AdminTaskListView,
    AdminUserActionView,
    AdminUserCreditGrantView,
    AdminUserDetailView,
    AdminUserListView,
)

urlpatterns = [
    path('schema/', get_schema_view(title='Marketing Hub API', version='1.0.0'), name='openapi_schema'),
    path('admin-console/summary/', AdminSummaryView.as_view(), name='admin_console_summary'),
    path('admin-console/users/', AdminUserListView.as_view(), name='admin_console_users'),
    path('admin-console/users/<int:pk>/', AdminUserDetailView.as_view(), name='admin_console_user_detail'),
    path('admin-console/users/<int:pk>/actions/<str:action>/', AdminUserActionView.as_view(), name='admin_console_user_action'),
    path('admin-console/users/<int:pk>/credit-grants/', AdminUserCreditGrantView.as_view(), name='admin_console_user_credit_grant'),
    path('admin-console/organizations/', AdminOrganizationListView.as_view(), name='admin_console_organizations'),
    path('admin-console/organizations/<int:pk>/', AdminOrganizationDetailView.as_view(), name='admin_console_organization_detail'),
    path('admin-console/organizations/<int:pk>/credits/', AdminCreditGrantView.as_view(), name='admin_console_credit_grant'),
    path('admin-console/invites/', AdminInviteListCreateView.as_view(), name='admin_console_invites'),
    path('admin-console/tasks/', AdminTaskListView.as_view(), name='admin_console_tasks'),
    path('admin-console/audit-logs/', AdminAuditLogListView.as_view(), name='admin_console_audit_logs'),
    path('admin-console/security-events/', AdminSecurityEventListView.as_view(), name='admin_console_security_events'),
    path('', include('accounts.urls')),
    path('', include('workspaces.urls')),
    path('', include('generation.urls')),
    path('', include('community.urls')),
    path('', include('ai_gateway.urls')),
    path('', include('billing.urls')),
]
