"""Read-only REST API: /api/v1/  (add ?lang=ar for Arabic; ?area=<slug>, ?status=, ?year= filters where noted)."""
from django.utils import translation
from rest_framework import routers, serializers, viewsets

from . import models as m


def _img(obj, request, field="image"):
    f = getattr(obj, field, None)
    return request.build_absolute_uri(f.url) if f else None


class Base(serializers.ModelSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["url"] = self.context["request"].build_absolute_uri(instance.get_absolute_url()) if hasattr(instance, "get_absolute_url") else None
        return data


class AreaS(Base):
    class Meta:
        model = m.ResearchArea
        fields = ["id", "slug", "title", "summary", "description"]


class ServiceS(serializers.ModelSerializer):
    class Meta:
        model = m.Service
        fields = ["id", "title", "description"]


class ServiceCategoryS(serializers.ModelSerializer):
    services = serializers.SerializerMethodField()

    class Meta:
        model = m.ServiceCategory
        fields = ["id", "slug", "title", "description", "services"]

    def get_services(self, obj):
        return ServiceS([s for s in obj.services.all() if s.is_live], many=True).data


class ProjectS(Base):
    research_area = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = m.Project
        fields = ["id", "slug", "title", "research_area", "status", "status_label", "problem", "role", "methodology", "outcome", "image"]

    def get_image(self, o):
        return _img(o, self.context["request"])


class PublicationS(serializers.ModelSerializer):
    doi_url = serializers.CharField(read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    project = serializers.SlugRelatedField(source="related_project", slug_field="slug", read_only=True)

    class Meta:
        model = m.Publication
        fields = ["id", "kind", "kind_label", "title", "authors", "journal", "year", "doi", "doi_url", "external_link", "project"]


class HubS(Base):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    research_area = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = m.HubItem
        fields = ["id", "slug", "category", "category_label", "title", "summary", "description", "status", "status_label", "research_area", "link"]


class PostS(Base):
    image = serializers.SerializerMethodField()

    class Meta:
        model = m.Post
        fields = ["id", "slug", "title", "summary", "body", "author_name", "published_at", "image"]

    def get_image(self, o):
        return _img(o, self.context["request"])


class TrainingS(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    seats_left = serializers.IntegerField(read_only=True)

    class Meta:
        model = m.TrainingProgram
        fields = ["id", "slug", "kind", "kind_label", "title", "summary", "description", "start_date", "duration", "format",
                  "registration_open", "capacity", "seats_left"]


class OpportunityS(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = m.Opportunity
        fields = ["id", "slug", "kind", "kind_label", "title", "summary", "description", "deadline", "apply_link"]


class CollabS(serializers.ModelSerializer):
    type_label = serializers.CharField(source="get_collaboration_type_display", read_only=True)

    class Meta:
        model = m.Collaboration
        fields = ["id", "organization_name", "country", "collaboration_type", "type_label", "description", "link", "latitude", "longitude"]


class TeamS(Base):
    photo = serializers.SerializerMethodField()
    orcid_url = serializers.CharField(read_only=True)

    class Meta:
        model = m.TeamMember
        fields = ["id", "slug", "group", "name", "role", "affiliation", "bio", "orcid", "orcid_url", "google_scholar_url", "photo"]

    def get_photo(self, o):
        return _img(o, self.context["request"], "photo")


class MetricS(serializers.ModelSerializer):
    class Meta:
        model = m.Metric
        fields = ["id", "label", "value", "suffix"]


class LiveViewSet(viewsets.ReadOnlyModelViewSet):
    """Only published items; the language comes from ?lang=en|ar (default en)."""

    model = None
    lookup_field = "pk"

    def initial(self, request, *args, **kwargs):
        lang = request.query_params.get("lang", "en")
        self._lang = lang if lang in ("en", "ar") else "en"
        super().initial(request, *args, **kwargs)

    def dispatch(self, request, *args, **kwargs):
        lang = request.GET.get("lang", "en")
        with translation.override(lang if lang in ("en", "ar") else "en"):
            response = super().dispatch(request, *args, **kwargs)
            if hasattr(response, "render") and callable(response.render):
                response.render()  # render inside the language override
            return response

    def get_queryset(self):
        qs = self.model.objects.filter(m.live_filter())
        for param, field in getattr(self, "filters", {}).items():
            v = self.request.query_params.get(param)
            if v:
                qs = qs.filter(**{field: v})
        return qs


def viewset(model, serializer, filters=None, prefetch=()):
    attrs = {"model": model, "serializer_class": serializer, "filters": filters or {}}
    if prefetch:
        attrs["get_queryset"] = lambda self: LiveViewSet.get_queryset(self).prefetch_related(*prefetch)
    return type(f"{model.__name__}ViewSet", (LiveViewSet,), attrs)


router = routers.DefaultRouter()
router.register("research-areas", viewset(m.ResearchArea, AreaS), basename="api-area")
router.register("services", viewset(m.ServiceCategory, ServiceCategoryS, prefetch=("services",)), basename="api-service")
router.register("projects", viewset(m.Project, ProjectS, {"area": "research_area__slug", "status": "status"}), basename="api-project")
router.register("publications", viewset(m.Publication, PublicationS, {"year": "year", "kind": "kind", "project": "related_project__slug"}), basename="api-publication")
router.register("hub", viewset(m.HubItem, HubS, {"category": "category", "status": "status", "area": "research_area__slug"}), basename="api-hub")
router.register("news", viewset(m.Post, PostS), basename="api-news")
router.register("training", viewset(m.TrainingProgram, TrainingS, {"kind": "kind"}), basename="api-training")
router.register("opportunities", viewset(m.Opportunity, OpportunityS, {"kind": "kind"}), basename="api-opportunity")
router.register("collaborations", viewset(m.Collaboration, CollabS, {"type": "collaboration_type", "country": "country"}), basename="api-collab")
router.register("team", viewset(m.TeamMember, TeamS, {"group": "group"}), basename="api-team")
router.register("metrics", viewset(m.Metric, MetricS), basename="api-metric")
