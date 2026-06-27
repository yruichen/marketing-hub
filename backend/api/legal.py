from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.audit import record_audit_log
from api.models import PolicyDocument, UserConsent

REQUIRED_POLICY_TYPES = ('terms', 'privacy')


def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')) or None


def active_policy_documents(policy_types: tuple[str, ...] | list[str] | None = None) -> list[PolicyDocument]:
    qs = PolicyDocument.objects.filter(is_active=True, effective_at__lte=timezone.now())
    if policy_types:
        qs = qs.filter(policy_type__in=policy_types)
    docs_by_type: dict[str, PolicyDocument] = {}
    for doc in qs.order_by('policy_type', '-effective_at', '-id'):
        docs_by_type.setdefault(doc.policy_type, doc)
    return list(docs_by_type.values())


def serialize_policy_document(doc: PolicyDocument) -> dict:
    return {
        'policy_type': doc.policy_type,
        'version': doc.version,
        'title': doc.title,
        'content_url': doc.content_url,
        'effective_at': doc.effective_at,
        'is_active': doc.is_active,
    }


def consent_status(user, policy_types: tuple[str, ...] | list[str] = REQUIRED_POLICY_TYPES) -> dict:
    active_docs = active_policy_documents(list(policy_types))
    accepted_pairs = set(
        UserConsent.objects.filter(user=user, policy_type__in=policy_types).values_list('policy_type', 'policy_version')
    )
    missing = [
        serialize_policy_document(doc)
        for doc in active_docs
        if (doc.policy_type, doc.version) not in accepted_pairs
    ]
    return {
        'required_policy_types': list(policy_types),
        'active_documents': [serialize_policy_document(doc) for doc in active_docs],
        'missing': missing,
        'requires_consent': bool(missing),
    }


def missing_policy_consents(user, policy_types: tuple[str, ...] | list[str] = REQUIRED_POLICY_TYPES) -> list[dict]:
    return consent_status(user, policy_types)['missing']


def record_user_consent(request, user, doc: PolicyDocument, source: str) -> UserConsent:
    consent, _ = UserConsent.objects.get_or_create(
        user=user,
        policy_type=doc.policy_type,
        policy_version=doc.version,
        defaults={
            'consented_at': timezone.now(),
            'ip_address': client_ip(request),
            'user_agent': request.META.get('HTTP_USER_AGENT', '')[:255],
            'source': source[:80],
        },
    )
    record_audit_log(
        action='policy_consent',
        actor=user,
        target_type='policy_document',
        target_id=f'{doc.policy_type}:{doc.version}',
        ip_address=client_ip(request),
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
        metadata={'policy_type': doc.policy_type, 'policy_version': doc.version, 'source': source},
    )
    return consent


def require_current_policy_consent(user, policy_types: tuple[str, ...] | list[str] = REQUIRED_POLICY_TYPES):
    missing = missing_policy_consents(user, policy_types)
    if missing:
        return Response(
            {
                'error': 'Current legal policies require consent before this action.',
                'requires_consent': True,
                'missing_policies': missing,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class PolicyDocumentListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        docs = active_policy_documents()
        return Response({
            'required_policy_types': list(REQUIRED_POLICY_TYPES),
            'policies': [serialize_policy_document(doc) for doc in docs],
        })


class UserConsentView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        policy_types = request.data.get('policy_types') or list(REQUIRED_POLICY_TYPES)
        if isinstance(policy_types, str):
            policy_types = [policy_types]
        policy_types = [item for item in policy_types if isinstance(item, str)]
        if not policy_types:
            return Response({'error': 'policy_types is required'}, status=status.HTTP_400_BAD_REQUEST)

        docs = active_policy_documents(policy_types)
        docs_by_type = {doc.policy_type: doc for doc in docs}
        missing_types = [policy_type for policy_type in policy_types if policy_type not in docs_by_type]
        if missing_types:
            return Response({'error': 'No active policy document configured.', 'missing_policy_types': missing_types}, status=status.HTTP_409_CONFLICT)

        source = str(request.data.get('source') or 'api_consent')
        for doc in docs:
            record_user_consent(request, request.user, doc, source)
        return Response({'ok': True, 'policy_consents': consent_status(request.user)})
