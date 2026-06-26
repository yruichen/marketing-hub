from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.validators import URLValidator
from django.core import signing
from django.core.exceptions import ValidationError
from django.db.models import Count, Sum
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.text import slugify
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.email import EmailDeliveryError, send_transactional_email
from api.audit import record_audit_log
from api.models import Campaign, CommunityCreation, Membership, Organization, Project, SecurityEvent, UserProfile
from api.permissions import CanManageOrganization
from api.scope import get_scope
from api.serializers import CommunityCreationSerializer, MembershipSerializer
from api.services import ensure_demo_workspace

EMAIL_VERIFY_SALT = 'marketing-hub-email-verify'
PASSWORD_RESET_SALT = 'marketing-hub-password-reset'
PROFILE_EDITABLE_FIELDS = {
    'display_name',
    'headline',
    'bio',
    'location',
    'website_url',
    'avatar_url',
    'banner_url',
    'specialties',
    'social_links',
    'profile_visibility',
}
PROFILE_TEXT_LIMITS = {
    'display_name': 80,
    'headline': 120,
    'bio': 500,
    'location': 80,
    'website_url': 500,
    'avatar_url': 500,
    'banner_url': 500,
}
PROFILE_URL_FIELDS = {'website_url', 'avatar_url', 'banner_url'}
PROFILE_TYPE_LABELS = {
    'copy': '文案',
    'image': '图片',
    'storyboard': '分镜',
    'audio': '音频',
    'video': '视频',
}


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')) or None


def _record_security_event(request, event_type: str, *, user: User | None = None, email: str = '', risk_level: str = 'low', metadata=None):
    SecurityEvent.objects.create(
        event_type=event_type,
        user=user,
        email=email or (user.email if user else ''),
        ip_address=_client_ip(request),
        user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
        risk_level=risk_level,
        metadata=metadata or {},
    )


def _get_or_create_profile(user: User) -> UserProfile:
    is_seeded_account = user.is_staff or user.username == settings.MARKETING_HUB_DEMO_USERNAME
    defaults = {
        'email_verified': is_seeded_account,
        'status': 'active' if is_seeded_account else 'pending',
    }
    profile, _ = UserProfile.objects.get_or_create(user=user, defaults=defaults)
    return profile


def _profile_dict(user: User, profile: UserProfile) -> dict:
    display_name = profile.display_name.strip() or user.get_full_name().strip() or user.username
    return {
        'username': user.username,
        'email': user.email,
        'display_name': display_name,
        'headline': profile.headline,
        'bio': profile.bio,
        'location': profile.location,
        'website_url': profile.website_url,
        'avatar_url': profile.avatar_url,
        'banner_url': profile.banner_url,
        'specialties': profile.specialties if isinstance(profile.specialties, list) else [],
        'social_links': profile.social_links if isinstance(profile.social_links, list) else [],
        'profile_visibility': profile.profile_visibility,
        'created_at': profile.created_at,
        'updated_at': profile.updated_at,
    }


def _profile_creations(username: str):
    return CommunityCreation.objects.filter(username__iexact=username).select_related('organization', 'project', 'campaign')


def _profile_stats(creations) -> dict:
    aggregates = creations.aggregate(total_likes=Sum('likes'))
    type_counts = list(creations.values('creation_type').annotate(count=Count('id')).order_by('-count', 'creation_type'))
    favorite_type = type_counts[0]['creation_type'] if type_counts else ''
    latest = creations.order_by('-created_at').first()
    return {
        'creation_count': creations.count(),
        'total_likes': aggregates['total_likes'] or 0,
        'favorite_type': favorite_type,
        'favorite_type_display': PROFILE_TYPE_LABELS.get(favorite_type, ''),
        'latest_published_at': latest.created_at if latest else None,
    }


def _profile_payload(user: User, viewer: User) -> dict:
    profile = _get_or_create_profile(user)
    creations = _profile_creations(user.username)
    return {
        'profile': _profile_dict(user, profile),
        'stats': _profile_stats(creations),
        'creations': CommunityCreationSerializer(creations, many=True).data,
        'is_owner': viewer.is_authenticated and viewer.id == user.id,
    }


