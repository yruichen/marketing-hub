from django.urls import path

from accounts.views import LoginView, MembershipCollectionView, MembershipDetailView


urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='auth_login'),
    path('memberships/', MembershipCollectionView.as_view(), name='membership_collection'),
    path('memberships/<int:pk>/', MembershipDetailView.as_view(), name='membership_detail'),
]
