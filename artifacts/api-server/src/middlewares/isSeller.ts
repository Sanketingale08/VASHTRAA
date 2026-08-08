/**
 * Requires the caller to be an authenticated, approved vendor.
 * Thin re-export of requireVendorAuth under the RBAC-standard name.
 */
export { requireVendorAuth as isSeller } from "./requireVendorAuth";
