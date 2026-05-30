from django.urls import path

from community.views import CommunityCreationView, LikeCreationView, RAGSearchView


urlpatterns = [
    path('community/creations/', CommunityCreationView.as_view(), name='community_creations'),
    path('community/creations/<int:pk>/like/', LikeCreationView.as_view(), name='like_creation'),
    path('community/search/', RAGSearchView.as_view(), name='rag_search'),
]

