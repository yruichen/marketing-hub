from __future__ import annotations

from rest_framework.throttling import SimpleRateThrottle


class OrgRateThrottle(SimpleRateThrottle):
    scope = 'org'

    def get_cache_key(self, request, view):
        organization = getattr(request, 'organization', None)
        org_id = getattr(organization, 'id', None)
        if org_id is None:
            org_id = request.query_params.get('organization') or request.data.get('organization') or 'unknown'
        ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': f'{org_id}:{ident}'}


class GenerationBurstThrottle(SimpleRateThrottle):
    scope = 'generation_burst'

    def get_cache_key(self, request, view):
        ident = getattr(request.user, 'id', None) or self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class ExpensiveEndpointThrottle(SimpleRateThrottle):
    scope = 'expensive'

    def get_cache_key(self, request, view):
        ident = getattr(request.user, 'id', None) or self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': f'{request.path}:{ident}'}
