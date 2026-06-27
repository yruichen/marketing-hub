from django.urls import path

from community.views import CommunityCreationView, CommunityModerationView, CommunityReportView, LikeCreationView, RAGSearchView


urlpatterns = [
    path('community/creations/', CommunityCreationView.as_view(), name='community_creations'),
    path('community/creations/<int:pk>/like/', LikeCreationView.as_view(), name='like_creation'),
    path('community/creations/<int:pk>/report/', CommunityReportView.as_view(), name='report_creation'),
    path('community/creations/<int:pk>/moderate/', CommunityModerationView.as_view(), name='moderate_creation'),
    path('community/search/', RAGSearchView.as_view(), name='rag_search'),
]
