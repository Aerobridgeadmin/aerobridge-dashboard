import frappe

from . import __version__ as app_version

app_name = "aerobridge"
app_title = "Learning"
app_publisher = "Frappe"
app_description = "Open Source Learning Management System built with Frappe Framework"
app_icon_url = "/assets/aerobridge/images/aerobridge-logo.png"
app_icon_title = "Learning"
app_color = "grey"
app_email = "jannat@frappe.io"
app_license = "AGPL"


def get_aerobridge_path():
	return (frappe.conf.get("aerobridge_path") or "aerobridge").strip("/")


app_icon_route = f"/{get_aerobridge_path()}"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/aerobridge/css/aerobridge.css"
# app_include_js = "/assets/aerobridge/js/aerobridge.js"

# include js, css files in header of web template
web_include_css = "aerobridge.bundle.css"
# web_include_css = "/assets/aerobridge/css/aerobridge.css"
web_include_js = []

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "lms/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "aerobridge.install.before_install"
after_install = "aerobridge.install.after_install"
after_sync = "aerobridge.install.after_sync"
before_uninstall = "aerobridge.install.before_uninstall"
setup_wizard_requires = "assets/aerobridge/js/setup_wizard.js"
after_migrate = [
	"aerobridge.sqlite.build_index_in_background",
]

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "lms.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

permission_query_conditions = {
	"Aerobridge Certificate": "aerobridge.aerobridge.doctype.aerobridge_certificate.aerobridge_certificate.get_permission_query_conditions",
}

has_permission = {
	"Aerobridge Live Class": "aerobridge.aerobridge.doctype.aerobridge_live_class.aerobridge_live_class.has_permission",
	"Aerobridge Batch": "aerobridge.aerobridge.doctype.aerobridge_batch.aerobridge_batch.has_permission",
	"Aerobridge Program": "aerobridge.aerobridge.doctype.aerobridge_program.aerobridge_program.has_permission",
	"Aerobridge Certificate": "aerobridge.aerobridge.doctype.aerobridge_certificate.aerobridge_certificate.has_permission",
}

# DocType Class
# ---------------
# Override standard doctype classes

override_doctype_class = {
	"Web Template": "aerobridge.overrides.web_template.CustomWebTemplate",
}

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"*": {
		"on_change": [
			"aerobridge.aerobridge.doctype.aerobridge_badge.aerobridge_badge.process_badges",
		]
	},
	"Discussion Reply": {
		"after_insert": "aerobridge.aerobridge.utils.handle_notifications",
		"validate": "aerobridge.aerobridge.utils.validate_discussion_reply",
	},
	"Notification Log": {"on_change": "aerobridge.aerobridge.utils.publish_notifications"},
	"User": {
		"validate": "aerobridge.aerobridge.user.validate_username_duplicates",
		"after_insert": "aerobridge.aerobridge.user.after_insert",
	},
}

# Scheduled Tasks
# ---------------
scheduler_events = {
	"all": [
		"aerobridge.sqlite.build_index_in_background",
	],
	"hourly": [
		"aerobridge.aerobridge.doctype.aerobridge_certificate_request.aerobridge_certificate_request.schedule_evals",
		"aerobridge.aerobridge.api.update_course_statistics",
		"aerobridge.aerobridge.doctype.aerobridge_certificate_request.aerobridge_certificate_request.mark_eval_as_completed",
		"aerobridge.aerobridge.doctype.aerobridge_live_class.aerobridge_live_class.update_attendance",
	],
	"daily": [
		"aerobridge.job.doctype.job_opportunity.job_opportunity.update_job_openings",
		"aerobridge.aerobridge.doctype.aerobridge_payment.aerobridge_payment.send_payment_reminder",
		"aerobridge.aerobridge.doctype.aerobridge_batch.aerobridge_batch.send_batch_start_reminder",
		"aerobridge.aerobridge.doctype.aerobridge_live_class.aerobridge_live_class.send_live_class_reminder",
		"aerobridge.aerobridge.doctype.aerobridge_course.aerobridge_course.send_notification_for_published_courses",
	],
}

fixtures = ["Custom Field", "Function", "Industry", "Aerobridge Category"]

# Testing
# -------

# before_tests = "aerobridge.install.before_tests"