def _clean_specialties(value):
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise ValueError('specialties must be a list')
    cleaned = []
    for item in value:
        text = str(item).strip()
        if not text:
            continue
        if len(text) > 32:
            raise ValueError('specialty labels must be 32 characters or fewer')
        if text not in cleaned:
            cleaned.append(text)
    if len(cleaned) > 8:
        raise ValueError('specialties supports up to 8 labels')
    return cleaned


def _clean_social_links(value):
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise ValueError('social_links must be a list')
    validator = URLValidator(schemes=['http', 'https'])
    cleaned = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError('social_links entries must be objects')
        label = str(item.get('label') or '').strip()
        url = str(item.get('url') or '').strip()
        if not label and not url:
            continue
        if not label or not url:
            raise ValueError('social links require label and url')
        if len(label) > 32 or len(url) > 500:
            raise ValueError('social link label or url is too long')
        try:
            validator(url)
        except ValidationError as exc:
            raise ValueError('social link url must be a valid http(s) URL') from exc
        cleaned.append({'label': label, 'url': url})
    if len(cleaned) > 5:
        raise ValueError('social_links supports up to 5 links')
    return cleaned


def _clean_profile_patch(data):
    cleaned = {}
    errors = {}
    validator = URLValidator(schemes=['http', 'https'])

    for field in data:
        if field not in PROFILE_EDITABLE_FIELDS:
            continue
        value = data.get(field)
        try:
            if field in PROFILE_TEXT_LIMITS:
                value = str(value or '').strip()
                if len(value) > PROFILE_TEXT_LIMITS[field]:
                    raise ValueError(f'{field} is too long')
                if field in PROFILE_URL_FIELDS and value:
                    validator(value)
                cleaned[field] = value
            elif field == 'specialties':
                cleaned[field] = _clean_specialties(value)
            elif field == 'social_links':
                cleaned[field] = _clean_social_links(value)
            elif field == 'profile_visibility':
                value = str(value or 'workspace').strip()
                if value not in dict(UserProfile.VISIBILITY_CHOICES):
                    raise ValueError('Unsupported profile visibility')
                cleaned[field] = value
        except (ValidationError, ValueError) as exc:
            errors[field] = str(exc)

    return cleaned, errors


def _make_token(user: User, salt: str) -> str:
    return signing.dumps({'uid': user.id, 'password': user.password}, salt=salt)


def _load_token(token: str, salt: str, max_age: int = 60 * 60) -> User | None:
    try:
        payload = signing.loads(token, salt=salt, max_age=max_age)
    except signing.BadSignature:
        return None
    user = User.objects.filter(pk=payload.get('uid')).first()
    if not user or payload.get('password') != user.password:
        return None
    return user


def _send_verification_email(user: User) -> None:
    token = _make_token(user, EMAIL_VERIFY_SALT)
    url = f'{settings.FRONTEND_BASE_URL}/?verify_email={token}'
    send_transactional_email(
        to_email=user.email,
        subject='验证你的 Marketing Hub 邮箱',
        text=f'欢迎来到 Marketing Hub。\n\n请点击下面的链接完成邮箱验证：\n{url}\n\n链接有效期为 1 小时。如果不是你本人操作，可以忽略这封邮件。',
        html=f'''
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f5f1e8;padding:32px 16px;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#1c1b18;">
    <div style="max-width:640px;margin:0 auto;border:2px solid #1c1b18;background:#fffaf0;box-shadow:10px 10px 0 #1c1b18;">
      <div style="padding:22px 24px;border-bottom:2px solid #1c1b18;background:#f6d74b;">
        <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;">MARKETING HUB</div>
        <h1 style="margin:10px 0 0;font-size:30px;line-height:1.15;font-weight:900;">验证邮箱，开启你的创意工作台</h1>
      </div>
      <div style="padding:28px 24px 30px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">你好，{user.username}：</p>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.7;">你的 Marketing Hub 测试账号已经创建。完成邮箱验证后，就可以进入工作区，开始搭建营销内容、模板和 AI 工作流。</p>
        <a href="{url}" style="display:inline-block;background:#1c1b18;color:#fffaf0;text-decoration:none;font-size:16px;font-weight:900;padding:14px 22px;border:2px solid #1c1b18;box-shadow:5px 5px 0 #ef6b4f;">完成邮箱验证</a>
        <div style="margin:28px 0 0;padding:16px;border:2px dashed #1c1b18;background:#f8f0d8;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:800;">如果按钮无法打开，请复制下面链接到浏览器：</p>
          <p style="margin:0;font-size:13px;line-height:1.6;word-break:break-all;color:#3b3326;">{url}</p>
        </div>
        <p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#6b6254;">链接有效期为 1 小时。如果不是你本人操作，可以忽略这封邮件。</p>
      </div>
    </div>
  </body>
</html>
''',
    )


