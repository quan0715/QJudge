from django.urls import path
from .views import CurrentSubscriptionView, CheckoutSessionView, PortalSessionView
from .webhooks import recur_webhook

urlpatterns = [
    path("me/", CurrentSubscriptionView.as_view(), name="current-subscription"),
    path("checkout/", CheckoutSessionView.as_view(), name="checkout-session"),
    path("portal/", PortalSessionView.as_view(), name="portal-session"),
    path("webhooks/recur/", recur_webhook, name="recur-webhook"),
]
