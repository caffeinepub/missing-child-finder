import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Status } from "../backend";
import Navbar from "../components/Navbar";
import { useActor } from "../hooks/useActor";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useRegisterCase } from "../hooks/useQueries";

interface FormData {
  name: string;
  age: string;
  lastLocation: string;
  contactNumber: string;
  lastSeenPlace: string;
  status: string;
}

const INITIAL_FORM: FormData = {
  name: "",
  age: "",
  lastLocation: "",
  contactNumber: "",
  lastSeenPlace: "",
  status: "active",
};

function mapStatus(val: string): Status {
  switch (val) {
    case "underReview":
      return Status.underReview;
    case "found":
      return Status.found;
    case "closed":
      return Status.closed;
    default:
      return Status.active;
  }
}

function isCanisterStoppedError(msg: string): boolean {
  return (
    msg.includes("IC0508") ||
    msg.includes("is stopped") ||
    msg.includes("canister is stopping")
  );
}

async function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 600;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.65));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const {
    actor,
    isFetching: actorLoading,
    isError: actorError,
    refetch: refetchActor,
  } = useActor();
  const { identity } = useInternetIdentity();
  const { mutateAsync: registerCase, isPending } = useRegisterCase();

  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    name: string;
    contact: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleField = (key: keyof FormData, val: string) => {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const handlePhoto = async (file: File) => {
    setPhotoFileName(file.name);
    setIsCompressing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = reader.result as string;
      const compressed = await compressImage(raw);
      setPhotoDataUrl(compressed);
      setIsCompressing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      handlePhoto(file);
    }
  };

  const validate = (): boolean => {
    const errs: Partial<FormData> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (
      !form.age.trim() ||
      Number.isNaN(Number(form.age)) ||
      Number(form.age) <= 0
    )
      errs.age = "Valid age is required";
    if (!form.lastLocation.trim())
      errs.lastLocation = "Last location is required";
    if (!form.contactNumber.trim())
      errs.contactNumber = "Contact number is required";
    if (!form.lastSeenPlace.trim())
      errs.lastSeenPlace = "Last seen place is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const attemptRegister = async (retries = 3): Promise<void> => {
    try {
      await registerCase({
        name: form.name.trim(),
        age: BigInt(Math.round(Number(form.age))),
        lastLocation: form.lastLocation.trim(),
        contactNumber: form.contactNumber.trim(),
        lastSeenPlace: form.lastSeenPlace.trim(),
        status: mapStatus(form.status),
        photoId: photoDataUrl ?? "",
      });
      setSuccessInfo({
        name: form.name.trim(),
        contact: form.contactNumber.trim(),
      });
      setForm(INITIAL_FORM);
      setPhotoDataUrl(null);
      setPhotoFileName(null);
    } catch (err: unknown) {
      const msg: string = (err as { message?: string })?.message ?? "";
      if (isCanisterStoppedError(msg) && retries > 0) {
        await new Promise((r) => setTimeout(r, 3000));
        return attemptRegister(retries - 1);
      }
      throw err;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!identity) {
      setSubmitError(
        "You must be logged in to register a case. Please log in first.",
      );
      return;
    }

    if (!validate()) return;

    if (!actor) {
      setSubmitError(
        "Backend connection failed. Please use the Retry button above or refresh the page.",
      );
      return;
    }

    if (isCompressing) {
      setSubmitError("Please wait for the photo to finish processing.");
      return;
    }

    try {
      await attemptRegister(3);
    } catch (err: unknown) {
      const msg: string = (err as { message?: string })?.message ?? "";
      if (isCanisterStoppedError(msg)) {
        setSubmitError(
          "The backend is temporarily restarting. Please wait 30 seconds and try again.",
        );
      } else if (msg.includes("already exists")) {
        setSubmitError(
          "A case with this contact number already exists. Please use a different contact number.",
        );
      } else if (
        msg.includes("Not authenticated") ||
        msg.includes("Unauthorized")
      ) {
        setSubmitError(
          "Your session expired. Please log out and log in again.",
        );
      } else {
        setSubmitError(msg || "Registration failed. Please try again.");
      }
    }
  };

  const isSubmitDisabled =
    isPending || actorLoading || !identity || isCompressing;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-foreground">
            Register Missing Child
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Fill in all details to register a missing child case
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Not logged in warning */}
        {!identity && !actorLoading && (
          <Alert
            variant="destructive"
            className="mb-6"
            data-ocid="register.error_state"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>You must be logged in to register a case.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate({ to: "/login" })}
                className="shrink-0"
                data-ocid="register.link"
              >
                Go to Login
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Actor loading indicator */}
        {actorLoading && identity && (
          <Alert
            className="mb-6 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
            data-ocid="register.loading_state"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              Connecting to backend — please wait a moment...
            </AlertDescription>
          </Alert>
        )}

        {/* Actor error — failed after all retries */}
        {actorError && !actorLoading && identity && (
          <Alert
            variant="destructive"
            className="mb-6"
            data-ocid="register.error_state"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                Backend connection failed. The canister may be temporarily
                unavailable.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetchActor()}
                className="shrink-0"
                data-ocid="register.secondary_button"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <AnimatePresence>
          {successInfo && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6"
              data-ocid="register.success_state"
            >
              <Alert className="border-success/30 bg-success/5">
                <CheckCircle className="h-4 w-4 text-success" />
                <AlertDescription className="text-success">
                  <strong>{successInfo.name}</strong> has been registered
                  successfully. Contact: <strong>{successInfo.contact}</strong>.
                  Authorities have been notified.
                </AlertDescription>
              </Alert>
              <div className="flex gap-3 mt-3">
                <Button
                  variant="outline"
                  onClick={() => setSuccessInfo(null)}
                  data-ocid="register.secondary_button"
                >
                  Register Another
                </Button>
                <Button
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="bg-primary text-primary-foreground"
                  data-ocid="register.primary_button"
                >
                  Go to Dashboard
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {submitError && (
          <Alert
            variant="destructive"
            className="mb-6"
            data-ocid="register.error_state"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{submitError}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSubmitError("")}
                className="shrink-0"
                data-ocid="register.close_button"
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <div className="bg-card rounded-xl border border-border shadow-card p-6 space-y-6">
            <h2 className="text-base font-semibold text-foreground border-b border-border pb-4">
              Child Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="child-name">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="child-name"
                  data-ocid="register.input"
                  placeholder="Enter child's full name"
                  value={form.name}
                  onChange={(e) => handleField("name", e.target.value)}
                  className={errors.name ? "border-destructive" : ""}
                />
                {errors.name && (
                  <p
                    className="text-xs text-destructive"
                    data-ocid="register.error_state"
                  >
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Age */}
              <div className="space-y-1.5">
                <Label htmlFor="child-age">
                  Age <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="child-age"
                  data-ocid="register.input"
                  type="number"
                  min="0"
                  max="18"
                  placeholder="Age in years"
                  value={form.age}
                  onChange={(e) => handleField("age", e.target.value)}
                  className={errors.age ? "border-destructive" : ""}
                />
                {errors.age && (
                  <p
                    className="text-xs text-destructive"
                    data-ocid="register.error_state"
                  >
                    {errors.age}
                  </p>
                )}
              </div>

              {/* Last Location */}
              <div className="space-y-1.5">
                <Label htmlFor="last-location">
                  Last Known Location{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="last-location"
                  data-ocid="register.input"
                  placeholder="e.g. Central Park, New York"
                  value={form.lastLocation}
                  onChange={(e) => handleField("lastLocation", e.target.value)}
                  className={errors.lastLocation ? "border-destructive" : ""}
                />
                {errors.lastLocation && (
                  <p
                    className="text-xs text-destructive"
                    data-ocid="register.error_state"
                  >
                    {errors.lastLocation}
                  </p>
                )}
              </div>

              {/* Contact Number */}
              <div className="space-y-1.5">
                <Label htmlFor="contact-number">
                  Contact Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contact-number"
                  data-ocid="register.input"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={form.contactNumber}
                  onChange={(e) => handleField("contactNumber", e.target.value)}
                  className={errors.contactNumber ? "border-destructive" : ""}
                />
                {errors.contactNumber && (
                  <p
                    className="text-xs text-destructive"
                    data-ocid="register.error_state"
                  >
                    {errors.contactNumber}
                  </p>
                )}
              </div>

              {/* Last Seen Place */}
              <div className="space-y-1.5">
                <Label htmlFor="last-seen">
                  Last Seen Place <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="last-seen"
                  data-ocid="register.input"
                  placeholder="e.g. School playground, Mall entrance"
                  value={form.lastSeenPlace}
                  onChange={(e) => handleField("lastSeenPlace", e.target.value)}
                  className={errors.lastSeenPlace ? "border-destructive" : ""}
                />
                {errors.lastSeenPlace && (
                  <p
                    className="text-xs text-destructive"
                    data-ocid="register.error_state"
                  >
                    {errors.lastSeenPlace}
                  </p>
                )}
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => handleField("status", v)}
                >
                  <SelectTrigger data-ocid="register.select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="underReview">Under Review</SelectItem>
                    <SelectItem value="found">Found</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Photo Upload */}
            <div className="space-y-2">
              <Label>Photo Upload</Label>
              <p className="text-xs text-muted-foreground">
                Accepts all image formats (JPG, PNG, WebP, HEIC, TIFF, GIF, BMP,
                etc.)
              </p>

              {isCompressing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing photo...
                </div>
              )}

              {photoDataUrl && !isCompressing ? (
                <div className="relative inline-block">
                  <img
                    src={photoDataUrl}
                    alt={form.name || "Child"}
                    className="w-32 h-32 rounded-xl object-cover border-2 border-secondary shadow"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoDataUrl(null);
                      setPhotoFileName(null);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow"
                    data-ocid="register.close_button"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-xs text-muted-foreground mt-1 truncate max-w-[8rem]">
                    {photoFileName}
                  </p>
                </div>
              ) : !isCompressing ? (
                <button
                  type="button"
                  data-ocid="register.dropzone"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-secondary bg-secondary/5"
                      : "border-border hover:border-secondary hover:bg-secondary/5"
                  }`}
                >
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">
                    Drop photo here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All image formats supported
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-ocid="register.upload_button"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhoto(file);
                    }}
                  />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/dashboard" })}
              data-ocid="register.cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90 min-w-[140px]"
              data-ocid="register.submit_button"
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registering...
                </span>
              ) : actorLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </span>
              ) : isCompressing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing photo...
                </span>
              ) : (
                "Register Case"
              )}
            </Button>
          </div>
        </form>
      </main>

      <footer className="bg-footer text-footer-foreground mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm text-center">
            &copy; {new Date().getFullYear()} Missing Child Finder. Built with
            love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              caffeine.ai
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