def _send_password_reset_email(user: User) -> None:
    token = _make_token(user, PASSWORD_RESET_SALT)
    url = f'{settings.FRONTEND_BASE_URL}/?reset_password={token}'
    send_transactional_email(
        to_email=user.email,
        subject='重置你的 Marketing Hub 密码',
        text=f'你正在重置 Marketing Hub 密码。\n\n请点击下面的链接设置新密码：\n{url}\n\n链接有效期为 1 小时。如果不是你本人操作，可以忽略这封邮件。',
        html=f'''
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f5f1e8;padding:32px 16px;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#1c1b18;">
    <div style="max-width:640px;margin:0 auto;border:2px solid #1c1b18;background:#fffaf0;box-shadow:10px 10px 0 #1c1b18;">
      <div style="padding:22px 24px;border-bottom:2px solid #1c1b18;background:#b7df72;">
        <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;">ACCOUNT SECURITY</div>
        <h1 style="margin:10px 0 0;font-size:30px;line-height:1.15;font-weight:900;">重新设置你的登录密码</h1>
      </div>
      <div style="padding:28px 24px 30px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">你好，{user.username}：</p>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.7;">我们收到了你的密码重置请求。点击下面按钮设置新密码，然后重新进入 Marketing Hub。</p>
        <a href="{url}" style="display:inline-block;background:#1c1b18;color:#fffaf0;text-decoration:none;font-size:16px;font-weight:900;padding:14px 22px;border:2px solid #1c1b18;box-shadow:5px 5px 0 #4f8fee;">重置密码</a>
        <div style="margin:28px 0 0;padding:16px;border:2px dashed #1c1b18;background:#eef6dc;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:800;">如果按钮无法打开，请复制下面链接到浏览器：</p>
          <p style="margin:0;font-size:13px;line-height:1.6;word-break:break-all;color:#3b3326;">{url}</p>
        </div>
        <p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#6b6254;">链接有效期为 1 小时。如果不是你本人操作，可以忽略这封邮件，原密码不会改变。</p>
      </div>
    </div>
  </body>
</html>
''',
    )


def _create_default_workspace_for_user(user: User, organization_name: str):
    base_slug = slugify(organization_name) or f'org-{user.id}'
    slug = base_slug
    index = 2
    while Organization.objects.filter(slug=slug).exists():
        slug = f'{base_slug}-{index}'
        index += 1
    org = Organization.objects.create(name=organization_name, slug=slug)
    Membership.objects.create(user=user, organization=org, role='admin')
    project = Project.objects.create(
        organization=org,
        name='First Campaign',
        slug='first-campaign',
        brief='Your first Marketing Hub workspace.',
    )
    campaign = Campaign.objects.create(
        project=project,
        name='Launch Plan',
        objective='Prepare the first test campaign.',
    )
    return org, project, campaign


