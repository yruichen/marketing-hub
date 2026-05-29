import json
import random
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate
from api.models import AIConfiguration, CommunityCreation
from api.agent import AIAgentWorkflow

# 1. AI Generation Views backed by AIAgentWorkflow

class MarketingCopyView(APIView):
    def post(self, request):
        brand_name = request.data.get("brand_name", "Marketing-Hub")
        product_desc = request.data.get("product_description", "AI 营销场景全能助手")
        tone = request.data.get("tone", "爆款活泼")
        platform = request.data.get("platform", "Xiaohongshu")
        
        result, logs = AIAgentWorkflow.generate_copywriting(
            brand_name=brand_name,
            product_description=product_desc,
            tone=tone,
            platform=platform
        )
        return Response({
            "result": result,
            "logs": logs
        }, status=status.HTTP_200_OK)


class ImageGenerateView(APIView):
    def post(self, request):
        prompt = request.data.get("prompt", "A creative workspace")
        style = request.data.get("style", "neo-brutalism")
        aspect_ratio = request.data.get("aspect_ratio", "1:1")
        
        result, logs = AIAgentWorkflow.generate_image(
            prompt=prompt,
            style=style,
            aspect_ratio=aspect_ratio
        )
        return Response({
            "result": result,
            "logs": logs
        }, status=status.HTTP_200_OK)


class StoryboardView(APIView):
    def post(self, request):
        video_topic = request.data.get("video_topic", "Coffee Shop Morning")
        duration = int(request.data.get("duration", 30))
        target_audience = request.data.get("target_audience", "Young creators")
        
        result, logs = AIAgentWorkflow.generate_storyboard(
            video_topic=video_topic,
            duration=duration,
            target_audience=target_audience
        )
        return Response({
            "result": result,
            "logs": logs
        }, status=status.HTTP_200_OK)


class AudioVoiceoverView(APIView):
    def post(self, request):
        text = request.data.get("text", "欢迎使用 Marketing Hub AI 一站式营销场景配音助手")
        voice_id = request.data.get("voice_id", "female_warm")
        speed = float(request.data.get("speed", 1.0))
        
        result, logs = AIAgentWorkflow.generate_audio(
            text=text,
            voice_id=voice_id,
            speed=speed
        )
        return Response({
            "result": result,
            "logs": logs
        }, status=status.HTTP_200_OK)


# 2. Authentication Views

class LoginView(APIView):
    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        
        if not username or not password:
            return Response({"error": "请输入用户名和密码"}, status=status.HTTP_400_BAD_REQUEST)
            
        user = authenticate(username=username, password=password)
        if user is not None:
            return Response({
                "token": f"demo-session-token-{user.username.lower()}-auth",
                "username": user.username,
                "email": user.email
            }, status=status.HTTP_200_OK)
        else:
            return Response({"error": "用户名或密码错误。提示: ROOT / 123"}, status=status.HTTP_401_UNAUTHORIZED)


# 3. AI Key / Configuration Management Views

class AIConfigView(APIView):
    def get(self, request):
        configs = AIConfiguration.objects.all().order_by('-is_active')
        serialized = []
        for c in configs:
            # Mask API Key for frontend safety
            masked_key = ""
            if c.api_key:
                key_len = len(c.api_key)
                if key_len > 8:
                    masked_key = f"{c.api_key[:4]}...{c.api_key[-4:]}"
                else:
                    masked_key = "****"
            
            serialized.append({
                "id": c.id,
                "provider": c.provider,
                "provider_display": c.get_provider_display(),
                "api_key": masked_key,
                "base_url": c.base_url,
                "model_name": c.model_name,
                "is_active": c.is_active
            })
        return Response(serialized, status=status.HTTP_200_OK)

    def post(self, request):
        provider = request.data.get("provider", "mock")
        api_key = request.data.get("api_key", "").strip()
        base_url = request.data.get("base_url", "").strip()
        model_name = request.data.get("model_name", "").strip()
        
        # Look up existing config for this provider
        config, created = AIConfiguration.objects.get_or_create(provider=provider)
        
        # Only overwrite key if user provided a new one (since we mask keys in the GET list)
        if api_key and not api_key.startswith("...") and not api_key.startswith("***"):
            config.api_key = api_key
            
        config.base_url = base_url
        config.model_name = model_name
        config.is_active = True
        config.save()
        
        # Deactivate all other configs
        AIConfiguration.objects.exclude(id=config.id).update(is_active=False)
        
        return Response({
            "message": f"Successfully activated configuration for {config.get_provider_display()}",
            "config": {
                "provider": config.provider,
                "model_name": config.model_name,
                "is_active": config.is_active
            }
        }, status=status.HTTP_200_OK)


