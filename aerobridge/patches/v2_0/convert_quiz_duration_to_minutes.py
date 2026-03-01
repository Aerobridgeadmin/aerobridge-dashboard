import frappe
from frappe.utils import ceil, flt


def execute():
	quizzes = frappe.get_all("Aerobridge Quiz", fields=["name", "duration"], filters={"duration": [">", 0]})
	for quiz in quizzes:
		frappe.db.set_value("Aerobridge Quiz", quiz.name, "duration", ceil(flt(quiz.duration) / 60))