class LoginView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def post(self, request):
        username = (request.data.get('username') or '').strip()
        password = request.data.get('password')

        if not username or not password:
            return Response({'error': '请输入用户名和密码'}, status=status.HTTP_400_BAD_REQUEST)

        login_username = username
        if '@' in username:
            email_user = User.objects.filter(email__iexact=username).first()
            if email_user:
                login_username = email_user.username

        user = authenticate(username=login_username, password=password)
        if user is not None:
            if user.is_superuser:
                return Response({'error': '超级管理员请使用独立管理入口登录。', 'admin_login_required': True}, status=status.HTTP_403_FORBIDDEN)
            profile = _get_or_create_profile(user)
            if profile.status == 'suspended':
                return Response({'error': '账号已被冻结，请联系管理员。'}, status=status.HTTP_403_FORBIDDEN)
            if not profile.email_verified and user.username != settings.MARKETING_HUB_DEMO_USERNAME:
                return Response({'error': '请先完成邮箱验证。'}, status=status.HTTP_403_FORBIDDEN)
            login(request, user)
            profile.status = 'active'
            profile.last_login_ip = _client_ip(request)
            profile.last_login_user_agent = request.META.get('HTTP_USER_AGENT', '')[:255]
            profile.save(update_fields=['status', 'last_login_ip', 'last_login_user_agent', 'updated_at'])
            workspace = ensure_demo_workspace(user.username)
            record_audit_log(
                action='login',
                actor=user,
                organization=workspace['organization'],
                target_type='user',
                target_id=str(user.id),
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={
                    'auth_type': 'session',
                    'demo_account': user.username == settings.MARKETING_HUB_DEMO_USERNAME,
                    'demo_bootstrap_enabled': settings.MARKETING_HUB_BOOTSTRAP_DEMO,
                },
            )
            _record_security_event(request, 'login_success', user=user, email=user.email, metadata={'username': user.username})
            response = Response({
                'username': user.username,
                'email': user.email,
                'auth_type': 'session',
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'demo_account': user.username == settings.MARKETING_HUB_DEMO_USERNAME,
                'organization': workspace['organization'].slug,
                'project': workspace['project'].slug,
                'campaign': workspace['campaign'].id,
            }, status=status.HTTP_200_OK)
            response['X-CSRFToken'] = get_token(request)
            return response
        _record_security_event(request, 'login_failed', email=username if '@' in username else '', risk_level='medium', metadata={'identifier': username})
        return Response({'error': '用户名或密码错误。'}, status=status.HTTP_401_UNAUTHORIZED)


class AdminLoginView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def post(self, request):
        username = (request.data.get('username') or '').strip()
        password = request.data.get('password')

        if not username or not password:
            return Response({'error': '请输入管理员账号和密码'}, status=status.HTTP_400_BAD_REQUEST)

        login_username = username
        if '@' in username:
            email_user = User.objects.filter(email__iexact=username).first()
            if email_user:
                login_username = email_user.username

        user = authenticate(username=login_username, password=password)
        if user is None or not user.is_superuser:
            _record_security_event(request, 'admin_login_failed', email=username if '@' in username else '', risk_level='high', metadata={'identifier': username})
            return Response({'error': '管理员账号或密码错误。'}, status=status.HTTP_401_UNAUTHORIZED)

        profile = _get_or_create_profile(user)
        if profile.status == 'suspended':
            return Response({'error': '管理员账号已被冻结。'}, status=status.HTTP_403_FORBIDDEN)

        login(request, user)
        profile.status = 'active'
        profile.email_verified = True
        profile.last_login_ip = _client_ip(request)
        profile.last_login_user_agent = request.META.get('HTTP_USER_AGENT', '')[:255]
        profile.save(update_fields=['status', 'email_verified', 'last_login_ip', 'last_login_user_agent', 'updated_at'])
        record_audit_log(
            action='login',
            actor=user,
            target_type='platform_admin',
            target_id=str(user.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'auth_type': 'session', 'admin_mode': True},
        )
        _record_security_event(request, 'admin_login_success', user=user, email=user.email, metadata={'username': user.username})
        response = Response({
            'username': user.username,
            'email': user.email,
            'auth_type': 'session',
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'admin_mode': True,
        }, status=status.HTTP_200_OK)
        response['X-CSRFToken'] = get_token(request)
        return response


class CsrfTokenView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        response = Response({'ok': True}, status=status.HTTP_200_OK)
        response['X-CSRFToken'] = get_token(request)
        return response


