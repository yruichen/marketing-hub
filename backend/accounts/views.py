from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.services import ensure_demo_workspace


class LoginView(APIView):
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({'error': '请输入用户名和密码'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(username=username, password=password)
        if user is not None:
            ensure_demo_workspace(user.username)
            return Response({
                'token': f'demo-session-token-{user.username.lower()}-auth',
                'username': user.username,
                'email': user.email,
            }, status=status.HTTP_200_OK)
        return Response({'error': '用户名或密码错误。提示: ROOT / 123'}, status=status.HTTP_401_UNAUTHORIZED)

