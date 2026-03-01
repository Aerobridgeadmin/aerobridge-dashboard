import frappe

from aerobridge.aerobridge.utils import get_course_progress


def execute():
	enrollments = frappe.get_all("Aerobridge Enrollment", fields=["name", "course", "member"])

	for enrollment in enrollments:
		progress = get_course_progress(enrollment.course, enrollment.member)
		frappe.db.set_value("Aerobridge Enrollment", enrollment.name, "progress", progress)
