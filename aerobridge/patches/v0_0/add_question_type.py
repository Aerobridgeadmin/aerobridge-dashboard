import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_quiz_question")
	questions = frappe.get_all("Aerobridge Quiz Question", pluck="name")

	for question in questions:
		frappe.db.set_value("Aerobridge Quiz Question", question, "type", "Choices")
