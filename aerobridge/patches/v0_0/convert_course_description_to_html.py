import frappe

from aerobridge.aerobridge.md import markdown_to_html


def execute():
	courses = frappe.get_all("Aerobridge Course", fields=["name", "description"])

	for course in courses:
		html = markdown_to_html(course.description)
		frappe.db.set_value("Aerobridge Course", course.name, "description", html)

	frappe.reload_doc("aerobridge", "doctype", "aerobridge_course")