# Overriding Methods
# ------------------------------
#
override_whitelisted_methods = {
	# "frappe.desk.search.get_names_for_mentions": "aerobridge.aerobridge.utils.get_names_for_mentions",
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "lms.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Add all simple route rules here
website_route_rules = [
	{"from_route": f"/{get_aerobridge_path()}/<path:app_path>", "to_route": "_aerobridge"},
	{"from_route": f"/{get_aerobridge_path()}", "to_route": "_aerobridge"},
	{
		"from_route": "/courses/<course_name>/<certificate_id>",
		"to_route": "certificate",
	},
]

website_redirects = [
	{"source": "/update-profile", "target": "/edit-profile"},
	{"source": "/courses", "target": f"/{get_aerobridge_path()}/courses"},
	{
		"source": r"^/courses/.*$",
		"target": f"/{get_aerobridge_path()}/courses",
	},
	{"source": "/batches", "target": f"/{get_aerobridge_path()}/batches"},
	{
		"source": r"/batches/(.*)",
		"target": f"/{get_aerobridge_path()}/batches",
		"match_with_query_string": True,
	},
	{"source": "/job-openings", "target": f"/{get_aerobridge_path()}/job-openings"},
	{
		"source": r"/job-openings/(.*)",
		"target": f"/{get_aerobridge_path()}/job-openings",
		"match_with_query_string": True,
	},
	{"source": "/statistics", "target": f"/{get_aerobridge_path()}/statistics"},
	{"source": "_aerobridge", "target": f"/{get_aerobridge_path()}"},
]

update_website_context = [
	"aerobridge.widgets.update_website_context",
]

jinja = {
	"methods": [
		"aerobridge.aerobridge.utils.get_lesson_count",
		"aerobridge.aerobridge.utils.get_instructors",
		"aerobridge.aerobridge.utils.get_lesson_index",
		"aerobridge.aerobridge.utils.get_lesson_url",
		"aerobridge.aerobridge.utils.get_aerobridge_route",
		"aerobridge.aerobridge.utils.is_instructor",
		"aerobridge.aerobridge.utils.get_palette",
	],
	"filters": [],
}

extend_bootinfo = [
	"aerobridge.aerobridge.utils.extend_bootinfo",
]
## Specify the additional tabs to be included in the user profile page.
## Each entry must be a subclass of aerobridge.aerobridge.plugins.ProfileTab
# profile_tabs = []

## Specify the extension to be used to control what scripts and stylesheets
## to be included in lesson pages. The specified value must be be a
## subclass of aerobridge.plugins.PageExtension
# aerobridge_lesson_page_extension = None

# aerobridge_lesson_page_extensions = [
# 	"aerobridge.plugins.LiveCodeExtension"
# ]

has_website_permission = {
	"Aerobridge Certificate Evaluation": "aerobridge.aerobridge.doctype.aerobridge_certificate_evaluation.aerobridge_certificate_evaluation.has_website_permission",
	"Aerobridge Certificate": "aerobridge.aerobridge.doctype.aerobridge_certificate.aerobridge_certificate.has_website_permission",
}

## Markdown Macros for Lessons
aerobridge_markdown_macro_renderers = {
	"Exercise": "aerobridge.plugins.exercise_renderer",
	"Quiz": "aerobridge.plugins.quiz_renderer",
	"YouTubeVideo": "aerobridge.plugins.youtube_video_renderer",
	"Video": "aerobridge.plugins.video_renderer",
	"Assignment": "aerobridge.plugins.assignment_renderer",
	"Embed": "aerobridge.plugins.embed_renderer",
	"Audio": "aerobridge.plugins.audio_renderer",
	"PDF": "aerobridge.plugins.pdf_renderer",
}

page_renderer = [
	"aerobridge.page_renderers.SCORMRenderer",
]

# set this to "/" to have profiles on the top-level
profile_url_prefix = "/users/"

signup_form_template = "aerobridge.plugins.show_custom_signup"

on_login = "aerobridge.aerobridge.user.on_login"

get_site_info = "aerobridge.activation.get_site_info"

add_to_apps_screen = [
	{
		"name": "aerobridge",
		"logo": "/assets/aerobridge/frontend/learning.svg",
		"title": "Learning",
		"route": f"/{get_aerobridge_path()}",
		"has_permission": "aerobridge.aerobridge.api.check_app_permission",
	}
]

sqlite_search = ["aerobridge.sqlite.LearningSearch"]
auth_hooks = ["aerobridge.auth.authenticate"]
require_type_annotated_api_methods = True