class AuthMeView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        user = request.user
        if not user or not getattr(user, 'is_authenticated', False):
            response = Response({'authenticated': False}, status=status.HTTP_200_OK)
            response['X-CSRFToken'] = get_token(request)
            return response

        profile = _get_or_create_profile(user)
        if user.is_superuser:
            response = Response({
                'authenticated': True,
                'username': user.username,
                'email': user.email,
                'email_verified': True,
                'status': profile.status,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'admin_mode': True,
            }, status=status.HTTP_200_OK)
            response['X-CSRFToken'] = get_token(request)
            return response

        workspace = ensure_demo_workspace(user.username)
        membership = Membership.objects.filter(user=user, organization=workspace['organization']).first()
        response = Response({
            'authenticated': True,
            'username': user.username,
            'email': user.email,
            'email_verified': profile.email_verified,
            'status': profile.status,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'admin_mode': False,
            'demo_account': user.username == settings.MARKETING_HUB_DEMO_USERNAME,
            'organization': workspace['organization'].slug,
            'project': workspace['project'].slug,
            'campaign': workspace['campaign'].id,
            'role': membership.role if membership else '',
        }, status=status.HTTP_200_OK)
        response['X-CSRFToken'] = get_token(request)
        return response


class MyProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_profile_payload(request.user, request.user))

    def patch(self, request):
        profile = _get_or_create_profile(request.user)
        cleaned, errors = _clean_profile_patch(request.data)
        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        if not cleaned:
            return Response(_profile_payload(request.user, request.user))

        for field, value in cleaned.items():
            setattr(profile, field, value)
        profile.save(update_fields=[*cleaned.keys(), 'updated_at'])
        return Response(_profile_payload(request.user, request.user))


class PublicProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, username: str):
        user = User.objects.filter(username__iexact=username, is_active=True).first()
        if not user:
            return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_profile_payload(user, request.user))


