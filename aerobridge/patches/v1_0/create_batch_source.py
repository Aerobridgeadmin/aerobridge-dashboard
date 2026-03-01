import frappe

from aerobridge.install import create_batch_source


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_source")
	create_batch_source()
