import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_quiz_question")
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_quiz")
	questions = frappe.get_all("Aerobridge Quiz Question", pluck="name")

	for question in questions:
		frappe.db.set_value("Aerobridge Quiz Question", question, "marks", 1)

	quizzes = frappe.get_all("Aerobridge Quiz", pluck="name")

	for quiz in quizzes:
		questions_count = frappe.db.count("Aerobridge Quiz Question", {"parent": quiz})
		frappe.db.set_value("Aerobridge Quiz", quiz, {"total_marks": questions_count, "passing_percentage": 100})
