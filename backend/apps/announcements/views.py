from rest_framework import viewsets, permissions
from .models import Announcement
from .serializers import AnnouncementSerializer

class AnnouncementViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows announcements to be viewed or edited.
    """
    queryset = Announcement.objects.all()
    serializer_class = AnnouncementSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or (user.is_authenticated and user.role == 'admin'):
            return Announcement.objects.all()
        return Announcement.objects.filter(visible=True)

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            # Assuming 'admin' role check is needed, or just IsAdminUser (is_staff)
            # Adapting to custom role check if necessary
            return [permissions.IsAuthenticated(), permissions.IsAdminUser()] 
        return [permissions.AllowAny()]
