from django.urls import path

from billing.views import BillingPlansView, EnterpriseContactRequestView, ProInviteRedeemView


urlpatterns = [
    path('billing/plans/', BillingPlansView.as_view(), name='billing_plans'),
    path('billing/redeem-pro-invite/', ProInviteRedeemView.as_view(), name='billing_redeem_pro_invite'),
    path('billing/enterprise-requests/', EnterpriseContactRequestView.as_view(), name='billing_enterprise_requests'),
]
