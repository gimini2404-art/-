from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("about/", views.about, name="about"),
    path("research-areas/", views.research_areas, name="research_areas"),
    path("research-areas/<slug:slug>/", views.research_area, name="research_area"),
    path("services/", views.services, name="services"),
    path("research-hub/", views.hub, name="hub"),
    path("research-hub/<slug:slug>/", views.hub_item, name="hub_item"),
    path("collaborations/", views.collaborations, name="collaborations"),
    path("projects/", views.projects, name="projects"),
    path("projects/<slug:slug>/", views.project, name="project"),
    path("publications/", views.publications, name="publications"),
    path("training/", views.training, name="training"),
    path("opportunities/", views.opportunities, name="opportunities"),
    path("contact/", views.contact, name="contact"),
    path("contact/thanks/", views.contact_thanks, name="contact_thanks"),
    path("team/<slug:slug>/", views.team_member, name="team_member"),
    path("news/", views.posts, name="posts"),
    path("news/<slug:slug>/", views.post, name="post"),
    path("training/<slug:slug>/register/", views.training_register, name="training_register"),
    path("search/", views.search, name="search"),
    path("newsletter/subscribe/", views.newsletter_subscribe, name="newsletter_subscribe"),
    path("newsletter/unsubscribe/<str:token>/", views.newsletter_unsubscribe, name="newsletter_unsubscribe"),
    path("p/<slug:slug>/", views.page, name="page"),
]
