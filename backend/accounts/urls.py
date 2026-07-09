from django.urls import path

from accounts.views import (
    AdminLoginView,
    AuthMeView,
    CsrfTokenView,
    LoginView,
    LogoutView,
    MembershipCollectionView,
    MembershipDetailView,
    MyFollowingListView,
    MyProfileCreationView,
    MyProfileView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileFollowView,
    ProfileRelationListView,
    PublicProfileView,
    RegisterView,
    ResendVerificationView,
    VerifyEmailView,
)


urlpatterns = [
    path('auth/csrf/', CsrfTokenView.as_view(), name='auth_csrf'),
    path('auth/me/', AuthMeView.as_view(), name='auth_me'),
    path('auth/login/', LoginView.as_view(), name='auth_login'),
    path('admin-auth/login/', AdminLoginView.as_view(), name='admin_auth_login'),
    path('auth/logout/', LogoutView.as_view(), name='auth_logout'),
    path('auth/register/', RegisterView.as_view(), name='auth_register'),
    path('auth/email/verify/', VerifyEmailView.as_view(), name='auth_email_verify'),
    path('auth/email/resend/', ResendVerificationView.as_view(), name='auth_email_resend'),
    path('auth/password-reset/request/', PasswordResetRequestView.as_view(), name='auth_password_reset_request'),
    path('auth/password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth_password_reset_confirm'),
    path('profiles/me/', MyProfileView.as_view(), name='profile_me'),
    path('profiles/me/following/', MyFollowingListView.as_view(), name='profile_me_following'),
    path('profiles/me/creations/<int:pk>/', MyProfileCreationView.as_view(), name='profile_creation'),
    path('profiles/<str:username>/follow/', ProfileFollowView.as_view(), name='profile_follow'),
    path('profiles/<str:username>/<str:relation>/', ProfileRelationListView.as_view(), name='profile_relations'),
    path('profiles/<str:username>/', PublicProfileView.as_view(), name='profile_public'),
    path('memberships/', MembershipCollectionView.as_view(), name='membership_collection'),
    path('memberships/<int:pk>/', MembershipDetailView.as_view(), name='membership_detail'),
]
