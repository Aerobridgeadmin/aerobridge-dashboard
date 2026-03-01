import frappe


def execute():
	set_question_data()
	set_submission_data()


def set_question_data():
	questions = frappe.get_all("Aerobridge Quiz Question", fields=["name", "question"])

	for question in questions:
		question_doc = frappe.db.get_value("Aerobridge Question", question.question, ["question", "type"], as_dict=1)
		frappe.db.set_value(
			"Aerobridge Quiz Question",
			question.name,
			{"question_detail": question_doc.question, "type": question_doc.type},
		)


def set_submission_data():
	submissions = frappe.get_all("Aerobridge Quiz Submission", fields=["name", "quiz"])

	for submission in submissions:
		quiz_title = frappe.db.get_value("Aerobridge Quiz", submission.quiz, "title")
		frappe.db.set_value("Aerobridge Quiz Submission", submission.name, "quiz_title", quiz_title)

		questions = frappe.get_all(
			"Aerobridge Quiz Result", filters={"parent": submission.name}, fields=["question_name"]
		)

		for question in questions:
			if question.question_name:
				marks_out_of = frappe.db.get_value(
					"Aerobridge Quiz Question",
					{"parent": submission.quiz, "question": question.question_name},
					["marks"],
				)

				frappe.db.set_value(
					"Aerobridge Quiz Result",
					{"parent": submission.name, "question_name": question.question_name},
					"marks_out_of",
					marks_out_of,
				)
