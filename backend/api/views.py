import time
import random
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

# Custom high-fidelity mock data generators for MVP

def mock_copywriting(brand, desc, tone, platform):
    templates = {
      "Xiaohongshu": {
        "titles": [
          f"🔥 救命！这个 {brand} 真的绝了！后悔没早点发现！",
          f"✨ 扒一扒：为什么创作者都在偷偷用这个 {brand}？",
          f"🎒 纯干货！{brand} 到底值不值得入？实测公开！"
        ],
        "paragraphs": [
          f"家人们谁懂啊！今天必须给你们安利这个神仙单品/服务：【{brand}】！它的核心功能是 {desc}，简直是打工人和学生党的福音！",
          f"用了一段时间，感觉整个工作流都顺畅了！在 {tone} 的风格调校下，操作起来非常有仪式感，幸福感直接拉满。😭",
          "姐妹们听我的，闭眼入不踩雷！早买早享受，别怪我没提醒你们哦～"
        ],
        "tags": ["安利神仙单品", "好物分享", "高颜值实用", brand, "宝藏工具"]
      },
      "WeChat": {
        "titles": [
          f"深度评测：【{brand}】如何颠覆传统的营销工作流？",
          f"效率翻倍！让 {brand} 成为你口袋里的超级生产力工具"
        ],
        "paragraphs": [
          f"在当今快速变化的数字时代，效率即生命。今天我们为您深度解析行业新宠——【{brand}】。作为一款主打 {desc} 的工具，它正以前所未有的姿态改变我们的效率路径。",
          f"我们采用了 {tone} 的态度对该系统进行了长达两周的压力测试。实测结果表明，其在响应速度和易用性上均表现卓越。",
          "总结来看，这不仅是一次工具升级，更是对未来工作形态的主动重塑。欢迎长按识别下方链接体验。"
        ],
        "tags": ["深度解析", "生产力工具", "商业科技", brand, "效率指南"]
      },
      "default": {
        "titles": [
          f"🚀 Discover {brand}: The ultimate game changer you need!",
          f"Why {brand} is trending in marketing right now"
        ],
        "paragraphs": [
          f"Looking for something that delivers {desc}? Look no further! {brand} is designed to meet your highest standards with a completely redefined experience.",
          f"Engineered with a focus on {tone} values, it perfectly fits into your creative or professional workflow, leaving you more time to think about big ideas.",
          "Check it out today and join thousands of satisfied users globally!"
        ],
        "tags": ["Innovation", "MarketingHub", brand, "TechStack", "CreatorEconomy"]
      }
    }
    
    selected_platform = platform if platform in templates else "default"
    t_data = templates[selected_platform]
    
    return {
      "platform": platform,
      "tone": tone,
      "title": random.choice(t_data["titles"]),
      "paragraphs": t_data["paragraphs"],
      "tags": t_data["tags"],
      "call_to_action": f"👉 立即点击体验 {brand}，解锁你的创意生产力！"
    }

class MarketingCopyView(APIView):
    def post(self, request):
        brand_name = request.data.get("brand_name", "Marketing-Hub")
        product_desc = request.data.get("product_description", "AI 营销场景全能助手")
        tone = request.data.get("tone", "活泼")
        platform = request.data.get("platform", "Xiaohongshu")
        
        # Simulate slight network delay
        time.sleep(0.5)
        
        result = mock_copywriting(brand_name, product_desc, tone, platform)
        return Response(result, status=status.HTTP_200_OK)

