from django.urls import path
from .views import MarketingCopyView, ImageGenerateView, StoryboardView, AudioVoiceoverView

urlpatterns = [
    path('generate/copy/', MarketingCopyView.as_view(), name='generate_copy'),
    path('generate/image/', ImageGenerateView.as_view(), name='generate_image'),
    path('generate/storyboard/', StoryboardView.as_view(), name='generate_storyboard'),
    path('generate/audio/', AudioVoiceoverView.as_view(), name='generate_audio'),
]
