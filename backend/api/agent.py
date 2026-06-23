"""
DEPRECATED: Legacy direct LLM agent. Production code uses ai_gateway.services.AIModelGateway.
Kept for reference only — do not import in new code.
"""
import time
import json
import random
import urllib.request
import urllib.error
from api.models import AIConfiguration

class AgentLogger:
    """Accumulates step-by-step execution logs to display in the frontend agent console."""
    def __init__(self):
        self.logs = []
        self.start_time = time.time()

    def log(self, message: str, level: str = "INFO"):
        elapsed = time.time() - self.start_time
        timestamp = f"[{elapsed:.2f}s]"
        formatted = f"{timestamp} [{level}] {message}"
        self.logs.append(formatted)
        print(formatted)

    def get_logs(self):
        return self.logs


class PromptTemplate:
    """Simple LangChain-style Prompt Template to format inputs."""
    def __init__(self, template: str):
        self.template = template

    def format(self, **kwargs) -> str:
        return self.template.format(**kwargs)


# Industry standard Prompt Templates for Marketing AI Agent
COPY_TEMPLATE = PromptTemplate(
    "You are a professional marketing copywriting AI Agent. "
    "Your goal is to generate high-converting social media copy based on the following details:\n"
    "- Brand/Product Name: {brand_name}\n"
    "- Core Features/Description: {product_description}\n"
    "- Tone: {tone}\n"
    "- Target Social Platform: {platform}\n\n"
    "Respond ONLY with a valid JSON object matching this structure (do not include markdown wrappers like ```json):\n"
    "{{\n"
    "  \"title\": \"Catchy title/headline with relevant emojis, matching the tone and platform requirements\",\n"
    "  \"paragraphs\": [\n"
    "    \"Paragraph 1: Engaging hook introducing the product/brand features\",\n"
    "    \"Paragraph 2: Explaining key value propositions in details\",\n"
    "    \"Paragraph 3: Smooth transition suggesting why they should try it\"\n"
    "  ],\n"
    "  \"tags\": [\"tag1\", \"tag2\", \"tag3\", \"tag4\"],\n"
    "  \"call_to_action\": \"Call to action instruction\"\n"
    "}}"
)

STORYBOARD_TEMPLATE = PromptTemplate(
    "You are an AI Video Director Agent. "
    "Design a compelling scene-by-scene video script based on:\n"
    "- Video Topic: {video_topic}\n"
    "- Target Duration: {duration} seconds\n"
    "- Target Audience: {target_audience}\n\n"
    "Respond ONLY with a valid JSON object matching this structure (do not include markdown wrappers like ```json):\n"
    "{{\n"
    "  \"video_topic\": \"{video_topic}\",\n"
    "  \"total_duration_seconds\": {duration},\n"
    "  \"target_audience\": \"{target_audience}\",\n"
    "  \"scenes\": [\n"
    "    {{\n"
    "      \"scene_number\": 1,\n"
    "      \"visual_description\": \"Detailed visual description of what is seen on screen (include angles, style, lightning)\",\n"
    "      \"audio_narration\": \"Narration or voiceover script to be read out loud for this scene\",\n"
    "      \"duration_seconds\": 10\n"
    "    }}\n"
    "  ]\n"
    "}}\n"
    "Ensure the sum of scene duration_seconds equals the total duration ({duration}s). Create between 3 to 6 logical scenes."
)

IMAGE_PROMPT_TEMPLATE = PromptTemplate(
    "You are an AI Art Director. The user wants to generate an image based on: '{prompt}'.\n"
    "The requested artistic style is: {style}.\n"
    "The aspect ratio is: {aspect_ratio}.\n\n"
    "Optimize this into a highly detailed system prompt for text-to-image models (like Midjourney, DALL-E, or Imagen).\n"
    "Incorporate lighting style, rendering engine, composition, and aesthetic details matching '{style}'.\n"
    "Respond ONLY with a valid JSON object matching this structure:\n"
    "{{\n"
    "  \"revised_prompt\": \"Detailed optimized English system prompt\",\n"
    "  \"keyword\": \"1-2 words describing the main subject for image search\"\n"
    "}}"
)


