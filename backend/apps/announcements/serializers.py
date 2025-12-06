from rest_framework import serializers
from .models import Announcement
from apps.users.serializers import UserSerializer

class AnnouncementSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    
    class Meta:
        model = Announcement
        fields = ['id', 'title', 'content', 'author', 'visible', 'created_at', 'updated_at']
        read_only_fields = ['author', 'created_at', 'updated_at']

    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)