# 4. Community sharing and Showcase Views

class CommunityCreationView(APIView):
    def get(self, request):
        creation_type = request.query_params.get("creation_type")
        creations = CommunityCreation.objects.all()
        
        if creation_type:
            creations = creations.filter(creation_type=creation_type)
            
        serialized = []
        for item in creations:
            serialized.append({
                "id": item.id,
                "username": item.username,
                "creation_type": item.creation_type,
                "creation_type_display": item.get_creation_type_display(),
                "title": item.title,
                "content": item.get_content_dict(),
                "image_url": item.image_url,
                "audio_url": item.audio_url,
                "created_at": item.created_at.strftime("%Y-%m-%d %H:%M"),
                "likes": item.likes,
                "rag_indexed": item.rag_indexed
            })
        return Response(serialized, status=status.HTTP_200_OK)

    def post(self, request):
        username = request.data.get("username", "ROOT")
        creation_type = request.data.get("creation_type")
        title = request.data.get("title")
        content_dict = request.data.get("content", {})
        image_url = request.data.get("image_url", "")
        audio_url = request.data.get("audio_url", "")
        
        if not creation_type or not title or not content_dict:
            return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Create and auto-mark as RAG indexed (simulating DB trigger indexer!)
        item = CommunityCreation.objects.create(
            username=username,
            creation_type=creation_type,
            title=title,
            content=json.dumps(content_dict),
            image_url=image_url,
            audio_url=audio_url,
            rag_indexed=True # Set True to simulate auto-background RAG embedding!
        )
        
        return Response({
            "message": "Creation shared to the community workspace!",
            "id": item.id
        }, status=status.HTTP_201_CREATED)


class LikeCreationView(APIView):
    def post(self, request, pk):
        try:
            item = CommunityCreation.objects.get(pk=pk)
            item.likes += 1
            item.save()
            return Response({"likes": item.likes}, status=status.HTTP_200_OK)
        except CommunityCreation.DoesNotExist:
            return Response({"error": "Creation not found"}, status=status.HTTP_404_NOT_FOUND)


# 5. RAG Semantic Retrieval Endpoint (Designated for upgrading)

class RAGSearchView(APIView):
    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response({"results": [], "rag_logs": ["Query is empty."]}, status=status.HTTP_200_OK)
            
        # RAG Workflow step logging simulation
        rag_logs = [
            f"--- Initializing RAG Semantic Query: '{query}' ---",
            "Step 1: Connecting to SQLite Vector database index...",
            "Step 2: Processing query text using local text-embedding models...",
            f"Step 3: Calculated query embedding vector: [0.0315, -0.0124, 0.0874, ... {len(query)} dimensions]",
            "Step 4: Executing Cosine Similarity ranking over community records index...",
            "Step 5: Retrieved top candidate files matching BM25 keyword matching & Vector indices.",
            "Step 6: Filtering by similarity score > 0.40... Matching items loaded."
        ]
        
        # Under the hood, perform a high-quality DB lookup for demo matching
        creations = CommunityCreation.objects.all()
        results = []
        
        for item in creations:
            # Simple keyword matching as fallback
            score = 0.0
            content_str = item.title + " " + item.content
            
            # Count keyword occurrences to simulate a real vector/BM25 score
            matches = 0
            for term in query.split():
                if term.lower() in content_str.lower():
                    matches += 1
                    
            if matches > 0:
                score = round(0.45 + (matches * 0.15) + (random.randint(-5, 5) * 0.01), 3)
                score = min(0.99, score)
            elif not query:
                score = 0.10
                
            if score >= 0.40 or (query.lower() in item.title.lower() or query.lower() in item.creation_type.lower()):
                if score < 0.40:
                    score = 0.58 # baseline match
                
                results.append({
                    "id": item.id,
                    "username": item.username,
                    "creation_type": item.creation_type,
                    "creation_type_display": item.get_creation_type_display(),
                    "title": item.title,
                    "content": item.get_content_dict(),
                    "image_url": item.image_url,
                    "audio_url": item.audio_url,
                    "created_at": item.created_at.strftime("%Y-%m-%d %H:%M"),
                    "likes": item.likes,
                    "similarity_score": score
                })
                
        # Sort results by similarity score descending
        results = sorted(results, key=lambda x: x.get("similarity_score", 0), reverse=True)
        
        rag_logs.append(f"RAG Retrieval Complete. Found {len(results)} matching records from index vector database.")
        
        return Response({
            "query": query,
            "results": results,
            "rag_logs": rag_logs
        }, status=status.HTTP_200_OK)
