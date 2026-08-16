from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["name"] = user.name
        if user.organization_id:
            token["organization_id"] = user.organization_id
        return token

    def validate(self, attrs):
        email = attrs.get("email")
        if email is not None:
            attrs[self.username_field] = email
        data = super().validate(attrs)
        data["user"] = {
            "id": self.user.id,
            "email": self.user.email,
            "name": self.user.name,
            "role": self.user.role,
            "organization": self.user.organization_id,
        }
        return data
