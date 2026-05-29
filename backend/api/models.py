from django.db import models
import json

class AIConfiguration(models.Model):
    PROVIDER_CHOICES = [
        ('mock', 'Mock Sandbox Simulator'),
        ('gemini', 'Google Gemini API'),
        ('openai', 'OpenAI API'),
    ]
    
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default='mock')
    api_key = models.CharField(max_length=255, blank=True, default='')
    base_url = models.CharField(max_length=255, blank=True, default='')
    model_name = models.CharField(max_length=100, blank=True, default='')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_provider_display()} ({self.model_name or 'Default Model'})"


class CommunityCreation(models.Model):
    CREATION_TYPES = [
        ('copy', 'Marketing Copywriting'),
        ('image', 'Social Media Image'),
        ('storyboard', 'Storyboard Script'),
        ('audio', 'AI Voiceover'),
    ]
    
    username = models.CharField(max_length=100, default='ROOT')
    creation_type = models.CharField(max_length=20, choices=CREATION_TYPES)
    title = models.CharField(max_length=255)
    content = models.TextField(help_text="JSON-serialized creation details")
    image_url = models.CharField(max_length=500, blank=True, default='')
    audio_url = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    likes = models.IntegerField(default=0)
    rag_indexed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.get_creation_type_display()}] {self.title} by {self.username}"

    def get_content_dict(self):
        try:
            return json.loads(self.content)
        except Exception:
            return {}
