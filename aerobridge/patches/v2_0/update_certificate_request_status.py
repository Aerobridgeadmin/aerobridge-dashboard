import frappe
from frappe.utils import getdate


def execute():
	evaluations = frappe.get_all("Aerobridge Certificate Request", fields=["name", "date"])

	for evaluation in evaluations:
		if evaluation.date > getdate():
			frappe.db.set_value("Aerobridge Certificate Request", evaluation.name, "status", "Upcoming")
		else:
			frappe.db.set_value("Aerobridge Certificate Request", evaluation.name, "status", "Completed")
