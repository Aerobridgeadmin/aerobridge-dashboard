import frappe


def execute():
	frappe.db.set_single_value("Aerobridge Settings", "allow_job_posting", 1)