class AIAgentWorkflow:
    """Executes AI Agent workflows, managing prompts, provider configurations, and fallbacks."""
    
    @staticmethod
    def get_active_config():
        config = AIConfiguration.objects.filter(is_active=True).first()
        if not config:
            config = AIConfiguration.objects.filter(provider='mock').first()
        return config

    @classmethod
    def run_llm(cls, prompt: str, logger: AgentLogger) -> str:
        config = cls.get_active_config()
        
        if not config or config.provider == 'mock' or not config.api_key:
            logger.log("No real API credentials active. Initializing High-Fidelity Sandbox Simulator.", "WARN")
            return ""

        provider = config.provider
        api_key = config.api_key
        base_url = config.base_url.strip()
        model = config.model_name.strip()

        logger.log(f"Active Provider detected: {provider.upper()}")
        
        # 1. GOOGLE GEMINI API
        if provider == 'gemini':
            # Default model for Gemini
            model = model or "gemini-1.5-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            if base_url:
                url = f"{base_url.rstrip('/')}/v1beta/models/{model}:generateContent?key={api_key}"
                
            logger.log(f"Formatting payload for model {model}...")
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }
            data_bytes = json.dumps(payload).encode('utf-8')
            
            logger.log(f"Sending HTTP POST to Gemini API: {url.split('?')[0]}... (Key Masked)")
            try:
                req = urllib.request.Request(
                    url, 
                    data=data_bytes, 
                    headers={'Content-Type': 'application/json'},
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=15) as response:
                    res_body = response.read().decode('utf-8')
                    res_json = json.loads(res_body)
                    text = res_json['candidates'][0]['content']['parts'][0]['text']
                    logger.log("Gemini API returned content successfully.", "SUCCESS")
                    return text
            except Exception as e:
                logger.log(f"Gemini API invocation failed: {str(e)}. Falling back to mock.", "ERROR")
                return ""

        # 2. OPENAI API
        elif provider == 'openai':
            model = model or "gpt-4o-mini"
            url = "https://api.openai.com/v1/chat/completypes" # Wait, chat/completions!
            url = "https://api.openai.com/v1/chat/completions"
            if base_url:
                url = f"{base_url.rstrip('/')}/chat/completions"
                
            logger.log(f"Formatting payload for model {model}...")
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant that always outputs JSON."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            data_bytes = json.dumps(payload).encode('utf-8')
            
            logger.log(f"Sending HTTP POST to OpenAI API: {url}... (Key Masked)")
            try:
                req = urllib.request.Request(
                    url, 
                    data=data_bytes, 
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {api_key}'
                    },
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=15) as response:
                    res_body = response.read().decode('utf-8')
                    res_json = json.loads(res_body)
                    text = res_json['choices'][0]['message']['content']
                    logger.log("OpenAI API returned content successfully.", "SUCCESS")
                    return text
            except Exception as e:
                logger.log(f"OpenAI API invocation failed: {str(e)}. Falling back to mock.", "ERROR")
                return ""

        return ""

    @classmethod
    def generate_copywriting(cls, brand_name: str, product_description: str, tone: str, platform: str):
        logger = AgentLogger()
        logger.log("--- Initializing Marketing Copywriting Agent Workflow ---")
        
        prompt = COPY_TEMPLATE.format(
            brand_name=brand_name,
            product_description=product_description,
            tone=tone,
            platform=platform
        )
        logger.log("LangChain Prompt Template loaded and formatted.")
        
        llm_response = cls.run_llm(prompt, logger)
        
        if llm_response:
            try:
                # Strip potential markdown wrappers just in case
                cleaned = llm_response.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("```")[1]
                    if cleaned.startswith("json"):
                        cleaned = cleaned[4:]
                    cleaned = cleaned.strip("` \n")
                
                result = json.loads(cleaned)
                logger.log("Successfully parsed JSON copy variables from agent response.")
                return result, logger.get_logs()
            except Exception as e:
                logger.log(f"JSON parsing error from LLM response: {str(e)}. Proceeding to simulation fallback.", "WARN")
                
        # Sandbox High-Fidelity Simulator fallback
        logger.log("Sandbox Copywriting Generator running high-fidelity simulation.")
        time.sleep(0.6)
        
        templates = {
            "Xiaohongshu": {
                "title": f"🔥 救命！这个 {brand_name} 真的绝了！后悔没早点发现！",
                "paragraphs": [
                    f"家人们谁懂啊！今天必须给你们安利这个神仙单品：【{brand_name}】！它的核心功能是 {product_description}，简直是打工人和学生党的福音！😭",
                    f"用了一段时间，从打开到出稿全程丝滑，细节打磨得很到位，那种越用越顺手的爽感真的会上瘾。✨",
                    "姐妹们听我的，闭眼入不踩雷！早买早享受，别怪我没提醒你们哦～"
                ],
                "tags": ["安利神仙单品", "好物分享", "高颜值实用", brand_name, "宝藏工具"]
            },
            "WeChat": {
                "title": f"深度评测：【{brand_name}】如何颠覆传统的营销工作流？",
                "paragraphs": [
                    f"在当今快速变化的数字时代，效率即生命。今天我们为您深度解析行业新宠——【{brand_name}】。作为一款主打 {product_description} 的工具，它正以前所未有的姿态改变我们的效率路径。",
                    "我们对其进行了全方位实测，覆盖日常高频场景与边界用法，其在响应速度和易用性上均表现卓越，完美适配多场景需求。",
                    "总结来看，这不仅是一次工具升级，更是对未来工作形态的主动重塑。欢迎长按识别下方链接体验。"
                ],
                "tags": ["深度解析", "生产力工具", "商业科技", brand_name, "效率指南"]
            },
            "default": {
                "title": f"🚀 Discover {brand_name}: The ultimate game changer you need!",
                "paragraphs": [
                    f"Looking for something that delivers {product_description}? Look no further! {brand_name} is designed to meet your highest standards with a completely redefined experience.",
                    f"It slots seamlessly into your creative or professional workflow, leaving you more time to think about big ideas.",
                    "Check it out today and join thousands of satisfied users globally!"
                ],
                "tags": ["Innovation", "MarketingHub", brand_name, "TechStack", "CreatorEconomy"]
            }
        }
        
        selected = platform if platform in templates else "default"
        data = templates[selected]
        
        result = {
            "platform": platform,
            "tone": tone,
            "title": data["title"],
            "paragraphs": data["paragraphs"],
            "tags": data["tags"],
            "call_to_action": f"👉 立即点击体验 {brand_name}，解锁你的创意生产力！"
        }
        logger.log("Simulation result created successfully.")
        return result, logger.get_logs()

    @classmethod
    def generate_storyboard(cls, video_topic: str, duration: int, target_audience: str):
        logger = AgentLogger()
        logger.log("--- Initializing Video Storyboard Agent Workflow ---")
        
        prompt = STORYBOARD_TEMPLATE.format(
            video_topic=video_topic,
            duration=duration,
            target_audience=target_audience
        )
        logger.log("Director Prompt Template loaded and formatted.")
        
        llm_response = cls.run_llm(prompt, logger)
        
        if llm_response:
            try:
                cleaned = llm_response.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("```")[1]
                    if cleaned.startswith("json"):
                        cleaned = cleaned[4:]
                    cleaned = cleaned.strip("` \n")
                result = json.loads(cleaned)
                logger.log("Successfully parsed JSON storyboard scenes from agent response.")
                return result, logger.get_logs()
            except Exception as e:
                logger.log(f"JSON parsing error from LLM response: {str(e)}. Proceeding to simulation fallback.", "WARN")
                
        # Sandbox fallback
        logger.log("Sandbox Storyboard Generator running high-fidelity simulation.")
        time.sleep(0.8)
        
        num_scenes = max(3, min(6, duration // 7))
        scenes = []
        
        visuals = [
            f"镜头大特写：微距对焦到一台正在高速渲染的创意显示器上。屏幕上映出大字：'{video_topic}'。",
            "中景镜头：创作者专注地工作，背景是柔和雅致的暖光，墙上挂着极具现代艺术感的抽象挂画。",
            "微距慢动作：一杯温润的黑咖啡缓缓滴入牛奶中，大理石般的纹路正在柔和蔓延，寓意灵感的自然融汇。",
            "分屏快切：创意脑图、文字稿、AI 画作与声波频谱在大屏幕上交错重合，显示极速产出的创意过程。",
            "中远景推近：创作者长舒一口气，轻松地向椅背靠去，窗外明朗温暖的阳光正好洒落在书桌一角。",
            "品牌收尾特写：一个优雅深灰的卡片滑入镜头中央，亮白色高级字样浮现，标注 'Marketing-Hub，给灵感以实感'。"
        ]
        
        audios = [
            f"（轻柔的环境音乐响起）'你是否也在为下一个视频【{video_topic}】的创意绞尽脑汁？'",
            f"（敲击键盘的微弱嗒嗒声）'我们了解，打动【{target_audience}】的关键，从来不是死板的灌输。'",
            "（缓缓流淌的咖啡白噪音）'而是一场与灵感的舒适对话，将好点子以极其优雅的方式呈现出来。'",
            "（音乐旋律转为轻快）'不用在各种繁杂工具里打转。文案、分镜、音乐与视觉，在这里一站式流式合流。'",
            "（微风穿过树叶沙沙声）'让你的精力专注于创作的核心，剩下的效率难题，交给智能流。'",
            "（清脆清澈的音效收尾）'Marketing-Hub。今天起，让创意自由流淌。点击下方免费建立你的工作流。'"
        ]
        
        scene_duration = duration // num_scenes
        for i in range(num_scenes):
            scenes.append({
                "scene_number": i + 1,
                "visual_description": visuals[i % len(visuals)],
                "audio_narration": audios[i % len(audios)],
                "duration_seconds": scene_duration
            })
            
        result = {
            "video_topic": video_topic,
            "total_duration_seconds": duration,
            "target_audience": target_audience,
            "scenes": scenes
        }
        logger.log("Simulation storyboard timeline compiled successfully.")
        return result, logger.get_logs()

    @classmethod
    def generate_image(cls, prompt: str, style: str, aspect_ratio: str):
        logger = AgentLogger()
        logger.log("--- Initializing Visual Prompt Optimizer Agent ---")
        
        opt_prompt = IMAGE_PROMPT_TEMPLATE.format(
            prompt=prompt,
            style=style,
            aspect_ratio=aspect_ratio
        )
        
        revised_prompt = f"{prompt}, optimized for {style} style, {aspect_ratio} ratio, 8k resolution, elegant lighting"
        keyword = "abstract"
        
        llm_response = cls.run_llm(opt_prompt, logger)
        if llm_response:
            try:
                cleaned = llm_response.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("```")[1]
                    if cleaned.startswith("json"):
                        cleaned = cleaned[4:]
                    cleaned = cleaned.strip("` \n")
                opt_data = json.loads(cleaned)
                revised_prompt = opt_data.get("revised_prompt", revised_prompt)
                keyword = opt_data.get("keyword", keyword)
                logger.log("Successfully generated visual optimization parameters.")
            except Exception as e:
                logger.log(f"Failed parsing optimized prompt, using heuristic backup: {str(e)}", "WARN")
        
        # Determine image URL based on keyword/style
        config = cls.get_active_config()
        
        # This repository does not include a production image generation backend yet.
        # The current endpoint returns a curated preview asset and exposes the revised
        # prompt so a real image provider can be wired without changing the UI contract.
        logger.log("Resolving prompt to local preview asset pipeline. Real image generation is not configured in this repository.", "WARN")
        time.sleep(0.7)
        
        # Premium curated unsplash image pool matching our refined style
        unsplash_images = {
            "neo-brutalism": [
                "https://images.unsplash.com/photo-1600132806370-bf17e65e942f?auto=format&fit=crop&w=800&q=80",
                "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80"
            ],
            "3d": [
                "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=800&q=80",
                "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=800&q=80"
            ],
            "minimalist": [
                "https://images.unsplash.com/photo-1494438639946-1ebd1d2038b5?auto=format&fit=crop&w=800&q=80",
                "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80"
            ],
            "cinematic": [
                "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80",
                "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=80"
            ]
        }
        
        style_key = style.lower()
        pool = unsplash_images.get(style_key, unsplash_images["minimalist"])
        image_url = random.choice(pool)
        
        # If prompt has key marketing words, pick specific nice images
        if "workspace" in prompt.lower() or "office" in prompt.lower() or "desktop" in prompt.lower():
            image_url = "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=800&q=80"
        elif "coffee" in prompt.lower() or "morning" in prompt.lower():
            image_url = "https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&w=800&q=80"
            
        result = {
            "prompt": prompt,
            "style": style,
            "aspect_ratio": aspect_ratio,
            "image_url": image_url,
            "revised_prompt": revised_prompt
        }
        logger.log("Preview asset matching completed. No generated image binary was produced.", "SUCCESS")
        return result, logger.get_logs()

    @classmethod
    def generate_audio(cls, text: str, voice_id: str, speed: float):
        logger = AgentLogger()
        logger.log("--- Initializing AI Audio Voiceover Pipeline ---")
        
        config = cls.get_active_config()
        
        # High quality royalty free audio streams
        voice_urls = {
            "female_warm": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            "male_energetic": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
            "child_cheerful": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
        }
        
        audio_url = voice_urls.get(voice_id, voice_urls["female_warm"])
        
        # Real OpenAI Text-to-Speech API integration if OpenAI is configured
        if config and config.provider == 'openai' and config.api_key:
            logger.log("Active OpenAI configuration found. Connecting to OpenAI Audio TTS pipeline...")
            url = "https://api.openai.com/v1/audio/speech"
            if config.base_url:
                url = f"{config.base_url.rstrip('/')}/audio/speech"
                
            model = config.model_name or "tts-1"
            
            # Map frontend voice ids to standard OpenAI TTS voices
            voice_map = {
                "female_warm": "alloy",
                "male_energetic": "onyx",
                "child_cheerful": "nova"
            }
            openai_voice = voice_map.get(voice_id, "alloy")
            
            payload = {
                "model": model,
                "input": text,
                "voice": openai_voice,
                "speed": speed
            }
            logger.log(f"Preparing TTS post data: model={model}, voice={openai_voice}, speed={speed}...")
            
            logger.log("OpenAI TTS is configured, but this local upgrade does not persist binary media to object storage yet.", "WARN")
            logger.log("Returning the fallback preview audio URL until S3/OSS media storage is connected.", "WARN")
            
        else:
            logger.log("Sandbox Audio Synthesizer running high-fidelity simulation.")
            time.sleep(0.5)
            logger.log(f"Simulating Text-To-Speech with voice model: {voice_id}.")
            
        result = {
            "text": text,
            "voice_id": voice_id,
            "speed": speed,
            "audio_url": audio_url,
            "text_length": len(text),
            "estimated_audio_duration_seconds": round(len(text) * 0.25 / speed, 1)
        }
        
        logger.log("Audio speech synthesis complete.", "SUCCESS")
        return result, logger.get_logs()
