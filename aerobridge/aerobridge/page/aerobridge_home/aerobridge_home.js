frappe.pages["lms-home"].on_page_load = function (wrapper) {
	const lmsPath = frappe.boot.aerobridge_path || "aerobridge";
	window.location.href = `/${lmsPath}/courses`;
};
