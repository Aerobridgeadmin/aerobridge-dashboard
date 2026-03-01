import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_course")
	frappe.reload_doc("aerobridge", "doctype", "chapter")
	frappe.reload_doc("aerobridge", "doctype", "lesson")
	frappe.reload_doc("aerobridge", "doctype", "lessons")
	frappe.reload_doc("aerobridge", "doctype", "chapters")

	update_chapters()
	update_lessons()


def update_chapters():
	courses = frappe.get_all("Aerobridge Course", pluck="name")
	for course in courses:
		course_details = frappe.get_doc("Aerobridge Course", course)
		chapters = frappe.get_all("Chapter", {"course": course}, ["name"], order_by="index_")
		for chapter in chapters:
			course_details.append("chapters", {"chapter": chapter.name})

		course_details.save()


def update_lessons():
	chapters = frappe.get_all("Chapter", pluck="name")
	for chapter in chapters:
		chapter_details = frappe.get_doc("Chapter", chapter)
		lessons = frappe.get_all("Lesson", {"chapter": chapter}, ["name"], order_by="index_")
		for lesson in lessons:
			chapter_details.append("lessons", {"lesson": lesson.name})

		chapter_details.save()