class RegisterView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        username = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''
        organization_name = (request.data.get('organization_name') or '').strip()

        if not email or '@' not in email:
            return Response({'error': '请输入有效邮箱。'}, status=status.HTTP_400_BAD_REQUEST)
        if not username:
            username = email.split('@')[0]
        if not organization_name:
            organization_name = f"{username}'s Workspace"
        if User.objects.filter(email__iexact=email).exists():
            return Response({'error': '该邮箱已注册。'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username__iexact=username).exists():
            return Response({'error': '该用户名已存在。'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password)
        except ValidationError as exc:
            return Response({'error': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create(
            username=username,
            email=email,
            password=make_password(password),
            is_active=True,
        )
        profile = UserProfile.objects.create(
            user=user,
            email_verified=False,
            status='pending',
            signup_source='self_serve',
            signup_ip=_client_ip(request),
        )
        org, project, campaign = _create_default_workspace_for_user(user, organization_name)
        try:
            _send_verification_email(user)
        except EmailDeliveryError as exc:
            print(f'Email delivery failed during registration: {exc}')
            transaction.set_rollback(True)
            return Response({
                'error': '验证邮件发送失败，请检查 Resend Key、发件域名和 DEFAULT_FROM_EMAIL 后重试。'
            }, status=status.HTTP_502_BAD_GATEWAY)
        record_audit_log(
            action='member_change',
            actor=user,
            organization=org,
            target_type='user_registration',
            target_id=str(user.id),
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'email': email, 'profile_id': profile.id},
        )
        _record_security_event(request, 'register_success', user=user, email=email, metadata={'organization_id': org.id})
        return Response({
            'ok': True,
            'message': '注册成功，请查收邮箱完成验证。',
            'username': user.username,
            'email': user.email,
            'organization': org.slug,
            'project': project.slug,
            'campaign': campaign.id,
        }, status=status.HTTP_201_CREATED)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get('token') or ''
        user = _load_token(token, EMAIL_VERIFY_SALT)
        if not user:
            return Response({'error': '验证链接无效或已过期。'}, status=status.HTTP_400_BAD_REQUEST)
        profile = _get_or_create_profile(user)
        profile.email_verified = True
        profile.status = 'active'
        profile.save(update_fields=['email_verified', 'status', 'updated_at'])
        _record_security_event(request, 'email_verify_success', user=user, email=user.email)
        return Response({'ok': True, 'message': '邮箱验证成功，请登录。'})


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user:
            profile = _get_or_create_profile(user)
            if not profile.email_verified:
                try:
                    _send_verification_email(user)
                except EmailDeliveryError as exc:
                    print(f'Email delivery failed during verification resend: {exc}')
                    return Response({
                        'error': '验证邮件发送失败，请检查邮件发送配置后重试。'
                    }, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'ok': True, 'message': '如果邮箱存在，我们已发送验证邮件。'})


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        identifier = (request.data.get('email') or request.data.get('username') or '').strip()
        user = User.objects.filter(email__iexact=identifier).first() or User.objects.filter(username__iexact=identifier).first()
        if user and user.email:
            try:
                _send_password_reset_email(user)
            except EmailDeliveryError as exc:
                print(f'Email delivery failed during password reset: {exc}')
                return Response({
                    'error': '重置邮件发送失败，请检查邮件发送配置后重试。'
                }, status=status.HTTP_502_BAD_GATEWAY)
            _record_security_event(request, 'password_reset_requested', user=user, email=user.email)
        return Response({'ok': True, 'message': '如果账号存在，我们已发送重置邮件。'})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get('token') or ''
        password = request.data.get('password') or ''
        user = _load_token(token, PASSWORD_RESET_SALT)
        if not user:
            return Response({'error': '重置链接无效或已过期。'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            return Response({'error': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save(update_fields=['password'])
        _record_security_event(request, 'password_reset_success', user=user, email=user.email)
        return Response({'ok': True, 'message': '密码已重置，请重新登录。'})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MembershipCollectionView(APIView):
    permission_classes = [CanManageOrganization]

    def get(self, request):
        _, org, _, _ = get_scope(request)
        memberships = Membership.objects.filter(organization=org).select_related('user', 'organization').order_by('user__username')
        return Response(MembershipSerializer(memberships, many=True).data)

    def post(self, request):
        actor, org, _, _ = get_scope(request)
        user_id = request.data.get('user_id')
        username = request.data.get('username')
        user = User.objects.filter(pk=user_id).first() if user_id else User.objects.filter(username=username).first()
        if not user:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        role = request.data.get('role', 'viewer')
        if role not in dict(Membership.ROLE_CHOICES):
            return Response({'error': 'Unsupported role'}, status=status.HTTP_400_BAD_REQUEST)

        membership, _ = Membership.objects.update_or_create(user=user, organization=org, defaults={'role': role})
        record_audit_log(
            action='member_change',
            actor=actor,
            organization=org,
            target_type='membership',
            target_id=str(membership.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'user_id': user.id, 'role': role},
        )
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class MembershipDetailView(APIView):
    permission_classes = [CanManageOrganization]

    def patch(self, request, pk: int):
        actor, org, _, _ = get_scope(request)
        membership = Membership.objects.filter(pk=pk, organization=org).select_related('user', 'organization').first()
        if not membership:
            return Response({'error': 'Membership not found'}, status=status.HTTP_404_NOT_FOUND)
        role = request.data.get('role', membership.role)
        if role not in dict(Membership.ROLE_CHOICES):
            return Response({'error': 'Unsupported role'}, status=status.HTTP_400_BAD_REQUEST)
        previous_role = membership.role
        membership.role = role
        membership.save(update_fields=['role'])
        record_audit_log(
            action='member_change',
            actor=actor,
            organization=org,
            target_type='membership',
            target_id=str(membership.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'from': previous_role, 'to': role, 'user_id': membership.user_id},
        )
        return Response(MembershipSerializer(membership).data)

    def delete(self, request, pk: int):
        actor, org, _, _ = get_scope(request)
        membership = Membership.objects.filter(pk=pk, organization=org).first()
        if not membership:
            return Response({'error': 'Membership not found'}, status=status.HTTP_404_NOT_FOUND)
        target_id = str(membership.id)
        user_id = membership.user_id
        membership.delete()
        record_audit_log(
            action='member_change',
            actor=actor,
            organization=org,
            target_type='membership',
            target_id=target_id,
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'deleted_user_id': user_id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
