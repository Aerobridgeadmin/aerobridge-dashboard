import frappe


def execute():
	frappe.db.set_single_value("Aerobridge Settings", "programming_exercises", True)
