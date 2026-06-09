"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPermissionNames = exports.extractRoleNames = exports.serializePermission = exports.normalizePermission = exports.normalizeRoleName = void 0;
const normalizeRoleName = (value) => (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
exports.normalizeRoleName = normalizeRoleName;
const normalizePermission = (value) => {
    if (!value) {
        return '';
    }
    const raw = value.trim().toLowerCase();
    const [module, action] = raw.split(/[:.]/).filter(Boolean);
    if (!module || !action) {
        return raw.replace(/:/g, '.').replace(/[-\s]+/g, '_');
    }
    return `${module.replace(/[-\s]+/g, '_')}.${action.replace(/[-\s]+/g, '_')}`;
};
exports.normalizePermission = normalizePermission;
const serializePermission = (module, action) => (0, exports.normalizePermission)(`${module}.${action}`);
exports.serializePermission = serializePermission;
const extractRoleNames = (roles = []) => roles
    .map((role) => {
    if (typeof role === 'string') {
        return role;
    }
    return role?.role?.name ?? role?.name;
})
    .filter(Boolean);
exports.extractRoleNames = extractRoleNames;
const extractPermissionNames = (roles = []) => Array.from(new Set(roles.flatMap((role) => {
    const rolePermissions = role?.role?.rolePermissions ?? role?.rolePermissions ?? [];
    return rolePermissions
        .map((item) => item?.permission)
        .filter(Boolean)
        .map((permission) => (0, exports.serializePermission)(permission.module, permission.action));
})));
exports.extractPermissionNames = extractPermissionNames;
//# sourceMappingURL=access.utils.js.map