class ImageGenerateView(APIView):
    def post(self, request):
        prompt = request.data.get("prompt", "A creative workspace with vibrant colors")
        aspect_ratio = request.data.get("aspect_ratio", "16:9")
        style = request.data.get("style", "neo-brutalism")
        
        time.sleep(1.0) # Simulate image generation
        
        # High quality placeholder image urls from Unsplash with matching keywords
        keywords = {
          "neo-brutalism": "abstract-brutalism",
          "3d": "3d-render",
          "minimalist": "minimalist-design",
          "cinematic": "cinematic-photography"
        }
        kw = keywords.get(style.lower(), "abstract")
        
        # Neon colors matching keywords
        img_id = random.randint(100, 999)
        mock_image_url = f"https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80"
        
        if "cyber" in prompt.lower() or "neon" in prompt.lower():
            mock_image_url = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80"
        elif "retro" in prompt.lower() or style == "neo-brutalism":
            mock_image_url = "https://images.unsplash.com/photo-1600132806370-bf17e65e942f?auto=format&fit=crop&w=800&q=80"
            
        return Response({
          "prompt": prompt,
          "style": style,
          "aspect_ratio": aspect_ratio,
          "image_url": mock_image_url,
          "revised_prompt": f"{prompt}, styled in {style} aesthetic, high contrast bold outlines, hyper-detailed render, {aspect_ratio} aspect ratio"
        }, status=status.HTTP_200_OK)

class StoryboardView(APIView):
    def post(self, request):
        video_topic = request.data.get("video_topic", "Coffee Shop Morning")
        duration = int(request.data.get("duration", 30))
        target_audience = request.data.get("target_audience", "Young creators")
        
        time.sleep(1.2)
        
        # Calculate number of scenes based on duration (roughly 5-10s per scene)
        num_scenes = max(3, min(6, duration // 7))
        scenes = []
        
        visuals = [
          "镜头大特写：一杯黑咖啡缓缓倒入燕麦奶，拉出完美的黑白渐变大理石纹路。",
          "中景镜头：主角坐在一张高饱和黄色（新粗野主义风格）的工作台前，神色专注地敲击机械键盘。",
          "近景仰拍：工作台上的复古沙漏正在缓缓倒沙，光影穿透沙粒照在主角脸侧。",
          "转场/快切：各种色彩斑斓的文案稿、配音音波图、以及生成的画作在背景中高速闪过。",
          "全景拉远：主角放松地靠在椅背上，面带笑容朝窗外看去，阳光洒满整个创意空间。",
          "终极特写：黑色极简卡片缓缓滑入屏幕，中央带有粗黑的'Marketing-Hub'黄色高亮字体。"
        ]
        
        audios = [
          "（配音伴随轻柔的爵士白噪音）'清晨的第一缕阳光，和一杯让你创意大开的香浓拿铁。'",
          "（键盘敲击声淡入）'每一个闪光的文案，每一张惊艳的社媒图，都不应该耗费你整晚的精力。'",
          "（清脆的秒针嘀嗒声）'在这个极速运转的时代，你的好点子需要被更有效率地实现。'",
          "（激昂的电子乐切入）'无需跨越多个平台。文案、图片、分镜头、配音，一键流式产出。'",
          "（轻笑，轻松的白噪音）'让灵感自由呼吸，让创作变得轻松、爽快而又独具个性。'",
          "（清脆的卡片敲击声）'Marketing-Hub，创作者的物理灵感加速器。免费体验链接见下方。'"
        ]
        
        for i in range(num_scenes):
            scenes.append({
              "scene_number": i + 1,
              "visual_description": visuals[i % len(visuals)],
              "audio_narration": audios[i % len(audios)],
              "duration_seconds": duration // num_scenes
            })
            
        return Response({
          "video_topic": video_topic,
          "total_duration_seconds": duration,
          "target_audience": target_audience,
          "scenes": scenes
        }, status=status.HTTP_200_OK)

class AudioVoiceoverView(APIView):
    def post(self, request):
        text = request.data.get("text", "欢迎使用 Marketing Hub AI 一站式营销场景配音助手")
        voice_id = request.data.get("voice_id", "female_warm")
        speed = float(request.data.get("speed", 1.0))
        
        time.sleep(0.8)
        
        # Audio assets
        voice_urls = {
          "female_warm": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          "male_energetic": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
          "child_cheerful": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
        }
        
        return Response({
          "text": text,
          "voice_id": voice_id,
          "speed": speed,
          "audio_url": voice_urls.get(voice_id, voice_urls["female_warm"]),
          "text_length": len(text),
          "estimated_audio_duration_seconds": round(len(text) * 0.25 / speed, 2)
        }, status=status.HTTP_200_OK)
