export declare const DEFAULT_PERMISSIONS: readonly [{
    readonly module: "admin";
    readonly action: "view";
    readonly description: "View founder and platform administration surfaces";
}, {
    readonly module: "analytics";
    readonly action: "view";
    readonly description: "View analytics dashboards and reports";
}, {
    readonly module: "dashboard";
    readonly action: "view";
    readonly description: "View dashboard summaries";
}, {
    readonly module: "patients";
    readonly action: "view";
    readonly description: "View patient records";
}, {
    readonly module: "patients";
    readonly action: "create";
    readonly description: "Create patient records";
}, {
    readonly module: "patients";
    readonly action: "update";
    readonly description: "Update patient records";
}, {
    readonly module: "patients";
    readonly action: "delete";
    readonly description: "Archive patient records";
}, {
    readonly module: "appointments";
    readonly action: "view";
    readonly description: "View appointment schedules";
}, {
    readonly module: "appointments";
    readonly action: "create";
    readonly description: "Create appointments";
}, {
    readonly module: "appointments";
    readonly action: "update";
    readonly description: "Update appointments";
}, {
    readonly module: "appointments";
    readonly action: "delete";
    readonly description: "Cancel appointments";
}, {
    readonly module: "queues";
    readonly action: "view";
    readonly description: "View queue status";
}, {
    readonly module: "queues";
    readonly action: "update";
    readonly description: "Update queue status";
}, {
    readonly module: "consultations";
    readonly action: "view";
    readonly description: "View consultations";
}, {
    readonly module: "consultations";
    readonly action: "create";
    readonly description: "Create consultations";
}, {
    readonly module: "consultations";
    readonly action: "update";
    readonly description: "Update consultations";
}, {
    readonly module: "prescriptions";
    readonly action: "view";
    readonly description: "View prescriptions";
}, {
    readonly module: "prescriptions";
    readonly action: "create";
    readonly description: "Create prescriptions";
}, {
    readonly module: "documents";
    readonly action: "view";
    readonly description: "View uploaded medical documents";
}, {
    readonly module: "documents";
    readonly action: "upload";
    readonly description: "Upload medical documents";
}, {
    readonly module: "follow_ups";
    readonly action: "view";
    readonly description: "View follow-up records";
}, {
    readonly module: "follow_ups";
    readonly action: "create";
    readonly description: "Create follow-up records";
}, {
    readonly module: "follow_ups";
    readonly action: "update";
    readonly description: "Update follow-up records";
}, {
    readonly module: "billing";
    readonly action: "view";
    readonly description: "View billing dashboards";
}, {
    readonly module: "invoices";
    readonly action: "view";
    readonly description: "View invoices";
}, {
    readonly module: "invoices";
    readonly action: "create";
    readonly description: "Create invoices";
}, {
    readonly module: "payments";
    readonly action: "view";
    readonly description: "View payments";
}, {
    readonly module: "payments";
    readonly action: "create";
    readonly description: "Record payments";
}, {
    readonly module: "communications";
    readonly action: "view";
    readonly description: "View communication center";
}, {
    readonly module: "messages";
    readonly action: "send";
    readonly description: "Send patient communications";
}, {
    readonly module: "feedback";
    readonly action: "view";
    readonly description: "View internal feedback";
}, {
    readonly module: "feedback";
    readonly action: "create";
    readonly description: "Create internal feedback";
}, {
    readonly module: "reviews";
    readonly action: "view";
    readonly description: "View reviews and referrals";
}, {
    readonly module: "tasks";
    readonly action: "view";
    readonly description: "View tasks";
}, {
    readonly module: "tasks";
    readonly action: "create";
    readonly description: "Create tasks";
}, {
    readonly module: "tasks";
    readonly action: "update";
    readonly description: "Update tasks";
}, {
    readonly module: "tasks";
    readonly action: "delete";
    readonly description: "Cancel tasks";
}, {
    readonly module: "settings";
    readonly action: "view";
    readonly description: "View settings";
}, {
    readonly module: "settings";
    readonly action: "branding";
    readonly description: "Manage clinic branding settings";
}, {
    readonly module: "users";
    readonly action: "view";
    readonly description: "View staff users";
}, {
    readonly module: "roles";
    readonly action: "view";
    readonly description: "View roles";
}, {
    readonly module: "permissions";
    readonly action: "view";
    readonly description: "View permissions";
}];
export declare const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]>;
