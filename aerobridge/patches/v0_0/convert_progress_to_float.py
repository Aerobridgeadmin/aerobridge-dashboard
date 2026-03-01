import frappe
from frappe.utils import flt


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_course_progress")
	progress_records = frappe.get_all("Aerobridge Enrollment", fields=["name", "progress"])
	for progress in progress_records:
		frappe.db.set_value("Aerobridge Enrollment", progress.name, "progress", flt(progress.progress))
