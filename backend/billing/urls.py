from django.urls import path

from billing.views import BillingPlansView


urlpatterns = [
    path('billing/plans/', BillingPlansView.as_view(), name='billing_plans'),
]

