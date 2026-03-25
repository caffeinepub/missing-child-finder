import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Runtime "mo:core/Runtime";
import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";



actor {
  include MixinStorage();
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  public type UserProfile = {
    name : Text;
  };

  let userProfiles = Map.empty<Principal, UserProfile>();

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in");
    };
    userProfiles.add(caller, profile);
  };

  public type Status = {
    #active;
    #underReview;
    #found;
    #closed;
  };

  public type ChildRecord = {
    name : Text;
    age : Nat;
    lastLocation : Text;
    contactNumber : Text;
    lastSeenPlace : Text;
    photoId : Text;
    status : Status;
  };

  public type Alert = {
    contactNumber : Text;
    message : Text;
  };

  public type DashboardStats = {
    totalCases : Nat;
    activeCases : Nat;
    foundCases : Nat;
  };

  let records = Map.empty<Text, ChildRecord>();
  let alerts = Map.empty<Text, Alert>();

  public shared ({ caller }) func registerCase(newRecord : ChildRecord) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in to register cases");
    };
    if (records.containsKey(newRecord.contactNumber)) {
      Runtime.trap("Case with this contact number already exists");
    };
    records.add(newRecord.contactNumber, newRecord);
  };

  public query func getAllCases() : async [ChildRecord] {
    records.values().toArray();
  };

  public query func getCase(contactNumber : Text) : async ChildRecord {
    switch (records.get(contactNumber)) {
      case (null) { Runtime.trap("Case not found") };
      case (?record) { record };
    };
  };

  public shared ({ caller }) func updateCaseStatus(input : (Text, Status)) : async () {
    let (contactNumber, newStatus) = input;
    if (not (AccessControl.isAdmin(accessControlState, caller))) {
      Runtime.trap("Unauthorized: Only admins can update case status");
    };
    switch (records.get(contactNumber)) {
      case (null) { Runtime.trap("Case not found") };
      case (?record) {
        let updatedRecord = {
          record with
          status = newStatus;
        };
        records.add(contactNumber, updatedRecord);
      };
    };
  };

  public shared ({ caller }) func deleteCase(contactNumber : Text) : async () {
    if (not (AccessControl.isAdmin(accessControlState, caller))) {
      Runtime.trap("Unauthorized: Only admins can delete cases");
    };
    if (not records.containsKey(contactNumber)) {
      Runtime.trap("Case not found");
    };
    records.remove(contactNumber);
  };

  public shared ({ caller }) func updateStatusToFound(contactNumber : Text) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in");
    };
    switch (records.get(contactNumber)) {
      case (null) { Runtime.trap("Case not found") };
      case (?record) {
        let updatedRecord = {
          record with
          status = #found;
        };
        records.add(contactNumber, updatedRecord);
      };
    };
  };

  public shared ({ caller }) func addAlert(input : (Text, Text)) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: Must be logged in");
    };
    let (contactNumber, message) = input;
    let alert = { contactNumber; message };
    alerts.add(contactNumber, alert);
  };

  public query ({ caller }) func getAlerts() : async [Alert] {
    if (not (AccessControl.isAdmin(accessControlState, caller))) {
      Runtime.trap("Unauthorized: Only admins can view alerts");
    };
    alerts.values().toArray();
  };

  public query func getDashboardStats() : async DashboardStats {
    var active = 0;
    var found = 0;
    for (record in records.values()) {
      switch (record.status) {
        case (#active) { active += 1 };
        case (#underReview) { active += 1 };
        case (#found) { found += 1 };
        case (#closed) {};
      };
    };
    {
      totalCases = records.size();
      activeCases = active;
      foundCases = found;
    };
  };

  public shared ({ caller }) func claimAdminRole(password : Text) : async () {
    if (password == "admin123") {
      accessControlState.userRoles.add(caller, #admin);
      accessControlState.adminAssigned := true;
    } else {
      Runtime.trap("Invalid password for admin role");
    };
  };
};
