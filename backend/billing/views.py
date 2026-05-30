from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.contracts import PLAN_LIMITS
from api.models import Project
from api.scope import get_scope


class BillingPlansView(APIView):
    def get(self, request):
        _, org, _, _ = get_scope(request)
        project_count = Project.objects.filter(organization=org, is_archived=False).count()
        return Response({
            'current_plan': org.subscription_plan,
            'current_limits': PLAN_LIMITS.get(org.subscription_plan, PLAN_LIMITS['free']),
            'project_count': project_count,
            'plans': PLAN_LIMITS,
        })

    def post(self, request):
        _, org, _, _ = get_scope(request)
        plan = request.data.get('plan', 'free')
        if plan not in PLAN_LIMITS:
            return Response({'error': 'Unsupported subscription plan'}, status=status.HTTP_400_BAD_REQUEST)
        org.subscription_plan = plan
        org.save(update_fields=['subscription_plan'])
        return Response({
            'current_plan': org.subscription_plan,
            'current_limits': PLAN_LIMITS[plan],
            'plans': PLAN_LIMITS,
        })

