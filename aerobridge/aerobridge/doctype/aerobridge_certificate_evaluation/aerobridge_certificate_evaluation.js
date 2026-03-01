// Copyright (c) 2022, Frappe and contributors
// For license information, please see license.txt

frappe.ui.form.on("Aerobridge Certificate Evaluation", {
	refresh: function (frm) {
		if (!frm.is_new() && frm.doc.status == "Pass") {
			frm.add_custom_button(__("Create Certificate"), () => {
				frappe.model.open_mapped_doc({
					method: "aerobridge.aerobridge.doctype.aerobridge_certificate_evaluation.aerobridge_certificate_evaluation.create_aerobridge_certificate",
					frm: frm,
				});
			});
		}
	},

	onload: function (frm) {
		frm.set_query("member", function (doc) {
			return {
				filters: {
					ignore_user_type: 1,
				},
			};
		});
	},
});
