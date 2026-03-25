import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface ChildRecord {
    age: bigint;
    status: Status;
    lastSeenPlace: string;
    lastLocation: string;
    name: string;
    contactNumber: string;
    photoId: string;
}
export interface Alert {
    message: string;
    contactNumber: string;
}
export interface DashboardStats {
    totalCases: bigint;
    activeCases: bigint;
    foundCases: bigint;
}
export interface UserProfile {
    name: string;
}
export enum Status {
    found = "found",
    closed = "closed",
    active = "active",
    underReview = "underReview"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addAlert(input: [string, string]): Promise<void>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    claimAdminRole(password: string): Promise<void>;
    deleteCase(contactNumber: string): Promise<void>;
    getAlerts(): Promise<Array<Alert>>;
    getAllCases(): Promise<Array<ChildRecord>>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getCase(contactNumber: string): Promise<ChildRecord>;
    getDashboardStats(): Promise<DashboardStats>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    registerCase(newRecord: ChildRecord): Promise<void>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    updateCaseStatus(input: [string, Status]): Promise<void>;
    updateStatusToFound(contactNumber: string): Promise<void>;
}
